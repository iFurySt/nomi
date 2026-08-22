package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const (
	RoleOwner           = "owner"
	RoleMember          = "member"
	JobKindIngest       = "ingest"
	JobKindChat         = "chat"
	JobStatusQueued     = "queued"
	JobStatusProcessing = "processing"
	JobStatusCompleted  = "completed"
	JobStatusFailed     = "failed"
)

type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	CreatedAt   time.Time `json:"created_at"`
}
type Household struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}
type Principal struct {
	UserID      string
	HouseholdID string
	Role        string
}
type AuthIdentity struct {
	User         User
	PasswordHash string
	Household    Household
}
type AuthResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	User      User      `json:"user"`
	Household Household `json:"household"`
}

type Person struct {
	ID           string    `json:"id"`
	HouseholdID  string    `json:"household_id"`
	DisplayName  string    `json:"display_name"`
	Relationship string    `json:"relationship"`
	CreatedBy    string    `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Asset struct {
	ID              string          `json:"id"`
	HouseholdID     string          `json:"household_id"`
	PersonID        *string         `json:"person_id,omitempty"`
	CreatedBy       string          `json:"created_by"`
	StorageProvider string          `json:"storage_provider"`
	StorageKey      string          `json:"-"`
	OriginalName    string          `json:"original_name"`
	MimeType        string          `json:"mime_type"`
	SizeBytes       int64           `json:"size_bytes"`
	SHA256          string          `json:"sha256"`
	Status          string          `json:"status"`
	Analysis        json.RawMessage `json:"analysis,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type Job struct {
	ID          string          `json:"id"`
	HouseholdID string          `json:"household_id"`
	PersonID    *string         `json:"person_id,omitempty"`
	CreatedBy   string          `json:"created_by"`
	Kind        string          `json:"kind"`
	Status      string          `json:"status"`
	Payload     json.RawMessage `json:"payload"`
	Result      json.RawMessage `json:"result,omitempty"`
	Error       string          `json:"error,omitempty"`
	Attempts    int             `json:"attempts"`
	CreatedAt   time.Time       `json:"created_at"`
	StartedAt   *time.Time      `json:"started_at,omitempty"`
	CompletedAt *time.Time      `json:"completed_at,omitempty"`
}

type Thread struct {
	ID          string    `json:"id"`
	HouseholdID string    `json:"household_id"`
	PersonID    *string   `json:"person_id,omitempty"`
	CreatedBy   string    `json:"created_by"`
	Title       string    `json:"title"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
type Message struct {
	ID          string          `json:"id"`
	HouseholdID string          `json:"household_id"`
	ThreadID    string          `json:"thread_id"`
	UserID      *string         `json:"user_id,omitempty"`
	Role        string          `json:"role"`
	Content     string          `json:"content"`
	Citations   json.RawMessage `json:"citations,omitempty"`
	Status      string          `json:"status"`
	CreatedAt   time.Time       `json:"created_at"`
}

type AgentResult struct {
	Title             string   `json:"title"`
	Answer            string   `json:"answer"`
	Summary           string   `json:"summary"`
	Changes           string   `json:"changes"`
	CurrentAssessment string   `json:"current_assessment"`
	OpenQuestions     []string `json:"open_questions"`
	Citations         []string `json:"citations"`
}

func (r AgentResult) Validate(kind string) error {
	if kind == JobKindChat && strings.TrimSpace(r.Answer) == "" {
		return errors.New("agent_answer_required")
	}
	if kind == JobKindIngest && strings.TrimSpace(r.Summary) == "" {
		return errors.New("agent_summary_required")
	}
	return nil
}
func normalizeEmail(value string) string       { return strings.ToLower(strings.TrimSpace(value)) }
func normalizeDisplayName(value string) string { return strings.TrimSpace(value) }
