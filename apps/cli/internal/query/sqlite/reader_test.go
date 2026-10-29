package sqlite_test

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/ifuryst/nomi/apps/cli/internal/query"
	reader "github.com/ifuryst/nomi/apps/cli/internal/query/sqlite"
	"github.com/ifuryst/nomi/apps/cli/internal/querytest"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
)

func requests() map[string]query.Input {
	return map[string]query.Input{
		"describe_data": {Symbols: []string{"AAPL"}}, "search_instruments": {Query: "AAPL"}, "get_company_overview": {Symbols: []string{"AAPL"}}, "query_financials": {Symbols: []string{"AAPL"}, Metrics: []string{"revenue"}}, "query_prices": {Symbols: []string{"AAPL"}}, "query_disclosures": {Symbols: []string{"AAPL"}, Kind: "filings"}, "query_ownership": {Symbols: []string{"AAPL"}}, "read_evidence": {EvidenceID: querytest.EvidenceID}}
}
func TestResearchContracts(t *testing.T) {
	dir := t.TempDir()
	db := querytest.Seed(t, dir, 730)
	defer db.Close()
	ctx := context.Background()
	r, e := reader.Open(ctx, dir)
	if e != nil {
		t.Fatal(e)
	}
	defer r.Close()
	s := query.Service{Repo: r}
	for _, tool := range query.Tools {
		t.Run(tool, func(t *testing.T) {
			out, e := s.Call(ctx, tool, requests()[tool])
			if e != nil {
				t.Fatal(e)
			}
			if len(out.Rows) == 0 {
				t.Fatal("empty fixture result")
			}
			b, _ := json.Marshal(out)
			if len(b) > query.MaxPayloadBytes || strings.Contains(string(b), "PRIVATE_MUST_NOT_LEAK") {
				t.Fatal("budget or privacy")
			}
			if len(out.ViewID) != 64 {
				t.Fatal("view")
			}
			if tool != "describe_data" && tool != "search_instruments" && tool != "read_evidence" && len(out.Evidence) == 0 {
				t.Fatal("missing provenance")
			}
		})
	}
	for _, kind := range query.Kinds {
		t.Run("kind-"+kind, func(t *testing.T) {
			out, e := s.Call(ctx, "query_disclosures", query.Input{Symbols: []string{"AAPL"}, Kind: kind})
			if e != nil || len(out.Rows) == 0 {
				t.Fatalf("%s %v", kind, e)
			}
			if kind == "earnings" && out.Rows[0]["actual"] == nil {
				t.Fatal("lost earnings actual")
			}
			if kind == "analyst" && out.Rows[0]["targetConsensus"] == nil {
				t.Fatal("lost analyst consensus")
			}
		})
	}
	annual, _ := s.Call(ctx, "query_financials", query.Input{Symbols: []string{"AAPL"}, Metrics: []string{"revenue"}, Periods: 2})
	quarterly, e := s.Call(ctx, "query_financials", query.Input{Symbols: []string{"AAPL"}, Metrics: []string{"revenue"}, Period: "quarterly", Periods: 2})
	if e != nil || len(annual.Rows) != 2 || len(quarterly.Rows) != 2 || annual.Rows[0]["unit"] != "USD" || annual.Rows[0]["period"] != "annual" || quarterly.Rows[0]["period"] != "quarterly" {
		t.Fatal("financial periods/units", e)
	}
	missing, e := s.Call(ctx, "get_company_overview", query.Input{Symbols: []string{"ZERO"}})
	if e != nil || len(missing.Rows) != 0 || missing.Coverage[0].State != "missing" {
		t.Fatal("missing must not become zero", e)
	}
	in := query.Input{Symbols: []string{"AAPL", "MSFT"}, Limit: 1}
	seen := []string{}
	for n := 0; n < 5; n++ {
		out, e := s.Call(ctx, "query_ownership", in)
		if e != nil {
			t.Fatal(e)
		}
		for _, row := range out.Rows {
			seen = append(seen, fmt.Sprint(row["symbol"])+":"+fmt.Sprint(row["holderId"]))
		}
		if out.NextCursor == "" {
			break
		}
		in.Cursor = out.NextCursor
	}
	if !reflect.DeepEqual(seen, []string{"AAPL:fixture-manager", "AAPL:prior-manager", "MSFT:fixture-manager", "MSFT:prior-manager"}) {
		t.Fatal("union pagination", seen)
	}
	priceIn := query.Input{Symbols: []string{"AAPL"}, Limit: 2}
	out, e := s.Call(ctx, "query_prices", priceIn)
	if e != nil || out.NextCursor == "" {
		t.Fatal("price cursor", e)
	}
	priceIn.Cursor = out.NextCursor
	priceIn.Basis = "raw"
	if _, e = s.Call(ctx, "query_prices", priceIn); e == nil || !strings.Contains(e.Error(), "INVALID_QUERY") {
		t.Fatal("cursor filter binding", e)
	}
	priceIn.Basis = ""
	db.Exec(`UPDATE daily_bars SET snapshot_id='MSFT-prices' WHERE symbol='AAPL' AND date='2026-10-17'`)
	if _, e = s.Call(ctx, "query_prices", priceIn); e == nil || !strings.Contains(e.Error(), "STALE_VIEW") {
		t.Fatal("changed snapshot not rejected", e)
	}
	tx, e := db.Begin()
	if e != nil {
		t.Fatal(e)
	}
	tx.Exec(`UPDATE research_config SET revision=revision+1`)
	start := time.Now()
	_, e = s.Call(ctx, "query_prices", query.Input{Symbols: []string{"MSFT"}})
	elapsed := time.Since(start)
	tx.Rollback()
	if e != nil || elapsed > 500*time.Millisecond {
		t.Fatal("writer isolation", elapsed, e)
	}
}
func TestReadOnlyBootstrap(t *testing.T) {
	ctx := context.Background()
	dir := filepath.Join(t.TempDir(), "missing")
	if r, e := reader.Open(ctx, dir); e == nil {
		r.Close()
		t.Fatal("opened absent store")
	}
	if _, e := os.Stat(dir); !os.IsNotExist(e) {
		t.Fatal("read created storage")
	}
	dir = t.TempDir()
	db := querytest.Seed(t, dir, 1)
	defer db.Close()
	db.Exec(`INSERT INTO schema_migrations VALUES(999)`)
	if _, e := reader.Open(ctx, dir); e == nil || !strings.Contains(e.Error(), "SCHEMA_UNSUPPORTED") {
		t.Fatal("unknown schema", e)
	}
}
func TestPerformanceEveryTool(t *testing.T) {
	dir := t.TempDir()
	db := querytest.Seed(t, dir, 1460)
	defer db.Close()
	ctx := context.Background()
	r, e := reader.Open(ctx, dir)
	if e != nil {
		t.Fatal(e)
	}
	defer r.Close()
	s := query.Service{Repo: r}
	for _, tool := range query.Tools {
		samples := []float64{}
		maxBytes := 0
		for i := 0; i < 31; i++ {
			start := time.Now()
			out, e := s.Call(ctx, tool, requests()[tool])
			if e != nil {
				t.Fatal(tool, e)
			}
			b, _ := json.Marshal(out)
			maxBytes = max(maxBytes, len(b))
			if i > 0 {
				samples = append(samples, float64(time.Since(start).Microseconds())/1000)
			}
		}
		sort.Float64s(samples)
		p50, p95 := samples[15], samples[28]
		t.Logf("%s p50=%.2fms p95=%.2fms bytes=%d nonempty=true", tool, p50, p95, maxBytes)
		if p95 > 500 {
			t.Fatalf("%s slow %.2fms", tool, p95)
		}
	}
}

