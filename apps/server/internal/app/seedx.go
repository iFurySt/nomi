package app

import (
	"context"
	"encoding/json"
	"net/http"
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
		return r.Host == "localhost:8088" || r.Host == "127.0.0.1:8088" || r.Host == "[::1]:8088"
	},
}

func (h *Handler) seedXWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := seedXUpgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Warn("seedx websocket upgrade failed", zap.Error(err))
		return
	}
	defer conn.Close()

	h.logger.Info("seedx daemon connected", zap.String("remote_addr", r.RemoteAddr))

	var ready SeedXEvent
	if err := conn.ReadJSON(&ready); err != nil {
		h.logger.Warn("seedx ready read failed", zap.Error(err))
		return
	}
	h.logger.Info("seedx event received", zap.String("type", ready.Type), zap.String("id", ready.ID))

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
		h.logger.Warn("seedx request write failed", zap.Error(err))
		return
	}
	h.logger.Info("seedx event sent", zap.String("type", request.Type), zap.String("id", request.ID))

	var response SeedXEvent
	if err := conn.ReadJSON(&response); err != nil {
		h.logger.Warn("seedx response read failed", zap.Error(err))
		return
	}
	h.logger.Info("seedx event received", zap.String("type", response.Type), zap.String("id", response.ID))
}

func marshalSeedXEvent(event SeedXEvent) ([]byte, error) {
	return json.Marshal(event)
}

func seedXSmokeExchange(ctx context.Context, url string) error {
	dialer := websocket.Dialer{}
	conn, _, err := dialer.DialContext(ctx, url, nil)
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
