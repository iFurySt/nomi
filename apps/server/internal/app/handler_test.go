package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestAllV1RoutesRequireSession(t *testing.T) {
	t.Parallel()
	handler := NewHandler(nil, zap.NewNop(), "dev-key")
	routes := []struct{ method, path string }{
		{http.MethodPost, "/v1/auth/logout"}, {http.MethodPost, "/v1/household/invites"},
		{http.MethodGet, "/v1/people"}, {http.MethodPost, "/v1/people"}, {http.MethodPatch, "/v1/people/p1"}, {http.MethodDelete, "/v1/people/p1"},
		{http.MethodGet, "/v1/assets"}, {http.MethodPost, "/v1/assets"}, {http.MethodGet, "/v1/assets/a1"}, {http.MethodGet, "/v1/assets/a1/content"}, {http.MethodDelete, "/v1/assets/a1"},
		{http.MethodGet, "/v1/jobs"}, {http.MethodGet, "/v1/jobs/j1"},
		{http.MethodGet, "/v1/threads"}, {http.MethodPost, "/v1/threads"}, {http.MethodGet, "/v1/threads/t1"}, {http.MethodDelete, "/v1/threads/t1"}, {http.MethodGet, "/v1/threads/t1/messages"}, {http.MethodPost, "/v1/threads/t1/messages"},
		{http.MethodGet, "/v1/future-route"},
	}
	for _, route := range routes {
		route := route
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			request := httptest.NewRequest(route.method, route.path, nil)
			response := httptest.NewRecorder()
			handler.Routes().ServeHTTP(response, request)
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}
}

func TestPublicHealthDoesNotRequireUserSession(t *testing.T) {
	t.Parallel()
	handler := NewHandler(nil, zap.NewNop(), "dev-key")
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()
	handler.Routes().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d", response.Code)
	}
}
func TestPasswordHashRoundTrip(t *testing.T) {
	t.Parallel()
	hash, err := hashPassword("a-strong-family-password")
	if err != nil {
		t.Fatal(err)
	}
	if !verifyPassword(hash, "a-strong-family-password") {
		t.Fatal("password did not verify")
	}
	if verifyPassword(hash, "wrong-password-value") {
		t.Fatal("wrong password verified")
	}
}
func TestParseAgentResult(t *testing.T) {
	t.Parallel()
	input := "```json\n" + `{"title":"化验单","answer":"","summary":"已归档","changes":"新增一次检查","current_assessment":"需要继续观察","open_questions":["复查时间？"],"citations":["raw-data/a.pdf"]}` + "\n```"
	result, err := parseAgentResult(input)
	if err != nil {
		t.Fatal(err)
	}
	if result.Title != "化验单" || len(result.Citations) != 1 {
		t.Fatalf("result=%#v", result)
	}
	if err = result.Validate(JobKindIngest); err != nil {
		t.Fatal(err)
	}
}

func TestParseAgentResultAcceptsTrailingSeedXText(t *testing.T) {
	t.Parallel()
	input := `{"title":"回答","answer":"第一份完整结果","summary":"","changes":"","current_assessment":"","open_questions":[],"citations":[]}` + "\n" + `{"event":"duplicate transport text"}`
	result, err := parseAgentResult(input)
	if err != nil {
		t.Fatal(err)
	}
	if result.Answer != "第一份完整结果" {
		t.Fatalf("result=%#v", result)
	}
}

func TestParseAgentResultUsesLatestCompleteSeedXResult(t *testing.T) {
	t.Parallel()
	input := `{"title":"","answer":"我会先读取资料。","summary":"","changes":"","current_assessment":"","open_questions":[],"citations":[]}` + "\n" + `{"title":"回答","answer":"最终答案","summary":"","changes":"","current_assessment":"","open_questions":[],"citations":["ai-vault/person/index.md"]}`
	result, err := parseAgentResult(input)
	if err != nil {
		t.Fatal(err)
	}
	if result.Answer != "最终答案" || len(result.Citations) != 1 {
		t.Fatalf("result=%#v", result)
	}
}

