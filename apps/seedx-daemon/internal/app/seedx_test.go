package app

import (
	"testing"
	"time"
)

func TestSeedXEventShape(t *testing.T) {
	t.Parallel()

	event := SeedXEvent{
		ID:        "event-1",
		Type:      "daemon.ready",
		CreatedAt: time.Date(2026, 5, 6, 8, 0, 0, 0, time.UTC),
		Payload: map[string]any{
			"runtime": "test",
		},
	}

	if event.ID == "" {
		t.Fatal("expected id")
	}
	if event.Type != "daemon.ready" {
		t.Fatalf("unexpected event type: %s", event.Type)
	}
}
