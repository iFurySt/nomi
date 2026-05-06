package app

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
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

	var first SeedXEvent
	if err := conn.ReadJSON(&first); err != nil {
		h.logSeedXDisconnect(err, "before_hello")
		return
	}

	if first.Type == "daemon:hello" {
		if err := h.handleSeedXDaemonSession(conn); err != nil {
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

func (h *Handler) handleSeedXDaemonSession(conn *websocket.Conn) error {
	ping := SeedXEvent{
		ID:        "server-ping-1",
		Type:      "daemon:ping",
		CreatedAt: time.Now(),
	}
	if err := conn.WriteJSON(ping); err != nil {
		return err
	}

	for {
		var event SeedXEvent
		if err := conn.ReadJSON(&event); err != nil {
			return err
		}
		if event.Type == "daemon:ping" {
			if err := conn.WriteJSON(SeedXEvent{ID: event.ID, Type: "daemon:pong", CreatedAt: time.Now()}); err != nil {
				return err
			}
		}
	}
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
			"prompt": "Summarize the latest saved body log without medical advice.",
			"mode":   "mock",
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
			"text":       "Mock SeedX response.",
		},
	}
	return conn.WriteJSON(response)
}
