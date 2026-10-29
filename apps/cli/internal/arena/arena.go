// Package arena owns virtual stock accounts and deterministic execution, without storage or model dependencies.
package arena

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"
)

const InitialCash int64 = 1_000_000 // USD cents, $10,000.
const ShareScale int64 = 1_000_000
const MaxDays = 252

var identity = regexp.MustCompile(`^[a-f0-9]{32}$`)
var evidenceID = regexp.MustCompile(`^ev:[a-f0-9]{64}$`)

func mulDiv(a, b, c int64) int64 {
	return new(big.Int).Div(new(big.Int).Mul(big.NewInt(a), big.NewInt(b)), big.NewInt(c)).Int64()
}

type Asset struct {
	Symbol    string `json:"symbol"`
	Name      string `json:"name"`
	Sector    string `json:"sector"`
	Price     int64  `json:"priceCents"`
	Initial   int64  `json:"initialPriceCents"`
	ChangeBps int64  `json:"changeBps"`
}
type Position struct {
	Symbol   string `json:"symbol"`
	Quantity int64  `json:"quantityMicros"`
	Cost     int64  `json:"costCents"`
	Realized int64  `json:"realizedCents"`
}
type Target struct {
	Symbol string `json:"symbol"`
	Weight int64  `json:"weightBps"`
}
type Fill struct {
	ID        string `json:"id"`
	RunID     string `json:"runId"`
	Day       int    `json:"day"`
	Symbol    string `json:"symbol"`
	Side      string `json:"side"`
	Quantity  int64  `json:"quantityMicros"`
	Price     int64  `json:"priceCents"`
	Gross     int64  `json:"grossCents"`
	Fee       int64  `json:"feeCents"`
	CashDelta int64  `json:"cashDeltaCents"`
	Realized  int64  `json:"realizedCents"`
}
type Mark struct {
	Day        int    `json:"day"`
	Equity     int64  `json:"equityCents"`
	Cash       int64  `json:"cashCents"`
	Benchmark  int64  `json:"benchmarkCents"`
	RecordedAt string `json:"recordedAt"`
}
type Proposal struct {
	ID       string   `json:"id"`
	Revision int      `json:"revision"`
	Day      int      `json:"day"`
	Targets  []Target `json:"targets"`
}
type Intent struct {
	ID          string   `json:"id"`
	Action      string   `json:"action"`
	ProposalID  string   `json:"proposalId,omitempty"`
	Targets     []Target `json:"targets"`
	Thesis      string   `json:"thesis"`
	Evidence    []string `json:"evidence"`
	SubmittedAt string   `json:"submittedAt"`
}
type Run struct {
	AutomationID string    `json:"automationId,omitempty"`
	ID           string    `json:"id"`
	Model        string    `json:"model"`
	Effort       string    `json:"effort"`
	Status       string    `json:"status"`
	StartedAt    string    `json:"startedAt"`
	Deadline     string    `json:"deadline"`
	FinishedAt   string    `json:"finishedAt,omitempty"`
	Summary      string    `json:"summary,omitempty"`
	Intent       *Intent   `json:"intent,omitempty"`
	Proposal     *Proposal `json:"proposal,omitempty"`
	Fingerprint  string    `json:"fingerprint,omitempty"`
}
type Decision struct {
	RunID      string   `json:"runId"`
	Model      string   `json:"model"`
	Day        int      `json:"day"`
	Status     string   `json:"status"`
	Action     string   `json:"action"`
	Thesis     string   `json:"thesis"`
	Evidence   []string `json:"evidence"`
	Summary    string   `json:"summary"`
	StartedAt  string   `json:"startedAt"`
	FinishedAt string   `json:"finishedAt"`
	FillIDs    []string `json:"fillIds"`
}
type Episode struct {
	Automation  *Automation `json:"automation,omitempty"`
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	CreatedAt   string      `json:"createdAt"`
	Mode        string      `json:"mode"`
	InitialCash int64       `json:"initialCashCents"`
	Cash        int64       `json:"cashCents"`
	Revision    int         `json:"revision"`
	Day         int         `json:"day"`
	Assets      []Asset     `json:"assets"`
	Positions   []Position  `json:"positions"`
	Marks       []Mark      `json:"marks"`
	Fills       []Fill      `json:"fills"`
	Decisions   []Decision  `json:"decisions"`
	Run         *Run        `json:"run,omitempty"`
	Seed        string      `json:"-"`
}
type Event struct {
	Kind    string
	Payload any
}
type Repository interface {
	Create(context.Context, Episode) error
	Latest(context.Context) (*Episode, error)
	Load(context.Context, string) (Episode, error)
	Update(context.Context, string, func(*Episode) (Event, error)) (Episode, error)
}
type Service struct {
	Repo Repository
	Now  func() time.Time
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}
func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }
func ID() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func fail(code, msg string) error { return fmt.Errorf("%s: %s", code, msg) }
func NewEpisode(name string, now time.Time) Episode {
	e := Episode{ID: ID(), Name: "ChatGPT", CreatedAt: stamp(now), Mode: "synthetic", InitialCash: InitialCash, Cash: InitialCash, Seed: ID(), Assets: []Asset{}, Positions: []Position{}, Marks: []Mark{}, Fills: []Fill{}, Decisions: []Decision{}}
	if strings.TrimSpace(name) != "" {
		e.Name = strings.TrimSpace(name)
	}
	for _, a := range []Asset{{Symbol: "AAPL", Name: "Apple", Sector: "Technology", Price: 20000}, {Symbol: "MSFT", Name: "Microsoft", Sector: "Technology", Price: 40000}, {Symbol: "NVDA", Name: "NVIDIA", Sector: "Semiconductors", Price: 15000}, {Symbol: "AMZN", Name: "Amazon", Sector: "Consumer", Price: 18000}, {Symbol: "GOOGL", Name: "Alphabet", Sector: "Communication", Price: 18000}, {Symbol: "META", Name: "Meta", Sector: "Communication", Price: 50000}, {Symbol: "TSLA", Name: "Tesla", Sector: "Consumer", Price: 25000}, {Symbol: "JPM", Name: "JPMorgan Chase", Sector: "Financials", Price: 20000}, {Symbol: "XOM", Name: "Exxon Mobil", Sector: "Energy", Price: 10000}, {Symbol: "JNJ", Name: "Johnson & Johnson", Sector: "Healthcare", Price: 15000}, {Symbol: "COST", Name: "Costco", Sector: "Consumer", Price: 90000}, {Symbol: "UNH", Name: "UnitedHealth", Sector: "Healthcare", Price: 50000}} {
		a.Initial = a.Price
		e.Assets = append(e.Assets, a)
	}
	e.mark(now)
	return e
}
func (e *Episode) asset(symbol string) *Asset {
	for i := range e.Assets {
		if e.Assets[i].Symbol == symbol {
			return &e.Assets[i]
		}
	}
	return nil
}
func (e *Episode) position(symbol string) *Position {
	for i := range e.Positions {
		if e.Positions[i].Symbol == symbol {
			return &e.Positions[i]
		}
	}
	e.Positions = append(e.Positions, Position{Symbol: symbol})
	return &e.Positions[len(e.Positions)-1]
}
func (e *Episode) Equity() int64 {
	v := e.Cash
	for _, p := range e.Positions {
		if a := e.asset(p.Symbol); a != nil {
			v += mulDiv(p.Quantity, a.Price, ShareScale)
		}
	}
	return v
}
func (e *Episode) mark(now time.Time) {
	index := int64(0)
	for _, a := range e.Assets {
		index += InitialCash * a.Price / a.Initial
	}
	if len(e.Assets) > 0 {
		index /= int64(len(e.Assets))
	}
	e.Marks = append(e.Marks, Mark{Day: e.Day, Equity: e.Equity(), Cash: e.Cash, Benchmark: index, RecordedAt: stamp(now)})
}
func active(r *Run) bool { return r != nil && (r.Status == "running" || r.Status == "submitted") }
func (s *Service) Create(ctx context.Context) (Episode, error) {
	e := NewEpisode("ChatGPT", s.now())
	return e, s.Repo.Create(ctx, e)
}
func (s *Service) Begin(ctx context.Context, id, runID, model, effort string) (Episode, error) {
	return s.begin(ctx, id, runID, model, effort, "")
}
func (s *Service) begin(ctx context.Context, id, runID, model, effort, generation string) (Episode, error) {
	return s.Repo.Update(ctx, id, func(e *Episode) (Event, error) {
		if generation != "" {
			a := e.Automation
			if a == nil || !a.Enabled || a.ID != generation || a.Model != model || a.Effort != effort || a.Completed >= a.MaxRounds {
				return Event{}, fail("AUTOMATION_CHANGED", "Automation no longer active")
			}
			due, err := time.Parse(time.RFC3339Nano, a.NextRunAt)
			if err != nil || s.now().Before(due) {
				return Event{}, fail("NOT_DUE", "Next decision is not due yet")
			}
			a.Reason = ""
		} else if e.Automation != nil && e.Automation.Enabled {
			return Event{}, fail("AUTOMATION_ACTIVE", "Pause automatic decisions first")
		}
		if active(e.Run) {
			return Event{}, fail("ARENA_BUSY", "Finish the current session first")
		}
		if e.Day >= MaxDays {
			return Event{}, fail("EPISODE_COMPLETE", "This 252-day episode is complete")
		}
		if len(e.Decisions) >= 500 {
			return Event{}, fail("EPISODE_COMPLETE", "Start another episode")
		}
		if !identity.MatchString(runID) || model == "" || len(model) > 160 {
			return Event{}, fail("INVALID_RUN", "Invalid run identity")
		}
		e.Run = &Run{AutomationID: generation, ID: runID, Model: model, Effort: effort, Status: "running", StartedAt: stamp(s.now()), Deadline: stamp(s.now().Add(10 * time.Minute))}
		return Event{"run.started", e.Run}, nil
	})
}
func validateTargets(e *Episode, targets []Target) ([]Target, error) {
	if len(targets) > len(e.Assets) {
		return nil, fail("INVALID_TARGETS", "Too many stocks")
	}
	out := slices.Clone(targets)
	sum := int64(0)
	seen := map[string]bool{}
	for _, t := range out {
		if seen[t.Symbol] || e.asset(t.Symbol) == nil || t.Weight < 0 || t.Weight > 10000 {
			return nil, fail("INVALID_TARGETS", "Use unique available symbols and integer weights from 0 to 10000 basis points")
		}
		seen[t.Symbol] = true
		sum += t.Weight
	}
	if sum > 10000 {
		return nil, fail("INVALID_TARGETS", "Total stock weights cannot exceed 10000; remainder stays cash")
	}
	slices.SortFunc(out, func(a, b Target) int { return strings.Compare(a.Symbol, b.Symbol) })
	return out, nil
}
func bound(e *Episode, runID string, now time.Time) error {
	if e.Run == nil || e.Run.ID != runID {
		return fail("RUN_MISMATCH", "This server is bound to another session")
	}
	if !active(e.Run) {
		return fail("RUN_FINISHED", "Session is already finished")
	}
	d, err := time.Parse(time.RFC3339Nano, e.Run.Deadline)
	if err != nil || now.After(d) {
		return fail("RUN_EXPIRED", "Decision window expired")
	}
	return nil
}
func hash(v any) string {
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
func (s *Service) Preview(ctx context.Context, id, runID string, targets []Target) (Episode, error) {
	return s.Repo.Update(ctx, id, func(e *Episode) (Event, error) {
		if err := bound(e, runID, s.now()); err != nil {
			return Event{}, err
		}
		if e.Run.Intent != nil {
			return Event{}, fail("ALREADY_DECIDED", "One decision per session")
		}
		normalized, err := validateTargets(e, targets)
		if err != nil {
			return Event{}, err
		}
		p := &Proposal{Revision: e.Revision, Day: e.Day, Targets: normalized}
		p.ID = "preview-" + hash(struct {
			Run string
			P   Proposal
		}{runID, *p})[:32]
		e.Run.Proposal = p
		return Event{"decision.previewed", p}, nil
	})
}

type Submission struct {
	Action     string   `json:"action"`
	ProposalID string   `json:"proposalId,omitempty"`
	Thesis     string   `json:"thesis"`
	Evidence   []string `json:"evidence,omitempty"`
}

func (s *Service) Submit(ctx context.Context, id, runID string, in Submission) (Episode, error) {
	if in.Action != "hold" && in.Action != "rebalance" {
		return Episode{}, fail("INVALID_DECISION", "action must be hold or rebalance")
	}
	if len(strings.TrimSpace(in.Thesis)) < 8 || len(in.Thesis) > 2000 || len(in.Evidence) > 10 {
		return Episode{}, fail("INVALID_DECISION", "Provide a short public thesis (8–2000 characters), at most 10 evidence refs")
	}
	for _, v := range in.Evidence {
		u, err := url.Parse(v)
		if len(v) > 300 || !(evidenceID.MatchString(v) || (err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.RawQuery == "" && u.Fragment == "")) {
			return Episode{}, fail("INVALID_DECISION", "Use returned evidence IDs or public HTTPS source links")
		}
	}
	fingerprint := hash(in)
	return s.Repo.Update(ctx, id, func(e *Episode) (Event, error) {
		if e.Run == nil || e.Run.ID != runID {
			return Event{}, fail("RUN_MISMATCH", "This server is bound to another session")
		}
		if e.Run.Intent != nil {
			if e.Run.Fingerprint != fingerprint {
				return Event{}, fail("ALREADY_DECIDED", "A different decision was already accepted")
			}
			return Event{"decision.receipt", e.Run.Intent}, nil
		}
		if err := bound(e, runID, s.now()); err != nil {
			return Event{}, err
		}
		targets := []Target{}
		if in.Action == "rebalance" {
			p := e.Run.Proposal
			if p == nil || p.ID != in.ProposalID || p.Revision != e.Revision || p.Day != e.Day {
				return Event{}, fail("STALE_PREVIEW", "Preview the current account before submitting")
			}
			targets = slices.Clone(p.Targets)
		} else if in.ProposalID != "" {
			return Event{}, fail("INVALID_DECISION", "A hold does not use a rebalance preview")
		}
		e.Run.Intent = &Intent{ID: "decision-" + runID, Action: in.Action, ProposalID: in.ProposalID, Targets: targets, Thesis: strings.TrimSpace(in.Thesis), Evidence: slices.Clone(in.Evidence), SubmittedAt: stamp(s.now())}
		e.Run.Fingerprint = fingerprint
		e.Run.Status = "submitted"
		return Event{"decision.accepted", e.Run.Intent}, nil
	})
}

// Prices are generated only when the operator/coordinator advances the market.
// The private seed is never serialized in public state or MCP output.
func shock(seed, symbol string, day int, rangeBps int64) int64 {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%d", seed, symbol, day)))
	v := int64(h[0])<<8 | int64(h[1])
	return v%(rangeBps*2+1) - rangeBps
}
func (e *Episode) step() {
	e.Day++
	common := shock(e.Seed, "market", e.Day, 90)
	for i := range e.Assets {
		a := &e.Assets[i]
		old := a.Price
		bp := common + shock(e.Seed, a.Symbol, e.Day, 200) + 2
		a.Price = max(100, min(100_000_000, (old*(10000+bp)+5000)/10000))
		a.ChangeBps = (a.Price - old) * 10000 / old
	}
	e.Revision++
}
func gross(qty, price int64, buy bool) int64 {
	n := new(big.Int).Mul(big.NewInt(qty), big.NewInt(price))
	if buy {
		n.Add(n, big.NewInt(ShareScale-1))
	}
	return n.Div(n, big.NewInt(ShareScale)).Int64()
}
func fee(value int64) int64          { return max(1, (value*2+9999)/10000) }
func buyCost(qty, price int64) int64 { v := gross(qty, price, true); return v + fee(v) }
func (e *Episode) fill(runID, symbol, side string, quantity int64) {
	a := e.asset(symbol)
	p := e.position(symbol)
	price := a.Price * 9990 / 10000
	buy := side == "buy"
	if buy {
		price = (a.Price*10010 + 9999) / 10000
	}
	value := gross(quantity, price, buy)
	commission := fee(value)
	if quantity <= 0 || value < 100 {
		return
	}
	f := Fill{ID: fmt.Sprintf("%s-%d", runID, len(e.Fills)+1), RunID: runID, Day: e.Day, Symbol: symbol, Side: side, Quantity: quantity, Price: price, Gross: value, Fee: commission}
	if buy {
		f.CashDelta = -(value + commission)
		e.Cash += f.CashDelta
		p.Cost += value + commission
		p.Quantity += quantity
	} else {
		retired := mulDiv(p.Cost, quantity, p.Quantity)
		f.CashDelta = value - commission
		e.Cash += f.CashDelta
		f.Realized = f.CashDelta - retired
		p.Realized += f.Realized
		p.Cost -= retired
		p.Quantity -= quantity
	}
	e.Fills = append(e.Fills, f)
}
func (e *Episode) rebalance(runID string, targets []Target) {
	budget := mulDiv(e.Equity(), 9975, 10000)
	desired := map[string]int64{}
	for _, t := range targets {
		a := e.asset(t.Symbol)
		desired[t.Symbol] = min(1_000_000*ShareScale, mulDiv(mulDiv(budget, t.Weight, 10000), ShareScale, a.Price))
	}
	symbols := []string{}
	for _, a := range e.Assets {
		symbols = append(symbols, a.Symbol)
	}
	slices.Sort(symbols)
	for _, symbol := range symbols {
		p := e.position(symbol)
		if p.Quantity > desired[symbol] {
			e.fill(runID, symbol, "sell", p.Quantity-desired[symbol])
		}
	}
	for _, symbol := range symbols {
		p := e.position(symbol)
		need := desired[symbol] - p.Quantity
		if need <= 0 {
			continue
		}
		price := (e.asset(symbol).Price*10010 + 9999) / 10000
		low, high := int64(0), need
		for low < high {
			mid := (low + high + 1) / 2
			if buyCost(mid, price) <= e.Cash {
				low = mid
			} else {
				high = mid - 1
			}
		}
		e.fill(runID, symbol, "buy", low)
	}
}
func (s *Service) Finish(ctx context.Context, id, runID, status, summary string) (Episode, error) {
	return s.Repo.Update(ctx, id, func(e *Episode) (Event, error) {
		if e.Run == nil || e.Run.ID != runID {
			return Event{}, fail("RUN_MISMATCH", "Session changed")
		}
		r := e.Run
		if !active(r) {
			return Event{"run.receipt", r}, nil
		}
		if len(summary) > 4000 {
			summary = summary[:4000]
		}
		r.Summary = summary
		r.FinishedAt = stamp(s.now())
		r.Status = status
		if status != "failed" && status != "cancelled" && status != "interrupted" && status != "deferred" {
			r.Status = "failed"
		}
		before := len(e.Fills)
		decision := Decision{RunID: r.ID, Model: r.Model, Day: e.Day, Status: r.Status, Action: "error", Summary: summary, StartedAt: r.StartedAt, FinishedAt: r.FinishedAt, FillIDs: []string{}, Evidence: []string{}}
		if r.Intent != nil {
			e.step()
			if r.Intent.Action == "rebalance" {
				e.rebalance(r.ID, r.Intent.Targets)
			}
			e.mark(s.now())
			r.Status = "completed"
			if status != "succeeded" {
				r.Status = "completed_with_warning"
			}
			decision.Status = r.Status
			decision.Action = r.Intent.Action
			decision.Thesis = r.Intent.Thesis
			decision.Evidence = r.Intent.Evidence
			for _, f := range e.Fills[before:] {
				decision.FillIDs = append(decision.FillIDs, f.ID)
			}
		} else if summary == "" {
			r.Summary = "No decision was submitted; portfolio unchanged"
			decision.Summary = r.Summary
		}
		r.Proposal = nil
		s.finishAuto(e, r)
		e.Decisions = append(e.Decisions, decision)
		if err := e.Validate(); err != nil {
			return Event{}, err
		}
		return Event{"run.finished", decision}, nil
	})
}
func (s *Service) Advance(ctx context.Context, id string) (Episode, error) {
	return s.Repo.Update(ctx, id, func(e *Episode) (Event, error) {
		if e.Automation != nil && e.Automation.Enabled {
			return Event{}, fail("AUTOMATION_ACTIVE", "Pause automatic decisions before advancing the market")
		}
		if active(e.Run) {
			return Event{}, fail("ARENA_BUSY", "A decision is running")
		}
		if e.Day >= MaxDays {
			return Event{}, fail("EPISODE_COMPLETE", "This episode reached 252 simulated days")
		}
		e.step()
		e.mark(s.now())
		return Event{"market.advanced", e.Marks[len(e.Marks)-1]}, e.Validate()
	})
}
func (e *Episode) Validate() error {
	if a := e.Automation; a != nil {
		if !identity.MatchString(a.ID) || a.IntervalSeconds < 30 || a.IntervalSeconds > 86400 || a.MaxRounds < 1 || a.MaxRounds > 252 || a.Completed < 0 || a.Completed > a.MaxRounds || a.ProfileID == "" || a.Model == "" {
			return errors.New("ARENA_INVARIANT: Invalid automation")
		}
		if a.Enabled {
			if _, err := time.Parse(time.RFC3339Nano, a.NextRunAt); err != nil {
				return errors.New("ARENA_INVARIANT: Invalid next decision time")
			}
		}
	}

	if e.Mode != "synthetic" || e.InitialCash != InitialCash || e.Cash < 0 || e.Day < 0 || e.Day > MaxDays || len(e.Assets) != 12 || len(e.Positions) > 12 || len(e.Decisions) > 500 {
		return errors.New("ARENA_INVARIANT: Invalid account state")
	}
	seen := map[string]bool{}
	for _, a := range e.Assets {
		if seen[a.Symbol] || a.Price < 100 || a.Price > 100_000_000 || a.Initial < 100 {
			return errors.New("ARENA_INVARIANT: Invalid quote")
		}
		seen[a.Symbol] = true
	}
	seen = map[string]bool{}
	for _, p := range e.Positions {
		if seen[p.Symbol] || e.asset(p.Symbol) == nil || p.Quantity < 0 || p.Quantity > 1_000_000*ShareScale || p.Cost < 0 {
			return errors.New("ARENA_INVARIANT: Invalid position")
		}
		seen[p.Symbol] = true
	}
	cash := e.InitialCash
	quantities := map[string]int64{}
	ids := map[string]bool{}
	for _, f := range e.Fills {
		if ids[f.ID] || f.Quantity <= 0 || f.Day < 1 || f.Day > e.Day || e.asset(f.Symbol) == nil || (f.Side != "buy" && f.Side != "sell") || f.Fee != fee(f.Gross) || f.Gross < 100 {
			return errors.New("ARENA_INVARIANT: Invalid fill")
		}
		ids[f.ID] = true
		expected := f.Gross - f.Fee
		if f.Side == "buy" {
			quantities[f.Symbol] += f.Quantity
			expected = -(f.Gross + f.Fee)
		} else {
			quantities[f.Symbol] -= f.Quantity
		}
		if f.CashDelta != expected || quantities[f.Symbol] < 0 {
			return errors.New("ARENA_INVARIANT: Invalid cash/share movement")
		}
		cash += f.CashDelta
	}
	for _, p := range e.Positions {
		if quantities[p.Symbol] != p.Quantity {
			return errors.New("ARENA_INVARIANT: Share ledger does not reconcile")
		}
	}

	if cash != e.Cash {
		return errors.New("ARENA_INVARIANT: Cash ledger does not reconcile")
	}
	if len(e.Marks) != e.Day+1 || e.Marks[len(e.Marks)-1].Equity != e.Equity() {
		return errors.New("ARENA_INVARIANT: NAV does not reconcile")
	}
	return nil
}
func Money(cents int64) string {
	sign := ""
	if cents < 0 {
		sign = "-"
		cents = -cents
	}
	return fmt.Sprintf("%s%d.%02d", sign, cents/100, cents%100)
}
func Quantity(units int64) string { return fmt.Sprintf("%d.%06d", units/ShareScale, units%ShareScale) }
func (e *Episode) Snapshot() map[string]any {
	quotes := []map[string]any{}
	positions := []map[string]any{}
	equity := e.Equity()
	for _, a := range e.Assets {
		quotes = append(quotes, map[string]any{"symbol": a.Symbol, "name": a.Name, "sector": a.Sector, "priceUSD": Money(a.Price), "changeBps": a.ChangeBps})
	}
	for _, p := range e.Positions {
		if p.Quantity == 0 {
			continue
		}
		a := e.asset(p.Symbol)
		v := mulDiv(p.Quantity, a.Price, ShareScale)
		positions = append(positions, map[string]any{"symbol": p.Symbol, "shares": Quantity(p.Quantity), "valueUSD": Money(v), "weightBps": mulDiv(v, 10000, max(1, equity)), "unrealizedPnLUSD": Money(v - p.Cost)})
	}
	return map[string]any{"schemaVersion": "nomi.arena.v1", "episodeId": e.ID, "marketMode": "synthetic", "marketDay": e.Day, "revision": e.Revision, "startingCapitalUSD": Money(e.InitialCash), "cashUSD": Money(e.Cash), "equityUSD": Money(equity), "quotes": quotes, "positions": positions, "rules": map[string]any{"longOnly": true, "maxWeightBps": 10000, "execution": "intent settles once at next simulated step, not current quote", "spreadBps": 10, "feeBps": 2, "minimumFeeUSD": "0.01", "minimumTradeUSD": "1.00", "allocationReserveBps": 25, "shareDecimals": 6}, "warning": "Synthetic stock prices and outcomes; real-company research is context, not a prediction or historical backtest. Equal-weight market benchmark excludes costs."}
}
func (e *Episode) Performance() map[string]any {
	peak, drawdown := int64(0), float64(0)
	fees := int64(0)
	for _, m := range e.Marks {
		peak = max(peak, m.Equity)
		if peak > 0 {
			drawdown = math.Max(drawdown, float64(peak-m.Equity)/float64(peak))
		}
	}
	for _, f := range e.Fills {
		fees += f.Fee
	}
	return map[string]any{"equityUSD": Money(e.Equity()), "pnlUSD": Money(e.Equity() - e.InitialCash), "returnBps": int64(math.Round(float64(e.Equity()-e.InitialCash) * 10000 / float64(e.InitialCash))), "maxDrawdownBps": int64(math.Round(drawdown * 10000)), "feesUSD": Money(fees), "tradeCount": len(e.Fills), "marketDay": e.Day, "benchmark": "equal-weight synthetic market before costs"}
}

// PreviewProjection uses only the current visible quote, never the private next-step seed.
func (e Episode) PreviewProjection() map[string]any {
	b, _ := json.Marshal(e)
	var estimate Episode
	_ = json.Unmarshal(b, &estimate)
	estimate.Fills = []Fill{}
	estimate.rebalance(e.Run.ID, e.Run.Proposal.Targets)
	fees := int64(0)
	for _, f := range estimate.Fills {
		fees += f.Fee
	}
	return map[string]any{"previewId": e.Run.Proposal.ID, "targets": e.Run.Proposal.Targets, "estimatedCashUSD": Money(estimate.Cash), "estimatedFeesUSD": Money(fees), "estimatedFills": estimate.Fills, "warning": "Estimates at current synthetic quotes only. Intent executes at next simulated step; weights may differ after spread, fees, reserve and price movement."}
}