func TestFSStorageRoundTripAndTraversalProtection(t *testing.T) {
	t.Parallel()
	storage := NewFSStorage(t.TempDir())
	ctx := context.Background()
	stored, err := storage.Put(ctx, "households/h1/assets/a.txt", strings.NewReader("sensitive"))
	if err != nil {
		t.Fatal(err)
	}
	if stored.SizeBytes != 9 {
		t.Fatalf("size=%d", stored.SizeBytes)
	}
	file, err := storage.Open(ctx, stored.Key)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(file)
	file.Close()
	if string(data) != "sensitive" {
		t.Fatalf("data=%q", data)
	}
	if _, err = storage.Put(ctx, "../escape", bytes.NewReader(nil)); err == nil {
		t.Fatal("traversal accepted")
	}
	if err = storage.Delete(ctx, stored.Key); err != nil {
		t.Fatal(err)
	}
	if _, err = storage.Open(ctx, stored.Key); !os.IsNotExist(err) {
		t.Fatalf("open deleted err=%v", err)
	}
}

func TestWorkspaceInitializesVersionedRulesAndGit(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	storage := NewFSStorage(filepath.Join(root, "assets"))
	manager := NewWorkspaceManager(filepath.Join(root, "workspaces"), filepath.Join(root, "workspaces"), storage)
	workspace, agent, err := manager.Ensure("11111111-1111-4111-8111-111111111111")
	if err != nil {
		t.Fatal(err)
	}
	if workspace != agent {
		t.Fatalf("paths differ: %q %q", workspace, agent)
	}
	for _, relative := range []string{"AGENTS.md", ".gitignore", "docs/ARCHITECTURE.md", "raw-data/_incoming/family", "ai-vault/family", ".git"} {
		if _, err = os.Stat(filepath.Join(workspace, relative)); err != nil {
			t.Fatalf("%s: %v", relative, err)
		}
	}
	if err = manager.Commit(context.Background(), workspace, "initialize household workspace"); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceFinalizesIngestWithTraceableContext(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	storage := NewFSStorage(filepath.Join(root, "assets"))
	stored, err := storage.Put(context.Background(), "households/h1/assets/a1", strings.NewReader("lab result"))
	if err != nil {
		t.Fatal(err)
	}
	manager := NewWorkspaceManager(filepath.Join(root, "workspaces"), filepath.Join(root, "workspaces"), storage)
	workspace, _, err := manager.Ensure("11111111-1111-4111-8111-111111111111")
	if err != nil {
		t.Fatal(err)
	}
	personID := "22222222-2222-4222-8222-222222222222"
	asset := Asset{ID: "33333333-3333-4333-8333-333333333333", PersonID: &personID, StorageKey: stored.Key, OriginalName: "lab.pdf", MimeType: "application/pdf", SHA256: stored.SHA256, CreatedAt: time.Date(2026, 8, 23, 9, 30, 0, 0, time.FixedZone("CST", 8*60*60))}
	incoming, err := manager.MaterializeAsset(context.Background(), workspace, asset)
	if err != nil {
		t.Fatal(err)
	}
	archived, err := manager.FinalizeIngest(workspace, asset, incoming, "家庭成员", AgentResult{Title: "检查结果", Summary: "新增检查", Changes: "补充证据", CurrentAssessment: "需要随访", OpenQuestions: []string{"复查时间？"}})
	if err != nil {
		t.Fatal(err)
	}
	if archived != "raw-data/people/22222222-2222-4222-8222-222222222222/2026/08/33333333-3333-4333-8333-333333333333-lab.pdf" {
		t.Fatalf("archived=%q", archived)
	}
	if _, err = os.Stat(filepath.Join(workspace, filepath.FromSlash(archived))); err != nil {
		t.Fatal(err)
	}
	index, err := os.ReadFile(filepath.Join(workspace, "ai-vault", "people", personID, "index.md"))
	if err != nil || !strings.Contains(string(index), asset.ID+".md") {
		t.Fatalf("index=%q err=%v", index, err)
	}
	if got := manager.ExistingContextPath(workspace, &personID); got != "ai-vault/people/22222222-2222-4222-8222-222222222222/index.md" {
		t.Fatalf("context path=%q", got)
	}
	missingID := "44444444-4444-4444-8444-444444444444"
	if got := manager.ExistingContextPath(workspace, &missingID); got != "" {
		t.Fatalf("missing context path=%q", got)
	}
}

func TestAgentOutputSchemaIsJSON(t *testing.T) {
	t.Parallel()
	var value map[string]any
	if err := json.Unmarshal(agentOutputSchema(), &value); err != nil {
		t.Fatal(err)
	}
	required, ok := value["required"].([]any)
	if !ok || len(required) != 7 {
		t.Fatalf("schema required=%#v", value["required"])
	}
}
