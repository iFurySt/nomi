package app

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"
)

type Store interface {
	Ping(ctx context.Context) error
	EnsureSchema(ctx context.Context) error
	ListRecords(ctx context.Context) ([]Record, error)
	CreateRecord(ctx context.Context, input CreateRecordInput) (Record, error)
}

type Handler struct {
	store       Store
	logger      *zap.Logger
	seedXAPIKey string
}

func NewHandler(store Store, logger *zap.Logger, seedXAPIKey string) *Handler {
	return &Handler{
		store:       store,
		logger:      logger,
		seedXAPIKey: seedXAPIKey,
	}
}

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.health)
	mux.HandleFunc("GET /records", h.listRecords)
	mux.HandleFunc("POST /records", h.createRecord)
	mux.HandleFunc("POST /ai/extract-image", h.extractImage)
	mux.HandleFunc("POST /ask", h.ask)
	mux.HandleFunc("GET /daemon/connect", h.seedXWebSocket)
	mux.HandleFunc("GET /seedx/ws", h.seedXWebSocket)
	return withJSONHeaders(mux)
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	status := "ok"
	database := "ok"
	if err := h.store.Ping(r.Context()); err != nil {
		status = "degraded"
		database = "error"
		h.logger.Warn("healthcheck database ping failed", zap.Error(err))
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":   status,
		"database": database,
	})
}

func (h *Handler) listRecords(w http.ResponseWriter, r *http.Request) {
	records, err := h.store.ListRecords(r.Context())
	if err != nil {
		h.logger.Error("list records failed", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "records_unavailable")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"records": records})
}

func (h *Handler) createRecord(w http.ResponseWriter, r *http.Request) {
	var input CreateRecordInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	if err := input.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	record, err := h.store.CreateRecord(r.Context(), input)
	if err != nil {
		h.logger.Error("create record failed", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "record_create_failed")
		return
	}

	writeJSON(w, http.StatusCreated, record)
}

func (h *Handler) extractImage(w http.ResponseWriter, r *http.Request) {
	var input ImageExtractionRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	if input.AssetName == "" {
		writeError(w, http.StatusBadRequest, "asset_name_required")
		return
	}

	extraction := BuildImageExtraction(input)
	h.logger.Info(
		"image extraction completed",
		zap.String("asset_name", input.AssetName),
		zap.String("source", input.Source),
		zap.String("input_category", extraction.InputCategory),
		zap.Float64("confidence", extraction.Confidence),
	)
	writeJSON(w, http.StatusOK, extraction)
}

func (h *Handler) ask(w http.ResponseWriter, r *http.Request) {
	var input AskRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	records, err := h.store.ListRecords(r.Context())
	if err != nil {
		h.logger.Error("ask records lookup failed", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "records_unavailable")
		return
	}

	answer := BuildAskAnswer(input.Question, records)
	writeJSON(w, http.StatusOK, answer)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

func withJSONHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

type AskRequest struct {
	Question string `json:"question"`
}

type AskAnswer struct {
	Blocked             bool     `json:"blocked"`
	Answer              string   `json:"answer"`
	ReferencedRecordIDs []string `json:"referenced_record_ids"`
	Range               string   `json:"range"`
}

func BuildAskAnswer(question string, records []Record) AskAnswer {
	referenced := make([]string, 0, min(len(records), 4))
	for i, record := range records {
		if i >= 4 {
			break
		}
		referenced = append(referenced, record.ID)
	}

	recordRange := "no saved records yet"
	if len(records) > 0 {
		recordRange = records[len(records)-1].OccurredAt.Format(time.RFC3339) + " to " + records[0].OccurredAt.Format(time.RFC3339)
	}

	if HasMedicalIntent(question) {
		return AskAnswer{
			Blocked:             true,
			Answer:              "I can help organize and review your saved records, but I cannot provide diagnosis or medical advice. For medical decisions, please consult a qualified professional.",
			ReferencedRecordIDs: referenced,
			Range:               recordRange,
		}
	}

	return AskAnswer{
		Blocked:             false,
		Answer:              "Based on saved records, I can summarize food, body, image, and note patterns. This mock answer only uses stored records and will not invent missing personal data.",
		ReferencedRecordIDs: referenced,
		Range:               recordRange,
	}
}

func HasMedicalIntent(question string) bool {
	normalized := strings.ToLower(question)
	patterns := []string{
		"diagnos",
		"treat",
		"medicine",
		"medication",
		"dosage",
		"disease risk",
		"emergency",
		"abnormal",
		"诊断",
		"治疗",
		"用药",
		"剂量",
		"疾病风险",
		"急症",
		"异常",
	}

	for _, pattern := range patterns {
		if strings.Contains(normalized, pattern) {
			return true
		}
	}

	return false
}
