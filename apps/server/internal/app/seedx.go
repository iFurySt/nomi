package app

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

type SeedXEvent struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	CreatedAt time.Time      `json:"created_at"`
	Payload   map[string]any `json:"payload"`
}

type SeedXInputItem struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	URL  string `json:"url,omitempty"`
	Path string `json:"path,omitempty"`
	Name string `json:"name,omitempty"`
}

type SeedXRunParams struct {
	Runtime         string           `json:"runtime,omitempty"`
	CWD             string           `json:"cwd,omitempty"`
	Prompt          string           `json:"prompt,omitempty"`
	Input           []SeedXInputItem `json:"input,omitempty"`
	Model           string           `json:"model,omitempty"`
	ReasoningEffort string           `json:"reasoningEffort,omitempty"`
	OutputSchema    json.RawMessage  `json:"outputSchema,omitempty"`
}

type SeedXRunResult struct {
	Runtime  string         `json:"runtime"`
	ThreadID string         `json:"threadId"`
	TurnID   string         `json:"turnId"`
	Events   []string       `json:"events"`
	Text     string         `json:"text,omitempty"`
	Error    string         `json:"error,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type seedXCommand struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	CreatedAt time.Time      `json:"created_at"`
	Method    string         `json:"method"`
	Runtime   string         `json:"runtime,omitempty"`
	Params    SeedXRunParams `json:"params"`
}

type seedXResult struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"`
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type seedXResultMessage struct {
	result SeedXRunResult
	err    error
}

type SeedXController struct {
	logger  *zap.Logger
	mu      sync.Mutex
	session *seedXSession
	pending map[string]chan seedXResultMessage
}

type seedXSession struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func NewSeedXController(logger *zap.Logger) *SeedXController {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &SeedXController{
		logger:  logger,
		pending: map[string]chan seedXResultMessage{},
	}
}

func (c *SeedXController) register(session *seedXSession) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.session = session
}

func (c *SeedXController) unregister(session *seedXSession) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.session == session {
		c.session = nil
	}
	for id, ch := range c.pending {
		delete(c.pending, id)
		ch <- seedXResultMessage{err: ErrSeedXUnavailable}
		close(ch)
	}
}

func (c *SeedXController) RunCodex(ctx context.Context, params SeedXRunParams) (SeedXRunResult, error) {
	c.mu.Lock()
	session := c.session
	if session == nil {
		c.mu.Unlock()
		return SeedXRunResult{}, ErrSeedXUnavailable
	}
	id := fmt.Sprintf("nomi-codex-%d", time.Now().UnixNano())
	ch := make(chan seedXResultMessage, 1)
	c.pending[id] = ch
	c.mu.Unlock()

	command := seedXCommand{
		ID:        id,
		Type:      "daemon:command",
		CreatedAt: time.Now(),
		Method:    "run",
		Runtime:   "codex",
		Params:    params,
	}
	if err := session.Send(command); err != nil {
		c.removePending(id)
		return SeedXRunResult{}, err
	}

	select {
	case <-ctx.Done():
		c.removePending(id)
		return SeedXRunResult{}, ctx.Err()
	case message := <-ch:
		return message.result, message.err
	}
}

func (c *SeedXController) handleResult(raw json.RawMessage) {
	var result seedXResult
	if err := json.Unmarshal(raw, &result); err != nil {
		c.logger.Warn("seedx result decode failed", zap.Error(err))
		return
	}

	c.mu.Lock()
	ch := c.pending[result.ID]
	delete(c.pending, result.ID)
	c.mu.Unlock()
	if ch == nil {
		return
	}
	defer close(ch)

	if !result.OK {
		message := "seedx command failed"
		if result.Error != nil && result.Error.Message != "" {
			message = result.Error.Message
		}
		ch <- seedXResultMessage{err: errors.New(message)}
		return
	}

	var run SeedXRunResult
	if err := json.Unmarshal(result.Result, &run); err != nil {
		ch <- seedXResultMessage{err: err}
		return
	}
	if run.Error != "" {
		ch <- seedXResultMessage{err: errors.New(run.Error)}
		return
	}
	ch <- seedXResultMessage{result: run}
}

func (c *SeedXController) removePending(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.pending, id)
}

func (s *seedXSession) Send(value any) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.conn.WriteJSON(value)
}

var seedXUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		parsed, err := url.Parse(origin)
		if err != nil {
			return false
		}
		return parsed.Host == r.Host || strings.HasPrefix(parsed.Host, "localhost:") || strings.HasPrefix(parsed.Host, "127.0.0.1:")
	},
}

