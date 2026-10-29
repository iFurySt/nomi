package query

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

type memory struct{ rows []Row }

func (m memory) read(_ context.Context, _ string, in Input, offset, limit int) (Page, error) {
	view := strings.Repeat("a", 64)
	if in.ViewID != "" && in.ViewID != view {
		return Page{}, Fail("STALE_VIEW", "View changed")
	}
	return Page{ViewID: view, Rows: m.rows[min(offset, len(m.rows)):min(offset+limit, len(m.rows))]}, nil
}
func TestValidationBudgetsAndMemoryContract(t *testing.T) {
	for _, tc := range []struct {
		tool string
		in   Input
		code string
	}{{"query_prices", Input{}, "INVALID_QUERY"}, {"query_prices", Input{Symbols: []string{"AAPL"}, Limit: 51}, "INVALID_QUERY"}, {"query_financials", Input{Symbols: []string{"AAPL"}, Metrics: []string{"magic"}}, "UNSUPPORTED_METRIC"}, {"query_prices", Input{Symbols: []string{"AAPL"}, AsOf: "2020-01-01"}, "POINT_IN_TIME_UNAVAILABLE"}, {"search_instruments", Input{Kind: "filings"}, "INVALID_QUERY"}, {"read_evidence", Input{EvidenceID: "../../private"}, "INVALID_QUERY"}, {"query_prices", Input{Symbols: []string{"AAPL"}, Cursor: "bad"}, "INVALID_QUERY"}} {
		_, e := (&Service{Repo: memory{}}).Call(context.Background(), tc.tool, tc.in)
		if e == nil || !strings.HasPrefix(e.Error(), tc.code) {
			t.Fatalf("%s expected %s, got %v", tc.tool, tc.code, e)
		}
	}
	s := Service{Repo: memory{[]Row{{"x": strings.Repeat("x", 8000)}, {"x": strings.Repeat("x", 8000)}}}}
	in := Input{Query: "test"}
	out, e := s.Call(context.Background(), "search_instruments", in)
	if e != nil || len(out.Rows) != 1 || out.NextCursor == "" {
		t.Fatal("aggregate byte pagination", e)
	}
	b, _ := json.Marshal(out)
	if len(b) > MaxPayloadBytes {
		t.Fatal("oversize")
	}
	in.Cursor = out.NextCursor
	next, e := s.Call(context.Background(), "search_instruments", in)
	if e != nil || len(next.Rows) != 1 || next.NextCursor != "" {
		t.Fatal("continuation", e)
	}
	s.Repo = memory{[]Row{{"x": strings.Repeat("x", MaxPayloadBytes)}}}
	if _, e = s.Call(context.Background(), "search_instruments", Input{}); e == nil {
		t.Fatal("oversize individual record accepted")
	}
}

func (m memory) Describe(ctx context.Context, in Input, offset, limit int) (Page, error) {
	return m.read(ctx, "describe_data", in, offset, limit)
}

func (m memory) SearchInstruments(ctx context.Context, in Input, offset, limit int) (Page, error) {
	return m.read(ctx, "search_instruments", in, offset, limit)
}

func (m memory) CompanyOverview(ctx context.Context, in Input, offset, limit int) (Page, error) {
	return m.read(ctx, "get_company_overview", in, offset, limit)
}

func (m memory) Financials(ctx context.Context, in Input, offset, limit int) (Page, error) {
	return m.read(ctx, "query_financials", in, offset, limit)
}

func (m memory) Prices(ctx context.Context, in Input, offset, limit int) (Page, error) {
	return m.read(ctx, "query_prices", in, offset, limit)
}

func (m memory) Disclosures(ctx context.Context, in Input, offset, limit int) (Page, error) {
	return m.read(ctx, "query_disclosures", in, offset, limit)
}

func (m memory) Ownership(ctx context.Context, in Input, offset, limit int) (Page, error) {
	return m.read(ctx, "query_ownership", in, offset, limit)
}

func (m memory) Evidence(ctx context.Context, in Input, offset, limit int) (Page, error) {
	return m.read(ctx, "read_evidence", in, offset, limit)
}
