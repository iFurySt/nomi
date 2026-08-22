package app

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

type Handler struct {
	store           Store
	logger          *zap.Logger
	seedXAPIKey     string
	seedX           *SeedXController
	storage         StorageProvider
	bootstrapInvite string
	assetSigningKey string
	sessionDuration time.Duration
}

type HandlerOption func(*Handler)

func WithStorage(storage StorageProvider) HandlerOption {
	return func(h *Handler) { h.storage = storage }
}
func WithAuthConfig(bootstrapInvite, assetSigningKey string, sessionDuration time.Duration) HandlerOption {
	return func(h *Handler) {
		h.bootstrapInvite = bootstrapInvite
		h.assetSigningKey = assetSigningKey
		if sessionDuration > 0 {
			h.sessionDuration = sessionDuration
		}
	}
}

func NewHandler(store Store, logger *zap.Logger, seedXAPIKey string, options ...HandlerOption) *Handler {
	if logger == nil {
		logger = zap.NewNop()
	}
	h := &Handler{store: store, logger: logger, seedXAPIKey: seedXAPIKey, seedX: NewSeedXController(logger), storage: NewFSStorage(".nomi/data/assets"), sessionDuration: 30 * 24 * time.Hour}
	for _, option := range options {
		option(h)
	}
	return h
}

func (h *Handler) Routes() http.Handler {
	public := http.NewServeMux()
	public.HandleFunc("GET /health", h.health)
	public.HandleFunc("POST /auth/register", h.register)
	public.HandleFunc("POST /auth/login", h.login)
	public.HandleFunc("GET /agent/assets/{id}", h.agentAsset)
	public.HandleFunc("GET /daemon/connect", h.seedXWebSocket)

	protected := http.NewServeMux()
	protected.HandleFunc("POST /v1/auth/logout", h.logout)
	protected.HandleFunc("POST /v1/household/invites", h.createInvite)
	protected.HandleFunc("GET /v1/people", h.listPeople)
	protected.HandleFunc("POST /v1/people", h.createPerson)
	protected.HandleFunc("PATCH /v1/people/{id}", h.updatePerson)
	protected.HandleFunc("DELETE /v1/people/{id}", h.deletePerson)
	protected.HandleFunc("GET /v1/assets", h.listAssets)
	protected.HandleFunc("POST /v1/assets", h.createAsset)
	protected.HandleFunc("GET /v1/assets/{id}", h.getAsset)
	protected.HandleFunc("GET /v1/assets/{id}/content", h.assetContent)
	protected.HandleFunc("DELETE /v1/assets/{id}", h.deleteAsset)
	protected.HandleFunc("GET /v1/jobs", h.listJobs)
	protected.HandleFunc("GET /v1/jobs/{id}", h.getJob)
	protected.HandleFunc("GET /v1/threads", h.listThreads)
	protected.HandleFunc("POST /v1/threads", h.createThread)
	protected.HandleFunc("GET /v1/threads/{id}", h.getThread)
	protected.HandleFunc("DELETE /v1/threads/{id}", h.deleteThread)
	protected.HandleFunc("GET /v1/threads/{id}/messages", h.listMessages)
	protected.HandleFunc("POST /v1/threads/{id}/messages", h.createMessage)
	secured := h.requireUserSession(protected)
	root := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/v1/") {
			secured.ServeHTTP(w, r)
			return
		}
		public.ServeHTTP(w, r)
	})
	return withHeaders(root)
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	status := "ok"
	database := "ok"
	if h.store == nil || h.store.Ping(r.Context()) != nil {
		status = "degraded"
		database = "error"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status, "database": database})
}

