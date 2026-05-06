package app

import (
	"context"
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

func RunExchange(ctx context.Context, serverURL string, logger *zap.Logger) error {
	dialer := websocket.Dialer{}
	conn, _, err := dialer.DialContext(ctx, serverURL, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	logger.Info("seedx daemon connected", zap.String("server_url", serverURL))

	ready := SeedXEvent{
		ID:        "daemon-ready-" + time.Now().Format("20060102T150405"),
		Type:      "daemon.ready",
		CreatedAt: time.Now(),
		Payload: map[string]any{
			"runtime": "local",
			"adapter": "mock-seedx",
		},
	}
	if err := conn.WriteJSON(ready); err != nil {
		return err
	}
	logger.Info("seedx event sent", zap.String("type", ready.Type), zap.String("id", ready.ID))

	var request SeedXEvent
	if err := conn.ReadJSON(&request); err != nil {
		return err
	}
	logger.Info("seedx event received", zap.String("type", request.Type), zap.String("id", request.ID))

	response := SeedXEvent{
		ID:        request.ID + "-response",
		Type:      "seedx.response",
		CreatedAt: time.Now(),
		Payload: map[string]any{
			"request_id": request.ID,
			"text":       "Mock SeedX response based on saved Nomi records. This is not medical advice.",
		},
	}
	if err := conn.WriteJSON(response); err != nil {
		return err
	}
	logger.Info("seedx event sent", zap.String("type", response.Type), zap.String("id", response.ID))
	return nil
}
