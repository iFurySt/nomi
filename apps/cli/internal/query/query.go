// Package query owns agent-facing research contracts independently of storage and MCP.
package query

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"slices"
	"strings"
	"time"
)

var Tools = []string{"describe_data", "search_instruments", "get_company_overview", "query_financials", "query_prices", "query_disclosures", "query_ownership", "read_evidence"}
var Metrics = []string{"revenue", "grossProfit", "netIncome", "eps", "operatingIncome", "cash", "assets", "liabilities", "equity", "operatingCashFlow", "capex", "dividendsPaid"}
var Kinds = []string{"filings", "earnings", "insiders", "politicians", "analyst", "actions"}
var Datasets = []string{"profile", "facts", "prices", "filings", "earnings", "insiders", "politicians", "analyst", "actions", "funds"}

const MaxPayloadBytes = 16384

type Input struct {
	Query      string   `json:"query,omitempty"`
	Symbols    []string `json:"symbols,omitempty"`
	Collection string   `json:"collection,omitempty"`
	Metrics    []string `json:"metrics,omitempty"`
	Period     string   `json:"period,omitempty"`
	Periods    int      `json:"periods,omitempty"`
	Kind       string   `json:"kind,omitempty"`
	Start      string   `json:"start,omitempty"`
	End        string   `json:"end,omitempty"`
	Basis      string   `json:"basis,omitempty"`
	Limit      int      `json:"limit,omitempty"`
	Cursor     string   `json:"cursor,omitempty"`
	ViewID     string   `json:"viewId,omitempty"`
	EvidenceID string   `json:"evidenceId,omitempty"`
	AsOf       string   `json:"asOf,omitempty"`
}
type Row map[string]any
type Coverage struct {
	Symbol    string `json:"symbol"`
	Dataset   string `json:"dataset"`
	State     string `json:"state"`
	Provider  string `json:"provider,omitempty"`
	FetchedAt string `json:"fetchedAt,omitempty"`
	Complete  bool   `json:"complete"`
}
type Evidence struct {
	ID        string `json:"id"`
	Provider  string `json:"provider"`
	URL       string `json:"url,omitempty"`
	FetchedAt string `json:"fetchedAt"`
}
type Page struct {
	ViewID   string
	Rows     []Row
	Coverage []Coverage
	Evidence []Evidence
	More     bool
	Warnings []string
}

// Domain ports expose focused reads, independently of tool names or SQL.
// Each operation returns one consistent view and rejects a mismatched ViewID.
type DiscoveryRepository interface {
	Describe(context.Context, Input, int, int) (Page, error)
	SearchInstruments(context.Context, Input, int, int) (Page, error)
}
type CompanyRepository interface {
	CompanyOverview(context.Context, Input, int, int) (Page, error)
	Financials(context.Context, Input, int, int) (Page, error)
}
type MarketRepository interface {
	Prices(context.Context, Input, int, int) (Page, error)
}
type DisclosureRepository interface {
	Disclosures(context.Context, Input, int, int) (Page, error)
}
type OwnershipRepository interface {
	Ownership(context.Context, Input, int, int) (Page, error)
}
type EvidenceRepository interface {
	Evidence(context.Context, Input, int, int) (Page, error)
}
type Repository interface {
	DiscoveryRepository
	CompanyRepository
	MarketRepository
	DisclosureRepository
	OwnershipRepository
	EvidenceRepository
}

func Read(ctx context.Context, repo Repository, tool string, in Input, offset, limit int) (Page, error) {
	switch tool {
	case "describe_data":
		return repo.Describe(ctx, in, offset, limit)
	case "search_instruments":
		return repo.SearchInstruments(ctx, in, offset, limit)
	case "get_company_overview":
		return repo.CompanyOverview(ctx, in, offset, limit)
	case "query_financials":
		return repo.Financials(ctx, in, offset, limit)
	case "query_prices":
		return repo.Prices(ctx, in, offset, limit)
	case "query_disclosures":
		return repo.Disclosures(ctx, in, offset, limit)
	case "query_ownership":
		return repo.Ownership(ctx, in, offset, limit)
	case "read_evidence":
		return repo.Evidence(ctx, in, offset, limit)
	}
	return Page{}, Fail("INVALID_QUERY", "Unknown research operation")
}

type Result struct {
	SchemaVersion string     `json:"schemaVersion"`
	ViewID        string     `json:"viewId"`
	ObservedAt    string     `json:"observedAt"`
	Rows          []Row      `json:"rows"`
	Coverage      []Coverage `json:"coverage"`
	Evidence      []Evidence `json:"evidence"`
	Warnings      []string   `json:"warnings"`
	NextCursor    string     `json:"nextCursor,omitempty"`
}
type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string        { return e.Code + ": " + e.Message }
func Fail(code, message string) error { return &Error{code, message} }