type registerInput struct {
	Email         string `json:"email"`
	Password      string `json:"password"`
	DisplayName   string `json:"display_name"`
	HouseholdName string `json:"household_name"`
	InviteCode    string `json:"invite_code"`
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	if h.store == nil {
		writeError(w, http.StatusServiceUnavailable, "store_unavailable")
		return
	}
	var input registerInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Email = normalizeEmail(input.Email)
	input.DisplayName = normalizeDisplayName(input.DisplayName)
	input.HouseholdName = strings.TrimSpace(input.HouseholdName)
	if input.Email == "" || !strings.Contains(input.Email, "@") {
		writeError(w, http.StatusBadRequest, "email_invalid")
		return
	}
	if input.DisplayName == "" {
		writeError(w, http.StatusBadRequest, "display_name_required")
		return
	}
	passwordHash, err := hashPassword(input.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var identity AuthIdentity
	if h.bootstrapInvite != "" && constantTimeEqual(input.InviteCode, h.bootstrapInvite) {
		if input.HouseholdName == "" {
			input.HouseholdName = input.DisplayName + "的家庭"
		}
		identity, err = h.store.CreateOwner(r.Context(), input.Email, passwordHash, input.DisplayName, input.HouseholdName)
	} else {
		identity, err = h.store.JoinHousehold(r.Context(), input.InviteCode, input.Email, passwordHash, input.DisplayName)
	}
	if errors.Is(err, ErrConflict) {
		writeError(w, http.StatusConflict, "email_already_registered")
		return
	}
	if errors.Is(err, ErrInvalidInvite) {
		writeError(w, http.StatusUnauthorized, "invite_invalid")
		return
	}
	if err != nil {
		h.logger.Error("register failed", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "register_failed")
		return
	}
	h.finishLogin(w, r, identity, http.StatusCreated)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	identity, err := h.store.FindIdentityByEmail(r.Context(), normalizeEmail(input.Email))
	if err != nil || !verifyPassword(identity.PasswordHash, input.Password) {
		writeError(w, http.StatusUnauthorized, "credentials_invalid")
		return
	}
	h.finishLogin(w, r, identity, http.StatusOK)
}
func (h *Handler) finishLogin(w http.ResponseWriter, r *http.Request, identity AuthIdentity, status int) {
	token, err := randomToken(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "session_create_failed")
		return
	}
	expires := time.Now().Add(h.sessionDuration)
	p := Principal{UserID: identity.User.ID, HouseholdID: identity.Household.ID, Role: identity.Household.Role}
	if err = h.store.CreateSession(r.Context(), p, token, expires); err != nil {
		h.logger.Error("create session failed", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "session_create_failed")
		return
	}
	writeJSON(w, status, AuthResponse{Token: token, ExpiresAt: expires, User: identity.User, Household: identity.Household})
}
func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	token, _ := bearerToken(r.Header.Get("Authorization"))
	_ = h.store.DeleteSession(r.Context(), token)
	w.WriteHeader(http.StatusNoContent)
}
func (h *Handler) createInvite(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if p.Role != RoleOwner {
		writeError(w, http.StatusForbidden, "owner_required")
		return
	}
	token, err := randomToken(18)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invite_create_failed")
		return
	}
	expires := time.Now().Add(7 * 24 * time.Hour)
	if err = h.store.CreateInvite(r.Context(), p, token, expires); err != nil {
		writeError(w, http.StatusInternalServerError, "invite_create_failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"invite_code": token, "expires_at": expires})
}

func (h *Handler) listPeople(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	people, err := h.store.ListPeople(r.Context(), p.HouseholdID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "people_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"people": people})
}
func (h *Handler) createPerson(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var input struct {
		DisplayName  string `json:"display_name"`
		Relationship string `json:"relationship"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.DisplayName = normalizeDisplayName(input.DisplayName)
	if input.DisplayName == "" {
		writeError(w, http.StatusBadRequest, "display_name_required")
		return
	}
	person, err := h.store.CreatePerson(r.Context(), p, input.DisplayName, strings.TrimSpace(input.Relationship))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "person_create_failed")
		return
	}
	writeJSON(w, http.StatusCreated, person)
}
func (h *Handler) updatePerson(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var input struct {
		DisplayName  string `json:"display_name"`
		Relationship string `json:"relationship"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	person, err := h.store.UpdatePerson(r.Context(), p, r.PathValue("id"), normalizeDisplayName(input.DisplayName), strings.TrimSpace(input.Relationship))
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "person_not_found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "person_update_failed")
		return
	}
	writeJSON(w, http.StatusOK, person)
}
func (h *Handler) deletePerson(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	deleted, err := h.store.DeletePerson(r.Context(), p, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "person_delete_failed")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "person_not_found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func personFilter(r *http.Request) *string {
	value := strings.TrimSpace(r.URL.Query().Get("person_id"))
	if value == "" {
		return nil
	}
	return &value
}
func (h *Handler) validatePerson(ctxHousehold string, personID *string, r *http.Request) bool {
	if personID == nil {
		return true
	}
	people, err := h.store.ListPeople(r.Context(), ctxHousehold)
	if err != nil {
		return false
	}
	for _, person := range people {
		if person.ID == *personID {
			return true
		}
	}
	return false
}
func (h *Handler) createAsset(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	r.Body = http.MaxBytesReader(w, r.Body, maxAssetBytes+1024*1024)
	if err := r.ParseMultipartForm(maxAssetBytes + 1024*1024); err != nil {
		writeError(w, http.StatusBadRequest, "multipart_invalid")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file_required")
		return
	}
	defer file.Close()
	personID := optionalString(r.FormValue("person_id"))
	if !h.validatePerson(p.HouseholdID, personID, r) {
		writeError(w, http.StatusBadRequest, "person_invalid")
		return
	}
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = detectMultipartType(file)
	}
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "asset_create_failed")
		return
	}
	key := assetStorageKey(p.HouseholdID, id, header.Filename)
	stored, err := h.storage.Put(r.Context(), key, file)
	if err != nil {
		code := http.StatusInternalServerError
		if err.Error() == "asset_too_large" {
			code = http.StatusRequestEntityTooLarge
		}
		writeError(w, code, err.Error())
		return
	}
	asset, err := h.store.CreateAsset(r.Context(), Asset{ID: id, HouseholdID: p.HouseholdID, PersonID: personID, CreatedBy: p.UserID, StorageProvider: h.storage.Name(), StorageKey: stored.Key, OriginalName: header.Filename, MimeType: mimeType, SizeBytes: stored.SizeBytes, SHA256: stored.SHA256, Status: JobStatusQueued})
	if err != nil {
		_ = h.storage.Delete(r.Context(), stored.Key)
		writeError(w, http.StatusInternalServerError, "asset_create_failed")
		return
	}
	jobID, _ := newID()
	payload, _ := json.Marshal(map[string]string{"asset_id": asset.ID})
	job, err := h.store.CreateJob(r.Context(), Job{ID: jobID, HouseholdID: p.HouseholdID, PersonID: personID, CreatedBy: p.UserID, Kind: JobKindIngest, Payload: payload})
	if err != nil {
		_, _ = h.store.DeleteAsset(r.Context(), p.HouseholdID, asset.ID)
		_ = h.storage.Delete(r.Context(), stored.Key)
		writeError(w, http.StatusInternalServerError, "job_create_failed")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"asset": asset, "job": job})
}
func detectMultipartType(file multipart.File) string {
	buffer := make([]byte, 512)
	n, _ := file.Read(buffer)
	_, _ = file.Seek(0, io.SeekStart)
	return http.DetectContentType(buffer[:n])
}
func (h *Handler) listAssets(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	assets, err := h.store.ListAssets(r.Context(), p.HouseholdID, personFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "assets_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"assets": assets})
}
func (h *Handler) getAsset(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	asset, err := h.store.GetAsset(r.Context(), p.HouseholdID, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "asset_not_found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "asset_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, asset)
}
func (h *Handler) assetContent(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	asset, err := h.store.GetAsset(r.Context(), p.HouseholdID, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "asset_not_found")
		return
	}
	h.serveAsset(w, r, asset)
}
func (h *Handler) deleteAsset(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	asset, err := h.store.DeleteAsset(r.Context(), p.HouseholdID, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "asset_not_found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "asset_delete_failed")
		return
	}
	if err = h.storage.Delete(r.Context(), asset.StorageKey); err != nil {
		h.logger.Warn("asset storage delete failed", zap.String("asset_id", asset.ID), zap.Error(err))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listJobs(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	jobs, err := h.store.ListJobs(r.Context(), p.HouseholdID, personFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "jobs_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
}
func (h *Handler) getJob(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	job, err := h.store.GetJob(r.Context(), p.HouseholdID, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "job_not_found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "job_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (h *Handler) createThread(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var input struct {
		PersonID *string `json:"person_id"`
		Title    string  `json:"title"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !h.validatePerson(p.HouseholdID, input.PersonID, r) {
		writeError(w, http.StatusBadRequest, "person_invalid")
		return
	}
	if strings.TrimSpace(input.Title) == "" {
		input.Title = "新的对话"
	}
	thread, err := h.store.CreateThread(r.Context(), p, input.PersonID, strings.TrimSpace(input.Title))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "thread_create_failed")
		return
	}
	writeJSON(w, http.StatusCreated, thread)
}
func (h *Handler) listThreads(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	threads, err := h.store.ListThreads(r.Context(), p.HouseholdID, personFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "threads_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"threads": threads})
}
func (h *Handler) getThread(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	thread, err := h.store.GetThread(r.Context(), p.HouseholdID, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "thread_not_found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "thread_unavailable")
		return
	}
	messages, _ := h.store.ListMessages(r.Context(), p.HouseholdID, thread.ID)
	writeJSON(w, http.StatusOK, map[string]any{"thread": thread, "messages": messages})
}
func (h *Handler) deleteThread(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	deleted, err := h.store.DeleteThread(r.Context(), p.HouseholdID, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "thread_delete_failed")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "thread_not_found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (h *Handler) listMessages(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if _, err := h.store.GetThread(r.Context(), p.HouseholdID, r.PathValue("id")); err != nil {
		writeError(w, http.StatusNotFound, "thread_not_found")
		return
	}
	messages, err := h.store.ListMessages(r.Context(), p.HouseholdID, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "messages_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": messages})
}
func (h *Handler) createMessage(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	thread, err := h.store.GetThread(r.Context(), p.HouseholdID, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "thread_not_found")
		return
	}
	var input struct {
		Content string `json:"content"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Content = strings.TrimSpace(input.Content)
	if input.Content == "" {
		writeError(w, http.StatusBadRequest, "content_required")
		return
	}
	userID := p.UserID
	message, err := h.store.CreateMessage(r.Context(), Message{HouseholdID: p.HouseholdID, ThreadID: thread.ID, UserID: &userID, Role: "user", Content: input.Content, Status: "completed"})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "message_create_failed")
		return
	}
	jobID, _ := newID()
	payload, _ := json.Marshal(map[string]string{"thread_id": thread.ID, "message_id": message.ID})
	job, err := h.store.CreateJob(r.Context(), Job{ID: jobID, HouseholdID: p.HouseholdID, PersonID: thread.PersonID, CreatedBy: p.UserID, Kind: JobKindChat, Payload: payload})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "job_create_failed")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"message": message, "job": job})
}

func (h *Handler) agentAsset(w http.ResponseWriter, r *http.Request) {
	householdID := r.URL.Query().Get("household_id")
	expiresValue := r.URL.Query().Get("expires")
	signature := r.URL.Query().Get("signature")
	expires, err := strconv.ParseInt(expiresValue, 10, 64)
	if err != nil || time.Now().Unix() > expires {
		writeError(w, http.StatusUnauthorized, "asset_link_expired")
		return
	}
	expected := h.signAsset(r.PathValue("id"), householdID, expiresValue)
	if expected == "" || !hmac.Equal([]byte(expected), []byte(signature)) {
		writeError(w, http.StatusUnauthorized, "asset_signature_invalid")
		return
	}
	asset, err := h.store.GetAsset(r.Context(), householdID, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "asset_not_found")
		return
	}
	h.serveAsset(w, r, asset)
}
func (h *Handler) signAsset(assetID, householdID, expires string) string {
	if h.assetSigningKey == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(h.assetSigningKey))
	_, _ = fmt.Fprintf(mac, "%s\n%s\n%s", assetID, householdID, expires)
	return hex.EncodeToString(mac.Sum(nil))
}
func (h *Handler) serveAsset(w http.ResponseWriter, r *http.Request, asset Asset) {
	file, err := h.storage.Open(r.Context(), asset.StorageKey)
	if err != nil {
		writeError(w, http.StatusNotFound, "asset_not_found")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", asset.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", safeFilename(asset.OriginalName)))
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = io.Copy(w, file)
}

func optionalString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}
func mustPrincipal(r *http.Request) Principal { p, _ := principalFromContext(r.Context()); return p }
func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1024*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return false
	}
	return true
}
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}
func withHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
