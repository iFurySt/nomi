package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestHasMedicalIntent(t *testing.T) {
	t.Parallel()

	if !HasMedicalIntent("Can you diagnose this abnormal result?") {
		t.Fatal("expected medical intent to be detected")
	}

	if HasMedicalIntent("How much protein did I save this week?") {
		t.Fatal("did not expect lifestyle record question to be blocked")
	}
}

func TestBuildAskAnswer(t *testing.T) {
	t.Parallel()

	records := []Record{
		{ID: "rec-1", Type: "food", OccurredAt: time.Date(2026, 5, 6, 8, 0, 0, 0, time.UTC)},
	}

	answer := BuildAskAnswer("Should I take medicine?", records)
	if !answer.Blocked {
		t.Fatal("expected medical question to be blocked")
	}
	if len(answer.ReferencedRecordIDs) != 1 || answer.ReferencedRecordIDs[0] != "rec-1" {
		t.Fatalf("unexpected references: %#v", answer.ReferencedRecordIDs)
	}

	answer = BuildAskAnswer("What food records did I save?", records)
	if answer.Blocked {
		t.Fatal("did not expect normal record question to be blocked")
	}
}

func TestCreateRecordInputValidate(t *testing.T) {
	t.Parallel()

	input := CreateRecordInput{
		Type:    "food",
		Source:  "manual",
		Title:   "Lunch",
		Summary: "Rice bowl",
	}
	if err := input.Validate(); err != nil {
		t.Fatalf("expected valid input: %v", err)
	}

	input.Type = "diagnosis"
	if err := input.Validate(); err == nil {
		t.Fatal("expected invalid record type")
	}
}

func TestStoredImageFileNameNormalizesUppercaseExtension(t *testing.T) {
	t.Parallel()

	name := storedImageFileName("IMG_7605.JPG", "image/jpeg")
	if strings.Contains(name, ".JPG.jpg") {
		t.Fatalf("expected uppercase extension to be normalized once: %s", name)
	}
	if !strings.HasSuffix(name, ".jpg") {
		t.Fatalf("expected jpg extension: %s", name)
	}
}

