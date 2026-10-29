package command

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/ifuryst/nomi/apps/cli/internal/arena"
	arenasqlite "github.com/ifuryst/nomi/apps/cli/internal/arena/sqlite"
	"github.com/ifuryst/nomi/apps/cli/internal/query"
	"github.com/ifuryst/nomi/apps/cli/internal/querytest"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestMCPChild(t *testing.T) {
	if os.Getenv("NOMI_MCP_TEST_CHILD") != "1" {
		return
	}
	cmd := New()
	args := []string{"--data-dir", os.Getenv("NOMI_MCP_TEST_DATA"), "mcp", "serve"}
	if raw := os.Getenv("NOMI_MCP_TEST_ARGS"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &args); err != nil {
			os.Exit(3)
		}
	}
	cmd.SetArgs(args)
	if e := cmd.Execute(); e != nil {
		os.Exit(2)
	}
	os.Exit(0)
}
func client(t *testing.T, dir string) *mcp.ClientSession {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	child := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestMCPChild$")
	child.Env = append(os.Environ(), "NOMI_MCP_TEST_CHILD=1", "NOMI_MCP_TEST_DATA="+dir)
	var stderr bytes.Buffer
	child.Stderr = &stderr
	s, e := mcp.NewClient(&mcp.Implementation{Name: "nomi-contract-test", Version: "1"}, nil).Connect(ctx, &mcp.CommandTransport{Command: child}, nil)
	if e != nil {
		t.Fatal(e, stderr.String())
	}
	t.Cleanup(func() { s.Close() })
	return s
}
func TestMCPStdioEveryToolAndCLIParity(t *testing.T) {
	dir := t.TempDir()
	db := querytest.Seed(t, dir, 100)
	db.Close()
	s := client(t, dir)
	ctx := context.Background()
	catalog, e := s.ListTools(ctx, nil)
	if e != nil || len(catalog.Tools) != 8 {
		t.Fatal("catalog", e)
	}
	inputs := map[string]map[string]any{"describe_data": {}, "search_instruments": {"query": "AAPL"}, "get_company_overview": {"symbols": []string{"AAPL"}}, "query_financials": {"symbols": []string{"AAPL"}, "metrics": []string{"revenue"}}, "query_prices": {"symbols": []string{"AAPL"}}, "query_disclosures": {"symbols": []string{"AAPL"}, "kind": "filings"}, "query_ownership": {"symbols": []string{"AAPL"}}, "read_evidence": {"evidenceId": querytest.EvidenceID}}
	for _, tool := range catalog.Tools {
		t.Run(tool.Name, func(t *testing.T) {
			if tool.OutputSchema == nil || !tool.Annotations.ReadOnlyHint {
				t.Fatal("schema/hints")
			}
			args := inputs[tool.Name]
			start := time.Now()
			out, e := s.CallTool(ctx, &mcp.CallToolParams{Name: tool.Name, Arguments: args})
			if e != nil || out.IsError {
				t.Fatal("MCP call", e, out)
			}
			raw, _ := json.Marshal(out)
			if len(raw) > 48*1024 {
				t.Fatal("wire budget")
			}
			b, _ := json.Marshal(out.StructuredContent)
			var actual query.Result
			if e = json.Unmarshal(b, &actual); e != nil || len(actual.Rows) == 0 {
				t.Fatal("structured result", e)
			}
			command := New()
			var stdout bytes.Buffer
			command.SetOut(&stdout)
			a, _ := json.Marshal(args)
			command.SetArgs([]string{"--data-dir", dir, "query", tool.Name, "--request", string(a)})
			if e = command.Execute(); e != nil {
				t.Fatal("CLI", e)
			}
			var cli query.Result
			if e = json.Unmarshal(stdout.Bytes(), &cli); e != nil {
				t.Fatal(e)
			}
			actual.ObservedAt = ""
			cli.ObservedAt = ""
			x, _ := json.Marshal(actual)
			y, _ := json.Marshal(cli)
			if string(x) != string(y) {
				t.Fatal("CLI/MCP result divergence")
			}
			t.Logf("%s MCP+CLI=%.2fms wire=%d", tool.Name, float64(time.Since(start).Microseconds())/1000, len(raw))
		})
	}
	for _, args := range []map[string]any{{"symbols": []string{"AAPL"}, "sql": "SELECT secret"}, {"symbols": []string{"AAPL"}, "limit": 51}, {"symbols": []string{"AAPL"}, "asOf": "2020-01-01"}, {"symbols": []string{"AAPL"}, "cursor": "invalid"}} {
		out, e := s.CallTool(ctx, &mcp.CallToolParams{Name: "query_prices", Arguments: args})
		if e == nil && (out == nil || !out.IsError) {
			t.Fatal("invalid request accepted", args)
		}
	}
	res, e := s.ReadResource(ctx, &mcp.ReadResourceParams{URI: "nomi://research/catalog"})
	if e != nil || len(res.Contents) != 1 || !strings.Contains(res.Contents[0].Text, "historicalKnowledgeCutoff") {
		t.Fatal("resource", e)
	}
	cancelCtx, cancel := context.WithCancel(ctx)
	cancel()
	if _, e = s.CallTool(cancelCtx, &mcp.CallToolParams{Name: "describe_data", Arguments: map[string]any{}}); e == nil {
		t.Fatal("cancel ignored")
	}
	if out, e := s.CallTool(ctx, &mcp.CallToolParams{Name: "describe_data", Arguments: map[string]any{}}); e != nil || out.IsError {
		t.Fatal("did not recover after cancellation", e)
	}
}
func TestMissingStoreMCPNoWrites(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "missing")
	s := client(t, dir)
	out, e := s.CallTool(context.Background(), &mcp.CallToolParams{Name: "describe_data", Arguments: map[string]any{}})
	if e != nil || out.IsError {
		t.Fatal("catalog unavailable", e)
	}
	if _, e = os.Stat(dir); !os.IsNotExist(e) {
		t.Fatal("MCP created data")
	}
	if out, e = s.CallTool(context.Background(), &mcp.CallToolParams{Name: "query_prices", Arguments: map[string]any{"symbols": []string{"AAPL"}}}); e != nil || !out.IsError {
		t.Fatal("missing data not error", e)
	}
	db := querytest.Seed(t, dir, 10)
	db.Close()
	if out, e = s.CallTool(context.Background(), &mcp.CallToolParams{Name: "query_prices", Arguments: map[string]any{"symbols": []string{"AAPL"}}}); e != nil || out.IsError {
		t.Fatal("no recovery after collector starts", e)
	}
	// Ending stdin closes a standard server without writing log chatter to stdout.
	cmd := New()
	cmd.SetIn(strings.NewReader(""))
	cmd.SetOut(io.Discard)
	cmd.SetArgs([]string{"--data-dir", dir, "mcp", "serve"})
	if e = cmd.Execute(); e != nil {
		t.Fatal(e)
	}
}

