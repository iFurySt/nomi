package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
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

func TestValidSeedXBearer(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		header   string
		expected string
		want     bool
	}{
		{
			name:     "disabled",
			header:   "",
			expected: "",
			want:     true,
		},
		{
			name:     "valid",
			header:   "Bearer dev-key",
			expected: "dev-key",
			want:     true,
		},
		{
			name:     "missing bearer",
			header:   "dev-key",
			expected: "dev-key",
			want:     false,
		},
		{
			name:     "wrong key",
			header:   "Bearer other",
			expected: "dev-key",
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := validSeedXBearer(tt.header, tt.expected); got != tt.want {
				t.Fatalf("validSeedXBearer() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSeedXWebSocketRequiresAPIKey(t *testing.T) {
	t.Parallel()

	handler := NewHandler(nil, zap.NewNop(), "dev-key")
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/daemon/connect"
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		_ = conn.Close()
		t.Fatal("dial succeeded without API key")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %v, err = %v", respStatus(resp), err)
	}
}

func TestSeedXWebSocketAcceptsSeedXHello(t *testing.T) {
	t.Parallel()

	handler := NewHandler(nil, zap.NewNop(), "dev-key")
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/daemon/connect"
	header := http.Header{}
	header.Set("Authorization", "Bearer dev-key")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(SeedXEvent{Type: "daemon:hello"}); err != nil {
		t.Fatalf("write hello: %v", err)
	}

	var ping SeedXEvent
	if err := conn.ReadJSON(&ping); err != nil {
		t.Fatalf("read ping: %v", err)
	}
	if ping.Type != "daemon:ping" {
		t.Fatalf("ping type = %q", ping.Type)
	}

	if err := conn.WriteJSON(SeedXEvent{ID: ping.ID, Type: "daemon:pong"}); err != nil {
		t.Fatalf("write pong: %v", err)
	}

	if err := conn.SetReadDeadline(time.Now().Add(50 * time.Millisecond)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	var next SeedXEvent
	err = conn.ReadJSON(&next)
	if err == nil {
		t.Fatalf("unexpected message after pong: %#v", next)
	}
	if !strings.Contains(err.Error(), "i/o timeout") {
		t.Fatalf("session was closed after pong: %v", err)
	}
}

func TestSeedXControllerRunsCodexRunCommandOverDaemon(t *testing.T) {
	t.Parallel()

	handler := NewHandler(nil, zap.NewNop(), "dev-key")
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/daemon/connect"
	header := http.Header{}
	header.Set("Authorization", "Bearer dev-key")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(SeedXEvent{Type: "daemon:hello"}); err != nil {
		t.Fatalf("write hello: %v", err)
	}
	var ping SeedXEvent
	if err := conn.ReadJSON(&ping); err != nil {
		t.Fatalf("read ping: %v", err)
	}

	resultCh := make(chan SeedXRunResult, 1)
	errCh := make(chan error, 1)
	go func() {
		result, err := handler.seedX.RunCodex(context.Background(), SeedXRunParams{
			Runtime: "codex",
			CWD:     "/workspace",
			Input: []SeedXInputItem{
				{Type: "text", Text: "analyze"},
				{Type: "localImage", Path: "/tmp/cafe.png", Name: "cafe.png"},
			},
		})
		if err != nil {
			errCh <- err
			return
		}
		resultCh <- result
	}()

	var command struct {
		ID     string         `json:"id"`
		Type   string         `json:"type"`
		Method string         `json:"method"`
		Params SeedXRunParams `json:"params"`
	}
	if err := conn.ReadJSON(&command); err != nil {
		t.Fatalf("read command: %v", err)
	}
	if command.Type != "daemon:command" || command.Method != "run" {
		t.Fatalf("command = %#v", command)
	}
	if len(command.Params.Input) != 2 || command.Params.Input[1].Type != "localImage" || command.Params.Input[1].Path != "/tmp/cafe.png" {
		t.Fatalf("input = %#v", command.Params.Input)
	}

	if err := conn.WriteJSON(map[string]any{
		"type": "daemon:result",
		"id":   command.ID,
		"ok":   true,
		"result": map[string]any{
			"runtime": "codex",
			"text":    `{"ok":true}`,
		},
	}); err != nil {
		t.Fatalf("write result: %v", err)
	}

	select {
	case err := <-errCh:
		t.Fatalf("run command: %v", err)
	case result := <-resultCh:
		if result.Text != `{"ok":true}` {
			t.Fatalf("result = %#v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for command result")
	}
}

func TestSeedXWebSocketRejectsInteractiveServerRequest(t *testing.T) {
	t.Parallel()

	handler := NewHandler(nil, zap.NewNop(), "dev-key")
	server := httptest.NewServer(handler.Routes())
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/daemon/connect"
	header := http.Header{}
	header.Set("Authorization", "Bearer dev-key")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(SeedXEvent{Type: "daemon:hello"}); err != nil {
		t.Fatalf("write hello: %v", err)
	}
	var ping SeedXEvent
	if err := conn.ReadJSON(&ping); err != nil {
		t.Fatalf("read ping: %v", err)
	}

	if err := conn.WriteJSON(map[string]any{
		"type":      "daemon:server_request",
		"id":        "approval-1",
		"commandId": "cmd-1",
		"request": map[string]any{
			"method": "item/commandExecution/requestApproval",
		},
	}); err != nil {
		t.Fatalf("write server request: %v", err)
	}

	var response struct {
		Type      string `json:"type"`
		ID        string `json:"id"`
		CommandID string `json:"commandId"`
		Error     *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := conn.ReadJSON(&response); err != nil {
		t.Fatalf("read server response: %v", err)
	}
	if response.Type != "daemon:server_response" || response.ID != "approval-1" || response.CommandID != "cmd-1" || response.Error == nil {
		t.Fatalf("response = %#v", response)
	}
}

func respStatus(resp *http.Response) any {
	if resp == nil {
		return nil
	}
	return resp.StatusCode
}
