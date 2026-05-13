package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"go.uber.org/zap"
)

type Store interface {
	Ping(ctx context.Context) error
	EnsureSchema(ctx context.Context) error
	ListRecords(ctx context.Context) ([]Record, error)
	CreateRecord(ctx context.Context, input CreateRecordInput) (Record, error)
	UpdateRecordStatus(ctx context.Context, id string, status string, metadata map[string]string) (Record, error)
	CompleteRecordWithExtraction(ctx context.Context, id string, extraction ImageExtraction, image StoredImage) (Record, error)
}

type Handler struct {
	store         Store
	logger        *zap.Logger
	seedXAPIKey   string
	seedX         *SeedXController
	imageStore    *FileImageStore
	imageAnalyzer ImageAnalyzer
}

type HandlerOption func(*Handler)

func WithImageStorageDir(dir string) HandlerOption {
	return func(h *Handler) {
		h.imageStore = NewFileImageStore(dir)
	}
}

func WithImageAnalyzer(analyzer ImageAnalyzer) HandlerOption {
	return func(h *Handler) {
		h.imageAnalyzer = analyzer
	}
}

func WithSeedXAnalyzerOptions(options SeedXImageAnalyzerOptions) HandlerOption {
	return func(h *Handler) {
		h.imageAnalyzer = NewSeedXImageAnalyzer(h.seedX, options)
	}
}

func NewHandler(store Store, logger *zap.Logger, seedXAPIKey string, options ...HandlerOption) *Handler {
	if logger == nil {
		logger = zap.NewNop()
	}
	controller := NewSeedXController(logger)
	h := &Handler{
		store:       store,
		logger:      logger,
		seedXAPIKey: seedXAPIKey,
		seedX:       controller,
		imageStore:  NewFileImageStore(defaultImageStorageDir()),
	}
	for _, option := range options {
		option(h)
	}
	if h.imageAnalyzer == nil {
		h.imageAnalyzer = NewSeedXImageAnalyzer(h.seedX, SeedXImageAnalyzerOptions{
			CWD: defaultCodexCWD(),
		})
	}
	return h
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
	r.Body = http.MaxBytesReader(w, r.Body, maxImageRequestBodyBytes)

	var input ImageExtractionRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	if input.AssetName == "" {
		writeError(w, http.StatusBadRequest, "asset_name_required")
		return
	}

	storedImage, err := h.imageStore.Save(r.Context(), input)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrImageTooLarge) {
			status = http.StatusRequestEntityTooLarge
		}
		writeError(w, status, err.Error())
		return
	}

	record, err := h.createPendingImageRecord(r.Context(), storedImage)
	if err != nil {
		h.logger.Error("create pending image record failed", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "record_create_failed")
		return
	}

	go h.analyzeImageRecord(record.ID, storedImage)

	h.logger.Info(
		"image extraction queued",
		zap.String("record_id", record.ID),
		zap.String("asset_name", input.AssetName),
		zap.String("source", input.Source),
	)
	writeJSON(w, http.StatusAccepted, map[string]any{"record": record})
}

func (h *Handler) createPendingImageRecord(ctx context.Context, image StoredImage) (Record, error) {
	if h.store == nil {
		return Record{}, errors.New("record_store_unavailable")
	}

	return h.store.CreateRecord(ctx, CreateRecordInput{
		Type:     "document",
		Status:   RecordStatusPending,
		Source:   image.Source,
		Title:    "图片识别中",
		Summary:  "已上传，等待 Nomi server 通过 SeedX 识别。",
		ImageURI: image.URI,
		Metadata: pendingImageRecordMetadata(image),
	})
}

func (h *Handler) analyzeImageRecord(recordID string, image StoredImage) {
	ctx := context.Background()
	if _, err := h.store.UpdateRecordStatus(ctx, recordID, RecordStatusProcessing, map[string]string{
		"analysis_started_at": time.Now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		h.logger.Error("mark image record processing failed", zap.String("record_id", recordID), zap.Error(err))
		return
	}

	extraction, err := h.imageAnalyzer.AnalyzeImage(ctx, image)
	if err != nil {
		h.logger.Warn(
			"image analysis failed",
			zap.String("record_id", recordID),
			zap.String("asset_name", image.AssetName),
			zap.String("source", image.Source),
			zap.Error(err),
		)
		if _, updateErr := h.store.UpdateRecordStatus(ctx, recordID, RecordStatusFailed, map[string]string{
			"analysis_error":       err.Error(),
			"analysis_finished_at": time.Now().UTC().Format(time.RFC3339Nano),
		}); updateErr != nil {
			h.logger.Error("mark image record failed failed", zap.String("record_id", recordID), zap.Error(updateErr))
		}
		return
	}
	extraction.ImageURI = image.URI
	extraction.RecordID = recordID

	if _, err := h.store.CompleteRecordWithExtraction(ctx, recordID, extraction, image); err != nil {
		h.logger.Error("complete image extraction record failed", zap.String("record_id", recordID), zap.Error(err))
		return
	}

	h.logger.Info(
		"image extraction completed",
		zap.String("record_id", recordID),
		zap.String("asset_name", image.AssetName),
		zap.String("source", image.Source),
		zap.String("input_category", extraction.InputCategory),
		zap.Float64("confidence", extraction.Confidence),
	)
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
		Answer:              "Ask is not connected to an LLM yet. Saved records are available through the records API for timeline and review surfaces.",
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

func defaultImageStorageDir() string {
	if value := os.Getenv("NOMI_IMAGE_STORAGE_DIR"); value != "" {
		return value
	}
	return ".nomi/uploads"
}

func defaultCodexCWD() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return cwd
}