func TestSECPeriodsAmbiguityAndEvidenceBoundaries(t *testing.T) {
	dir := t.TempDir()
	db := querytest.Seed(t, dir, 5)
	defer db.Close()
	facts := []map[string]any{
		{"metric": "revenue", "tag": "Revenues", "unit": "USD", "value": "100", "start": "2025-01-01", "end": "2025-12-31", "form": "10-K", "fiscalPeriod": "FY"},
		{"metric": "revenue", "tag": "Revenues", "unit": "USD", "value": "25", "start": "2025-10-01", "end": "2025-12-31", "form": "10-K", "fiscalPeriod": "FY"},
		{"metric": "revenue", "tag": "Revenues", "unit": "USD", "value": "30", "start": "2026-01-01", "end": "2026-03-31", "form": "10-Q", "fiscalPeriod": "Q1"},
		{"metric": "revenue", "tag": "Revenues", "unit": "USD", "value": "60", "start": "2026-01-01", "end": "2026-06-30", "form": "10-Q", "fiscalPeriod": "Q2"},
		{"metric": "cash", "tag": "Cash", "unit": "USD", "value": "20", "end": "2025-12-31", "form": "10-K", "fiscalPeriod": "FY"},
		{"metric": "cash", "tag": "Cash", "unit": "USD", "value": "23", "start": "", "end": "2026-03-31", "form": "10-Q", "fiscalPeriod": "Q1"},
	}
	b, _ := json.Marshal(map[string]any{"facts": facts, "complete": false})
	if _, e := db.Exec(`INSERT INTO research_snapshots VALUES('new-sec-facts','sec','facts','AAPL',?,?)`, querytest.Fetched, string(b)); e != nil {
		t.Fatal(e)
	}
	db.Exec(`UPDATE research_heads SET snapshot_id='new-sec-facts' WHERE dataset='facts' AND subject='AAPL'`)
	r, e := reader.Open(context.Background(), dir)
	if e != nil {
		t.Fatal(e)
	}
	defer r.Close()
	s := query.Service{Repo: r}
	for _, period := range []string{"annual", "quarterly"} {
		out, e := s.Call(context.Background(), "query_financials", query.Input{Symbols: []string{"AAPL"}, Metrics: []string{"revenue", "cash"}, Period: period})
		if e != nil || len(out.Rows) != 2 {
			t.Fatal("duration/instant semantics", period, out.Rows, e)
		}
		for _, row := range out.Rows {
			if row["value"] == "25" || row["value"] == "60" {
				t.Fatal("quarter in 10-K / YTD leaked into wrong period")
			}
		}
	}
	db.Exec(`UPDATE research_evidence SET source_url='https://finance.yahoo.com/quote/AAPL?apiKey=fixture-secret#private'`)
	out, e := s.Call(context.Background(), "query_ownership", query.Input{Symbols: []string{"AAPL"}})
	if e != nil {
		t.Fatal(e)
	}
	b, _ = json.Marshal(out)
	if strings.Contains(string(b), "fixture-secret") || strings.Contains(string(b), "#private") {
		t.Fatal("private query/fragment leaked")
	}
	db.Exec(`UPDATE research_evidence SET content_gzip=x'0001'`)
	if _, e = s.Call(context.Background(), "read_evidence", query.Input{EvidenceID: querytest.EvidenceID}); e == nil || !strings.Contains(e.Error(), "DATA_CORRUPT") {
		t.Fatal("corrupt archive reported as successful empty evidence", e)
	}
}

func TestPricesNeverSubstituteConfiguredProvider(t *testing.T) {
	dir := t.TempDir()
	db := querytest.Seed(t, dir, 5)
	defer db.Close()
	db.Exec(`INSERT INTO research_heads VALUES('prices','AAPL','AAPL-prices')`)
	db.Exec(`UPDATE research_config SET config_json='{"priceSource":"massive"}'`)
	r, e := reader.Open(context.Background(), dir)
	if e != nil {
		t.Fatal(e)
	}
	defer r.Close()
	out, e := (&query.Service{Repo: r}).Call(context.Background(), "query_prices", query.Input{Symbols: []string{"AAPL"}})
	if e != nil || len(out.Rows) != 0 || out.Coverage[0].State != "missing" {
		t.Fatal("silently substituted Yahoo bars for unavailable Massive", out, e)
	}
}