type Service struct{ Repo Repository }
type cursor struct {
	Version     int    `json:"v"`
	Fingerprint string `json:"query"`
	View        string `json:"view"`
	Offset      int    `json:"offset"`
}

var symbolRE = regexp.MustCompile(`^[A-Z][A-Z0-9.$^/+=-]{0,13}$`)
var viewRE = regexp.MustCompile(`^[a-f0-9]{64}$`)
var evidenceRE = regexp.MustCompile(`^ev:[a-f0-9]{64}$`)

// Fields is the public per-tool contract shared by CLI validation and MCP schemas.
func Fields(tool string) []string {
	common := []string{"limit", "cursor", "viewId", "asOf"}
	switch tool {
	case "describe_data":
		return append(common, "symbols")
	case "search_instruments":
		return append(common, "query", "collection")
	case "get_company_overview":
		return append(common, "symbols")
	case "query_financials":
		return append(common, "symbols", "metrics", "period", "periods")
	case "query_prices":
		return append(common, "symbols", "start", "end", "basis")
	case "query_disclosures":
		return append(common, "symbols", "kind", "start", "end")
	case "query_ownership":
		return append(common, "symbols", "start", "end")
	case "read_evidence":
		return []string{"evidenceId", "asOf"}
	}
	return nil
}

