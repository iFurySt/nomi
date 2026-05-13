package app

import (
	"errors"
	"time"
)

const (
	RecordStatusPending    = "pending"
	RecordStatusProcessing = "processing"
	RecordStatusCompleted  = "completed"
	RecordStatusFailed     = "failed"
)

type Record struct {
	ID         string            `json:"id"`
	Type       string            `json:"type"`
	Status     string            `json:"status"`
	OccurredAt time.Time         `json:"occurred_at"`
	CreatedAt  time.Time         `json:"created_at"`
	Source     string            `json:"source"`
	Title      string            `json:"title"`
	Summary    string            `json:"summary"`
	RawText    string            `json:"raw_text,omitempty"`
	ImageURI   string            `json:"image_uri,omitempty"`
	Metadata   map[string]string `json:"metadata"`
	Confidence *float64          `json:"confidence,omitempty"`
}

type CreateRecordInput struct {
	Type       string            `json:"type"`
	Status     string            `json:"status,omitempty"`
	OccurredAt *time.Time        `json:"occurred_at,omitempty"`
	Source     string            `json:"source"`
	Title      string            `json:"title"`
	Summary    string            `json:"summary"`
	RawText    string            `json:"raw_text,omitempty"`
	ImageURI   string            `json:"image_uri,omitempty"`
	Metadata   map[string]string `json:"metadata,omitempty"`
	Confidence *float64          `json:"confidence,omitempty"`
}

func (i CreateRecordInput) Validate() error {
	if !validRecordType(i.Type) {
		return errors.New("invalid_record_type")
	}
	if i.Status != "" && !validRecordStatus(i.Status) {
		return errors.New("invalid_record_status")
	}
	if i.Source == "" {
		return errors.New("source_required")
	}
	if i.Title == "" {
		return errors.New("title_required")
	}
	if i.Summary == "" {
		return errors.New("summary_required")
	}
	return nil
}

func validRecordType(recordType string) bool {
	switch recordType {
	case "food", "body_stats", "document", "note":
		return true
	default:
		return false
	}
}

func validRecordStatus(status string) bool {
	switch status {
	case RecordStatusPending, RecordStatusProcessing, RecordStatusCompleted, RecordStatusFailed:
		return true
	default:
		return false
	}
}
