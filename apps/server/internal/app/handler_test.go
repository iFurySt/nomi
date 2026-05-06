package app

import (
	"testing"
	"time"
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