func Normalize(tool string, in Input) (Input, error) {
	bad := func(msg string) (Input, error) { return in, Fail("INVALID_QUERY", msg) }
	if !slices.Contains(Tools, tool) {
		return bad("Unknown research tool")
	}
	b, _ := json.Marshal(in)
	var supplied map[string]any
	json.Unmarshal(b, &supplied)
	for key := range supplied {
		if !slices.Contains(Fields(tool), key) {
			return bad("Field " + key + " is not supported by this tool")
		}
	}
	in.Symbols = slices.Clone(in.Symbols)
	in.Metrics = slices.Clone(in.Metrics)
	if in.ViewID != "" && !viewRE.MatchString(in.ViewID) {
		return bad("Invalid viewId")
	}
	if in.AsOf != "" {
		return in, Fail("POINT_IN_TIME_UNAVAILABLE", "Historical knowledge cutoffs are not supported; source periods are not publication times")
	}
	if in.Limit == 0 {
		in.Limit = 20
	}
	if in.Limit < 1 || in.Limit > 50 {
		return bad("limit must be 1–50")
	}
	if len(in.Query) > 100 || len(in.Cursor) > 1024 || len(in.ViewID) > 80 {
		return bad("Query or cursor exceeds limits")
	}
	if len(in.Symbols) > 5 {
		return bad("At most 5 symbols per query")
	}
	seen := map[string]bool{}
	for i, s := range in.Symbols {
		s = strings.ToUpper(strings.TrimSpace(s))
		if !symbolRE.MatchString(s) || seen[s] {
			return bad("Use unique exact directory symbols")
		}
		seen[s] = true
		in.Symbols[i] = s
	}
	slices.Sort(in.Symbols)
	if in.Collection == "" {
		in.Collection = "all-us"
	}
	if !slices.Contains([]string{"all-us", "sp500", "nasdaq100"}, in.Collection) {
		return bad("Unsupported collection")
	}
	if tool != "describe_data" && tool != "search_instruments" && tool != "read_evidence" && len(in.Symbols) == 0 {
		return bad("symbols is required (up to 5)")
	}
	if in.Periods == 0 {
		in.Periods = 4
	}
	if in.Periods < 1 || in.Periods > 8 {
		return bad("periods must be 1–8")
	}
	if in.Period == "" {
		in.Period = "annual"
	}
	if in.Period != "annual" && in.Period != "quarterly" {
		return bad("period must be annual or quarterly")
	}
	if len(in.Metrics) > 12 {
		return bad("At most 12 metrics")
	}
	for _, m := range in.Metrics {
		if !slices.Contains(Metrics, m) {
			return in, Fail("UNSUPPORTED_METRIC", "Use metric identifiers from describe_data")
		}
	}
	if tool == "query_financials" && len(in.Metrics) == 0 {
		in.Metrics = []string{"revenue", "netIncome", "operatingCashFlow"}
	}
	slices.Sort(in.Metrics)
	in.Metrics = slices.Compact(in.Metrics)
	if tool == "query_disclosures" && !slices.Contains(Kinds, in.Kind) {
		return bad("kind must be filings, earnings, insiders, politicians, analyst or actions")
	}
	for _, d := range []string{in.Start, in.End} {
		if d != "" {
			if _, e := time.Parse("2006-01-02", d); e != nil {
				return bad("Dates must be YYYY-MM-DD")
			}
		}
	}
	if in.Start != "" && in.End != "" && in.Start > in.End {
		return bad("start must precede end")
	}
	if in.Basis == "" {
		in.Basis = "split-adjusted"
	}
	if in.Basis != "raw" && in.Basis != "split-adjusted" {
		return bad("basis must be raw or split-adjusted")
	}
	if tool == "read_evidence" && !evidenceRE.MatchString(in.EvidenceID) {
		return bad("Use an evidenceId returned by a research query")
	}
	return in, nil
}
func Fingerprint(tool string, in Input) string {
	in.Cursor = ""
	in.ViewID = ""
	b, _ := json.Marshal(in)
	h := sha256.Sum256(append([]byte(tool), b...))
	return hex.EncodeToString(h[:16])
}
func (s *Service) Call(ctx context.Context, tool string, input Input) (Result, error) {
	out := Result{SchemaVersion: "nomi.research.v1", ObservedAt: time.Now().UTC().Format(time.RFC3339Nano), Rows: []Row{}, Coverage: []Coverage{}, Evidence: []Evidence{}, Warnings: []string{}}
	in, e := Normalize(tool, input)
	if e != nil {
		return out, e
	}
	offset := 0
	fp := Fingerprint(tool, in)
	if in.Cursor != "" {
		b, e := base64.RawURLEncoding.DecodeString(in.Cursor)
		var c cursor
		if e != nil || json.Unmarshal(b, &c) != nil || c.Version != 1 || c.Fingerprint != fp || c.Offset < 0 || c.Offset > 100000 || !viewRE.MatchString(c.View) {
			return out, Fail("INVALID_QUERY", "Cursor does not match this query")
		}
		if in.ViewID != "" && in.ViewID != c.View {
			return out, Fail("STALE_VIEW", "Cursor and view differ")
		}
		in.ViewID = c.View
		offset = c.Offset
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	p, e := Read(ctx, s.Repo, tool, in, offset, in.Limit+1)
	if e != nil {
		return out, e
	}
	out.ViewID = p.ViewID
	out.Coverage = p.Coverage
	out.Evidence = p.Evidence
	out.Warnings = p.Warnings
	if out.Coverage == nil {
		out.Coverage = []Coverage{}
	}
	if out.Evidence == nil {
		out.Evidence = []Evidence{}
	}
	if out.Warnings == nil {
		out.Warnings = []string{}
	}
	more := p.More || len(p.Rows) > in.Limit
	if len(p.Rows) > in.Limit {
		p.Rows = p.Rows[:in.Limit]
	}
	for _, row := range p.Rows {
		out.Rows = append(out.Rows, row)
		b, _ := json.Marshal(out)
		if len(b) > MaxPayloadBytes-800 {
			out.Rows = out.Rows[:len(out.Rows)-1]
			more = true
			break
		}
	}
	if more {
		if len(out.Rows) == 0 {
			return out, Fail("RESPONSE_BUDGET_EXCEEDED", "One record exceeds output budget; narrow the query")
		}
		b, _ := json.Marshal(cursor{1, fp, p.ViewID, offset + len(out.Rows)})
		out.NextCursor = base64.RawURLEncoding.EncodeToString(b)
	}
	b, e := json.Marshal(out)
	if e != nil || len(b) > MaxPayloadBytes {
		return out, Fail("RESPONSE_BUDGET_EXCEEDED", "Narrow the symbols, metrics or date range")
	}
	return out, nil
}
func Catalog() []Row {
	return []Row{{"tools": Tools, "datasets": Datasets, "metrics": Metrics, "disclosureKinds": Kinds, "maxSymbols": 5, "defaultLimit": 20, "maxLimit": 50, "defaultPeriods": 4, "maxPeriods": 8, "maxPayloadBytes": MaxPayloadBytes, "historicalKnowledgeCutoff": false, "missingValues": "unknown, never zero; optional source fields may be absent", "priceBasis": "raw or split-adjusted daily OHLCV; stored window completeness is not certified", "readsTriggerCollection": false, "financialSemantics": "reported observations; retain source tags, periods, filing dates and currencies; no implicit TTM or investment recommendation"}}
}
func StoreError(err error) error {
	if _, ok := err.(*Error); ok {
		return err
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return Fail("QUERY_TIMEOUT", "Read cancelled or timed out")
	}
	return Fail("STORE_UNAVAILABLE", "Local research read unavailable; retry or check the data service")
}