func (h *Handler) seedXWebSocket(w http.ResponseWriter, r *http.Request) {
	if !validSeedXBearer(r.Header.Get("Authorization"), h.seedXAPIKey) {
		writeError(w, http.StatusUnauthorized, "seedx_unauthorized")
		return
	}

	conn, err := seedXUpgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Warn("seedx websocket upgrade failed", zap.Error(err))
		return
	}
	defer conn.Close()

	h.logger.Info("seedx daemon connected", zap.String("remote_addr", r.RemoteAddr), zap.String("path", r.URL.Path))

	_, firstRaw, err := conn.ReadMessage()
	if err != nil {
		h.logSeedXDisconnect(err, "before_hello")
		return
	}

	var first SeedXEvent
	if err := json.Unmarshal(firstRaw, &first); err != nil {
		h.logSeedXDisconnect(err, "invalid_hello")
		return
	}

	if first.Type == "daemon:hello" {
		session := &seedXSession{conn: conn}
		h.seedX.register(session)
		defer h.seedX.unregister(session)
		if err := h.handleSeedXDaemonSession(session); err != nil {
			h.logSeedXDisconnect(err, "session_end")
		}
		return
	}

	if err := h.handleLegacySeedXSmoke(conn); err != nil {
		h.logSeedXDisconnect(err, "legacy_smoke_end")
		return
	}
	h.logger.Info("seedx daemon disconnected", zap.String("reason", "legacy_smoke_complete"))
}

func (h *Handler) handleSeedXDaemonSession(session *seedXSession) error {
	ping := SeedXEvent{
		ID:        "server-ping-1",
		Type:      "daemon:ping",
		CreatedAt: time.Now(),
	}
	if err := session.Send(ping); err != nil {
		return err
	}

	for {
		_, raw, err := session.conn.ReadMessage()
		if err != nil {
			return err
		}
		var event SeedXEvent
		if err := json.Unmarshal(raw, &event); err != nil {
			return err
		}
		if event.Type == "daemon:ping" {
			if err := session.Send(SeedXEvent{ID: event.ID, Type: "daemon:pong", CreatedAt: time.Now()}); err != nil {
				return err
			}
			continue
		}
		if event.Type == "daemon:result" {
			h.seedX.handleResult(raw)
			continue
		}
		if event.Type == "daemon:server_request" {
			if err := h.replyUnsupportedSeedXServerRequest(session, raw); err != nil {
				return err
			}
		}
	}
}

func (h *Handler) replyUnsupportedSeedXServerRequest(session *seedXSession, raw json.RawMessage) error {
	var request struct {
		ID        string `json:"id"`
		CommandID string `json:"commandId"`
	}
	if err := json.Unmarshal(raw, &request); err != nil {
		return err
	}
	return session.Send(map[string]any{
		"type":      "daemon:server_response",
		"id":        request.ID,
		"commandId": request.CommandID,
		"error": map[string]any{
			"code":    int64(-32000),
			"message": "Nomi 文件识别暂不支持交互式 Codex 服务请求",
		},
	})
}

func (h *Handler) logSeedXDisconnect(err error, reason string) {
	if isSeedXDaemonDisconnect(err) {
		h.logger.Info("seedx daemon disconnected", zap.String("reason", reason))
		return
	}
	h.logger.Warn("seedx daemon session failed", zap.String("reason", reason), zap.Error(err))
}

func isSeedXDaemonDisconnect(err error) bool {
	var closeErr *websocket.CloseError
	if errors.As(err, &closeErr) {
		return true
	}
	return strings.Contains(err.Error(), "unexpected EOF")
}

func (h *Handler) handleLegacySeedXSmoke(conn *websocket.Conn) error {
	request := SeedXEvent{
		ID:        "server-smoke-1",
		Type:      "seedx.request",
		CreatedAt: time.Now(),
		Payload: map[string]any{
			"prompt": "请用中文总结最近保存的身体记录，不要提供医疗建议。",
			"mode":   "smoke",
		},
	}
	if err := conn.WriteJSON(request); err != nil {
		return err
	}

	var response SeedXEvent
	if err := conn.ReadJSON(&response); err != nil {
		return err
	}
	return nil
}

func validSeedXBearer(header string, expected string) bool {
	if expected == "" {
		return true
	}
	token, ok := strings.CutPrefix(header, "Bearer ")
	if !ok {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(strings.TrimSpace(token)), []byte(expected)) == 1
}

func marshalSeedXEvent(event SeedXEvent) ([]byte, error) {
	return json.Marshal(event)
}

func seedXSmokeExchange(ctx context.Context, url string, apiKey string) error {
	dialer := websocket.Dialer{}
	header := http.Header{}
	if apiKey != "" {
		header.Set("Authorization", "Bearer "+apiKey)
	}
	conn, _, err := dialer.DialContext(ctx, url, header)
	if err != nil {
		return err
	}
	defer conn.Close()

	ready := SeedXEvent{
		ID:        "test-ready",
		Type:      "daemon.ready",
		CreatedAt: time.Now(),
		Payload:   map[string]any{"runtime": "test"},
	}
	if err := conn.WriteJSON(ready); err != nil {
		return err
	}

	var request SeedXEvent
	if err := conn.ReadJSON(&request); err != nil {
		return err
	}

	response := SeedXEvent{
		ID:        request.ID + "-response",
		Type:      "seedx.response",
		CreatedAt: time.Now(),
		Payload: map[string]any{
			"request_id": request.ID,
			"text":       "SeedX smoke 中文响应。",
		},
	}
	return conn.WriteJSON(response)
}
