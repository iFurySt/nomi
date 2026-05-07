package app

import (
	"bytes"
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

	handler := NewHandler(nil, zap.NewNop(), "")
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	payload := bytes.NewBufferString(`{"asset_name":"coffee.jpg","source":"library","mime_type":"image/jpeg"}`)
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
}
