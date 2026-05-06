package app

import (
	"encoding/json"
	"testing"
	"time"
)

func TestMarshalSeedXEvent(t *testing.T) {
	t.Parallel()

	event := SeedXEvent{
		ID:        "event-1",
		Type:      "seedx.request",
		CreatedAt: time.Date(2026, 5, 6, 8, 0, 0, 0, time.UTC),
		Payload: map[string]any{
			"prompt": "hello",
		},
	}

	data, err := marshalSeedXEvent(event)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded SeedXEvent
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if decoded.Type != "seedx.request" {
		t.Fatalf("unexpected type: %s", decoded.Type)
	}
}