func TestArenaMCPStdio(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	ledger, err := arenasqlite.Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	defer ledger.Close()
	service := &arena.Service{Repo: ledger}
	e, err := service.Create(ctx)
	if err != nil {
		t.Fatal(err)
	}
	run := arena.ID()
	if _, err = service.Begin(ctx, e.ID, run, "test-model", "low"); err != nil {
		t.Fatal(err)
	}
	args, _ := json.Marshal([]string{"--data-dir", dir, "mcp", "serve", "--profile", "arena", "--episode", e.ID, "--run", run})
	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	child := exec.CommandContext(cctx, os.Args[0], "-test.run=^TestMCPChild$")
	child.Env = append(os.Environ(), "NOMI_MCP_TEST_CHILD=1", "NOMI_MCP_TEST_ARGS="+string(args))
	session, err := mcp.NewClient(&mcp.Implementation{Name: "arena-test", Version: "1"}, nil).Connect(cctx, &mcp.CommandTransport{Command: child}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil || len(tools.Tools) != 13 {
		t.Fatal("missing composed tools", err)
	}
	call := func(name string, in any) map[string]any {
		t.Helper()
		start := time.Now()
		out, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: in})
		if err != nil || out.IsError {
			t.Fatalf("%s %v %+v", name, err, out)
		}
		raw, _ := json.Marshal(out)
		if len(raw) > 48*1024 || strings.Contains(string(raw), e.Seed) {
			t.Fatal("wire budget or seed leak")
		}
		b, _ := json.Marshal(out.StructuredContent)
		var v map[string]any
		json.Unmarshal(b, &v)
		t.Logf("%s %.2fms, %d bytes", name, float64(time.Since(start).Microseconds())/1000, len(raw))
		return v
	}
	for _, name := range []string{"arena_get_portfolio_state", "arena_list_orders", "arena_get_performance"} {
		call(name, map[string]any{})
	}
	preview := call("arena_preview_rebalance", map[string]any{"targets": []map[string]any{{"symbol": "AAPL", "weightBps": 5000}, {"symbol": "JPM", "weightBps": 4000}}})
	in := map[string]any{"action": "rebalance", "proposalId": preview["previewId"], "thesis": "Diversify the virtual account with a cash buffer."}
	call("arena_submit_decision", in)
	call("arena_submit_decision", in)
	for _, bad := range []map[string]any{{"episodeId": arena.ID()}, {"limit": 51}, {"sql": "select seed"}} {
		out, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "arena_get_performance", Arguments: bad})
		if err == nil && !out.IsError {
			t.Fatal("unbounded input accepted")
		}
	}
	for _, bad := range []map[string]any{{"targets": []any{map[string]any{"symbol": "AAPL", "weightBps": 1.5}}}, {"targets": []any{map[string]any{"symbol": "AAPL", "weightBps": 1, "hidden": "seed"}}}} {
		out, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "arena_preview_rebalance", Arguments: bad})
		if err == nil && !out.IsError {
			t.Fatal("invalid target accepted")
		}
	}
	e, err = service.Finish(ctx, e.ID, run, "succeeded", "")
	if err != nil || len(e.Fills) != 2 {
		t.Fatal("no fills", err)
	}
	call("arena_list_orders", map[string]any{"limit": 1})
	call("arena_get_performance", map[string]any{"limit": 1})
}