func TestServeImageHandler(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.MkdirAll(dir+"/2026-05", 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dir+"/2026-05/sample.jpg", []byte("image-bytes"), 0o600); err != nil {
		t.Fatal(err)
	}

	handler := NewHandler(
		&fakeStore{},
		zap.NewNop(),
		"",
		WithImageStorageDir(dir),
		WithImageAnalyzer(fakeImageAnalyzer{}),
	)
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	resp, err := http.Get(server.URL + "/images/2026-05/sample.jpg")
	if err != nil {
		t.Fatalf("get image: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if strings.Contains(resp.Header.Get("Content-Type"), "application/json") {
		t.Fatalf("unexpected json content type: %s", resp.Header.Get("Content-Type"))
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "image-bytes" {
		t.Fatalf("body = %q", string(body))
	}
}

func TestServeImageHandlerUsesHEICDisplayJPEG(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.MkdirAll(dir+"/2026-05", 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dir+"/2026-05/sample.heic", []byte("heic-bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dir+"/2026-05/sample-seedx.jpg", []byte("jpeg-bytes"), 0o600); err != nil {
		t.Fatal(err)
	}

	handler := NewHandler(
		&fakeStore{},
		zap.NewNop(),
		"",
		WithImageStorageDir(dir),
		WithImageAnalyzer(fakeImageAnalyzer{}),
	)
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	resp, err := http.Get(server.URL + "/images/2026-05/sample.heic")
	if err != nil {
		t.Fatalf("get image: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "jpeg-bytes" {
		t.Fatalf("body = %q", string(body))
	}
}

func TestExtractImageHandler(t *testing.T) {
	t.Parallel()

	handler := NewHandler(
		&fakeStore{},
		zap.NewNop(),
		"",
		WithImageStorageDir(t.TempDir()),
		WithImageAnalyzer(fakeImageAnalyzer{}),
	)
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	payload := bytes.NewBufferString(`{"asset_name":"coffee.jpg","source":"library","mime_type":"image/jpeg","image_base64":"aGVsbG8="}`)
	resp, err := http.Post(server.URL+"/ai/extract-image", "application/json", payload)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var output struct {
		Record Record `json:"record"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&output); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if output.Record.ID == "" || output.Record.Status != RecordStatusPending || output.Record.ImageURI == "" {
		t.Fatalf("expected pending uploaded record: %#v", output.Record)
	}
	if output.Record.Metadata["analysis_provider"] != "seedx.codex" {
		t.Fatalf("metadata = %#v", output.Record.Metadata)
	}
}

func TestDeleteRecordHandler(t *testing.T) {
	t.Parallel()

	handler := NewHandler(
		&fakeStore{},
		zap.NewNop(),
		"",
		WithImageStorageDir(t.TempDir()),
		WithImageAnalyzer(fakeImageAnalyzer{}),
	)
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	request, err := http.NewRequest(http.MethodDelete, server.URL+"/records/rec-test", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}

func TestDeleteRecordHandlerNotFound(t *testing.T) {
	t.Parallel()

	handler := NewHandler(
		&fakeStore{},
		zap.NewNop(),
		"",
		WithImageStorageDir(t.TempDir()),
		WithImageAnalyzer(fakeImageAnalyzer{}),
	)
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	request, err := http.NewRequest(http.MethodDelete, server.URL+"/records/missing", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}

func TestParseImageExtractionJSONAllowsMarkdownFence(t *testing.T) {
	t.Parallel()

	extraction, err := ParseImageExtractionJSON("```json\n" + `{
		"schema_version": "ignored",
		"direction": "input",
		"input_category": "food",
		"output_impacts": ["energy", "health"],
		"title": "Lunch bowl",
		"summary": "A mixed meal with visible rice and protein.",
		"confidence": 0.78,
		"metadata": {
			"estimated_from": ["image_content"],
			"calories_kcal": 520
		}
	}` + "\n```")
	if err != nil {
		t.Fatal(err)
	}
	if extraction.Title != "Lunch bowl" || extraction.Metadata.CaloriesKcal != 520 {
		t.Fatalf("extraction = %#v", extraction)
	}
}

func TestParseImageExtractionJSONAllowsNormalizableFields(t *testing.T) {
	t.Parallel()

	extraction, err := ParseImageExtractionJSON(`{
		"title": "Visible receipt"
	}`)
	if err != nil {
		t.Fatal(err)
	}
	if extraction.Title != "Visible receipt" || extraction.Summary != "Visible receipt" {
		t.Fatalf("extraction = %#v", extraction)
	}
	if extraction.InputCategory != "information" {
		t.Fatalf("input category = %q", extraction.InputCategory)
	}
	if got := extraction.Metadata.EstimatedFrom; len(got) != 1 || got[0] != "image_content" {
		t.Fatalf("estimated_from = %#v", got)
	}
}

func TestParseImageExtractionJSONRequiresTitle(t *testing.T) {
	t.Parallel()

	if _, err := ParseImageExtractionJSON(`{"summary":"missing title"}`); !errors.Is(err, ErrSeedXInvalidResponse) {
		t.Fatalf("err = %v", err)
	}
}

func TestBuildImageAnalysisInputUsesSeedXLocalImageItem(t *testing.T) {
	t.Parallel()

	input := BuildImageAnalysisInput(StoredImage{
		AssetName: "receipt.jpg",
		Source:    "file",
		MimeType:  "image/jpeg",
		Path:      "/tmp/nomi/receipt.jpg",
		SizeBytes: 42,
	})

	if len(input) != 2 {
		t.Fatalf("input = %#v", input)
	}
	prompt := input[0].Text
	if input[0].Type != "text" || input[1].Type != "localImage" {
		t.Fatalf("input = %#v", input)
	}
	if input[1].Path != "/tmp/nomi/receipt.jpg" || input[1].Name != "receipt.jpg" {
		t.Fatalf("local image item = %#v", input[1])
	}
	if strings.Contains(prompt, "/tmp/nomi/receipt.jpg") {
		t.Fatal("expected prompt to omit local image path")
	}
	if !strings.Contains(prompt, "Return exactly one JSON object and no markdown") {
		t.Fatal("expected strict JSON output instruction")
	}
	if !strings.Contains(prompt, "Never diagnose") {
		t.Fatal("expected non-medical boundary")
	}
	if !json.Valid(ImageExtractionOutputSchema()) {
		t.Fatal("expected valid output schema")
	}
}

type fakeImageAnalyzer struct{}

func (fakeImageAnalyzer) AnalyzeImage(_ context.Context, image StoredImage) (ImageExtraction, error) {
	return NormalizeImageExtraction(ImageExtraction{
		Direction:     "input",
		InputCategory: "caffeine",
		OutputImpacts: []string{"energy", "focus", "sleep"},
		Title:         "Coffee",
		Summary:       "A visible cup of coffee.",
		Confidence:    0.74,
		Metadata: ExtractionMetadata{
			PortionEstimate: "one cup",
			CaloriesKcal:    30,
			CaffeineMg:      95,
			EstimatedFrom:   []string{"image_content"},
		},
	}, image), nil
}

type fakeStore struct{}

func (fakeStore) Ping(context.Context) error {
	return nil
}

func (fakeStore) EnsureSchema(context.Context) error {
	return nil
}

func (fakeStore) ListRecords(context.Context) ([]Record, error) {
	return nil, nil
}

func (fakeStore) CreateRecord(_ context.Context, input CreateRecordInput) (Record, error) {
	now := time.Now()
	status := input.Status
	if status == "" {
		status = RecordStatusCompleted
	}
	return Record{
		ID:         "rec-test",
		Type:       input.Type,
		Status:     status,
		OccurredAt: now,
		CreatedAt:  now,
		Source:     input.Source,
		Title:      input.Title,
		Summary:    input.Summary,
		RawText:    input.RawText,
		ImageURI:   input.ImageURI,
		Metadata:   input.Metadata,
		Confidence: input.Confidence,
	}, nil
}

func (fakeStore) DeleteRecord(_ context.Context, id string) (bool, error) {
	return id == "rec-test", nil
}

func (fakeStore) UpdateRecordStatus(_ context.Context, id string, status string, metadata map[string]string) (Record, error) {
	now := time.Now()
	return Record{
		ID:         id,
		Type:       "document",
		Status:     status,
		OccurredAt: now,
		CreatedAt:  now,
		Source:     "macos-file",
		Title:      "图片识别中",
		Summary:    "已上传，等待 Nomi server 通过 SeedX 识别。",
		ImageURI:   "local://images/test.jpg",
		Metadata:   metadata,
	}, nil
}

func (fakeStore) CompleteRecordWithExtraction(_ context.Context, id string, extraction ImageExtraction, image StoredImage) (Record, error) {
	now := time.Now()
	confidence := extraction.Confidence
	return Record{
		ID:         id,
		Type:       recordTypeForInputCategory(extraction.InputCategory),
		Status:     RecordStatusCompleted,
		OccurredAt: now,
		CreatedAt:  now,
		Source:     image.Source,
		Title:      extraction.Title,
		Summary:    extractionSummary(extraction),
		RawText:    extraction.Summary,
		ImageURI:   image.URI,
		Metadata:   extractionRecordMetadata(extraction, image),
		Confidence: &confidence,
	}, nil
}
