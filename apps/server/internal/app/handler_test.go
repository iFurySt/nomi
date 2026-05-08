package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestBuildImageExtractionFoodMetadata(t *testing.T) {
	t.Parallel()

	extraction := BuildImageExtraction(ImageExtractionRequest{
		AssetName:   "lunch-photo.jpg",
		Source:      "library",
		MimeType:    "image/jpeg",
		ImageBase64: "aGVsbG8=",
	})

	if extraction.Direction != "input" {
		t.Fatalf("direction = %q", extraction.Direction)
	}
	if extraction.InputCategory != "food" {
		t.Fatalf("input category = %q", extraction.InputCategory)
	}
	if extraction.Metadata.CaloriesKcal == 0 || extraction.Metadata.ProteinG == 0 {
		t.Fatalf("expected nutrition metadata: %#v", extraction.Metadata)
	}
	if len(extraction.OutputImpacts) == 0 {
		t.Fatal("expected output impacts")
	}
}

func TestBuildImageExtractionFileImageDefaultsFood(t *testing.T) {
	t.Parallel()

	extraction := BuildImageExtraction(ImageExtractionRequest{
		AssetName: "IMG_7624.HEIC",
		Source:    "file",
		MimeType:  "image/heic",
	})

	if extraction.InputCategory != "food" {
		t.Fatalf("input category = %q", extraction.InputCategory)
	}
	if extraction.Metadata.OriginalMimeType != "image/heic" {
		t.Fatalf("mime = %q", extraction.Metadata.OriginalMimeType)
	}
}

func TestBuildImageExtractionNicotine(t *testing.T) {
	t.Parallel()

	extraction := BuildImageExtraction(ImageExtractionRequest{
		AssetName: "vape-note.jpg",
		Source:    "library",
		MimeType:  "image/jpeg",
	})

	if extraction.InputCategory != "nicotine" {
		t.Fatalf("input category = %q", extraction.InputCategory)
	}
	if extraction.Metadata.NicotineMg == 0 {
		t.Fatalf("expected nicotine metadata: %#v", extraction.Metadata)
	}
	if !containsAny(strings.Join(extraction.OutputImpacts, ","), "focus") {
		t.Fatalf("expected focus impact: %#v", extraction.OutputImpacts)
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

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var extraction ImageExtraction
	if err := json.NewDecoder(resp.Body).Decode(&extraction); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if extraction.InputCategory != "caffeine" {
		t.Fatalf("input category = %q", extraction.InputCategory)
	}
	if extraction.RecordID == "" || extraction.ImageURI == "" {
		t.Fatalf("expected persisted extraction identifiers: %#v", extraction)
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

func TestBuildImageAnalysisPromptHasStrictJSONAndImagePath(t *testing.T) {
	t.Parallel()

	prompt := BuildImageAnalysisPrompt(StoredImage{
		AssetName: "receipt.jpg",
		Source:    "file",
		MimeType:  "image/jpeg",
		Path:      "/tmp/nomi/receipt.jpg",
		SizeBytes: 42,
	})

	if !strings.Contains(prompt, "/tmp/nomi/receipt.jpg") {
		t.Fatal("expected prompt to include local image path")
	}
	if !strings.Contains(prompt, "Return exactly one JSON object and no markdown") {
		t.Fatal("expected strict JSON output instruction")
	}
	if !strings.Contains(prompt, "Never diagnose") {
		t.Fatal("expected non-medical boundary")
	}
}

type fakeImageAnalyzer struct{}

func (fakeImageAnalyzer) AnalyzeImage(_ context.Context, image StoredImage) (ImageExtraction, error) {
	extraction := BuildImageExtraction(ImageExtractionRequest{
		AssetName:   image.AssetName,
		Source:      image.Source,
		MimeType:    image.MimeType,
		ImageBase64: "aGVsbG8=",
	})
	return NormalizeImageExtraction(extraction, image), nil
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
	return Record{
		ID:         "rec-test",
		Type:       input.Type,
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
