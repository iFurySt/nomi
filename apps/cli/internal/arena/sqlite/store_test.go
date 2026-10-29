package sqlite_test

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ifuryst/nomi/apps/cli/internal/arena"
	db "github.com/ifuryst/nomi/apps/cli/internal/arena/sqlite"
	"github.com/ifuryst/nomi/apps/cli/internal/mcpserver"
)

func TestLedgerToolsAndRecovery(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	r, err := db.Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)
	s := &arena.Service{Repo: r, Now: func() time.Time { return now }}
	e, err := s.Create(ctx)
	if err != nil {
		t.Fatal(err)
	}
	id := e.ID
	run := arena.ID()
	if _, err = s.Begin(ctx, id, run, "gpt-test", "low"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Advance(ctx, id); err == nil {
		t.Fatal("advanced active account")
	}
	if _, err = mcpserver.CallArena(ctx, s, id, arena.ID(), "arena_get_portfolio_state", mcpserver.ArenaInput{}); err == nil {
		t.Fatal("cross-run read")
	}
	invalid := [][]arena.Target{{{Symbol: "FAKE", Weight: 100}}, {{Symbol: "AAPL", Weight: -1}}, {{Symbol: "AAPL", Weight: 6000}, {Symbol: "JPM", Weight: 6000}}, {{Symbol: "AAPL", Weight: 1}, {Symbol: "AAPL", Weight: 1}}}
	for _, targets := range invalid {
		if _, err = s.Preview(ctx, id, run, targets); err == nil {
			t.Fatal("accepted invalid targets")
		}
	}
	if _, err = s.Submit(ctx, id, run, arena.Submission{Action: "rebalance", ProposalID: "stale", Thesis: "Diversify this virtual account"}); err == nil {
		t.Fatal("accepted stale preview")
	}
	targets := []arena.Target{{Symbol: "AAPL", Weight: 4000}, {Symbol: "JPM", Weight: 3000}, {Symbol: "JNJ", Weight: 3000}}
	preview, err := mcpserver.CallArena(ctx, s, id, run, "arena_preview_rebalance", mcpserver.ArenaInput{Targets: targets})
	if err != nil {
		t.Fatal(err)
	}
	submit := mcpserver.ArenaInput{Action: "rebalance", ProposalID: preview["previewId"].(string), Thesis: "Diversified synthetic portfolio; company context does not predict synthetic returns."}
	var wg sync.WaitGroup
	failures := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := mcpserver.CallArena(ctx, s, id, run, "arena_submit_decision", submit)
			failures <- err
		}()
	}
	wg.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	e, _ = r.Load(ctx, id)
	if e.Day != 0 || len(e.Fills) != 0 {
		t.Fatal("intent executed before finish")
	}
	changed := submit
	changed.Thesis = "A different public thesis"
	if _, err = mcpserver.CallArena(ctx, s, id, run, "arena_submit_decision", changed); err == nil {
		t.Fatal("second decision accepted")
	}
	r.Close()
	r, err = db.Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	s.Repo = r
	if err = r.Recover(ctx, s); err != nil {
		t.Fatal(err)
	}
	e, _ = r.Load(ctx, id)
	if e.Day != 1 || len(e.Fills) != 3 || e.Run.Status != "completed_with_warning" || e.Cash < 0 {
		t.Fatalf("bad recovered account %+v", e)
	}
	before, _ := json.Marshal(e)
	if err = r.Recover(ctx, s); err != nil {
		t.Fatal(err)
	}
	after, _ := r.Load(ctx, id)
	b, _ := json.Marshal(after)
	if string(before) != string(b) {
		t.Fatal("recovery repeated settlement")
	}
	for _, name := range mcpserver.ArenaTools {
		if name == "arena_preview_rebalance" {
			continue
		}
		out, err := mcpserver.CallArena(ctx, s, id, run, name, submitFor(name, submit))
		if err != nil {
			t.Fatalf("%s %v", name, err)
		}
		encoded, _ := json.Marshal(out)
		if strings.Contains(string(encoded), e.Seed) {
			t.Fatal("private seed leaked")
		}
	}
	if err = e.Validate(); err != nil {
		t.Fatal(err)
	}
	// Liquidate via target zero, then hold and cancellation; ledger reconciles throughout.
	run = arena.ID()
	s.Begin(ctx, id, run, "gpt-test", "low")
	e, err = s.Preview(ctx, id, run, []arena.Target{})
	if err != nil {
		t.Fatal(err)
	}
	s.Submit(ctx, id, run, arena.Submission{Action: "rebalance", ProposalID: e.Run.Proposal.ID, Thesis: "Return to cash in this simulation"})
	e, err = s.Finish(ctx, id, run, "succeeded", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range e.Positions {
		if p.Quantity != 0 {
			t.Fatal("liquidation left shares")
		}
	}
	day := e.Day
	run = arena.ID()
	s.Begin(ctx, id, run, "gpt-test", "low")
	e, err = s.Finish(ctx, id, run, "cancelled", "")
	if err != nil || e.Day != day {
		t.Fatal("cancellation changed market")
	}
	run = arena.ID()
	s.Begin(ctx, id, run, "gpt-test", "low")
	s.Submit(ctx, id, run, arena.Submission{Action: "hold", Thesis: "Hold cash pending stronger research"})
	e, err = s.Finish(ctx, id, run, "succeeded", "")
	if err != nil || e.Day != day+1 {
		t.Fatal("hold failed")
	}
	for e.Day < arena.MaxDays {
		e, err = s.Advance(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err = s.Advance(ctx, id); err == nil {
		t.Fatal("exceeded day cap")
	}
}
func submitFor(name string, in mcpserver.ArenaInput) mcpserver.ArenaInput {
	if name == "arena_submit_decision" {
		return in
	}
	return mcpserver.ArenaInput{}
}
func TestExpiredRunAndRollback(t *testing.T) {
	ctx := context.Background()
	r, err := db.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	now := time.Now()
	s := &arena.Service{Repo: r, Now: func() time.Time { return now }}
	e, _ := s.Create(ctx)
	run := arena.ID()
	s.Begin(ctx, e.ID, run, "gpt-test", "low")
	now = now.Add(11 * time.Minute)
	if _, err = s.Submit(ctx, e.ID, run, arena.Submission{Action: "hold", Thesis: "Wait for another simulated session"}); err == nil {
		t.Fatal("expired run accepted")
	}
	before, _ := r.Load(ctx, e.ID)
	_, err = r.Update(ctx, e.ID, func(e *arena.Episode) (arena.Event, error) { e.Cash = -1; return arena.Event{Kind: "corrupt"}, nil })
	if err == nil {
		t.Fatal("corruption committed")
	}
	after, _ := r.Load(ctx, e.ID)
	if before.Cash != after.Cash {
		t.Fatal("rollback failed")
	}
}
func BenchmarkPortfolioRead(b *testing.B) {
	ctx := context.Background()
	r, _ := db.Open(ctx, b.TempDir())
	defer r.Close()
	s := &arena.Service{Repo: r}
	e, _ := s.Create(ctx)
	run := arena.ID()
	s.Begin(ctx, e.ID, run, "test", "low")
	b.ResetTimer()
	for range b.N {
		if _, err := mcpserver.CallArena(ctx, s, e.ID, run, "arena_get_portfolio_state", mcpserver.ArenaInput{}); err != nil {
			b.Fatal(err)
		}
	}
}

func TestRepeatedRebalancesConserveCashSharesAndPnL(t *testing.T) {
	ctx := context.Background()
	r, err := db.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	s := &arena.Service{Repo: r}
	e, _ := s.Create(ctx)
	for n := 0; n < 120; n++ {
		run := arena.ID()
		if _, err = s.Begin(ctx, e.ID, run, "test", "low"); err != nil {
			t.Fatal(err)
		}
		targets := []arena.Target{}
		for i, a := range e.Assets {
			if (i+n)%3 == 0 {
				targets = append(targets, arena.Target{Symbol: a.Symbol, Weight: int64(1500 + (n%5)*100)})
			}
		}
		e, err = s.Preview(ctx, e.ID, run, targets)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = s.Submit(ctx, e.ID, run, arena.Submission{Action: "rebalance", ProposalID: e.Run.Proposal.ID, Thesis: "Exercise rotating synthetic sector allocations"}); err != nil {
			t.Fatal(err)
		}
		e, err = s.Finish(ctx, e.ID, run, "succeeded", "")
		if err != nil {
			t.Fatal(err)
		}
		if e.Cash < 0 {
			t.Fatal("overspent")
		}
		quantities := map[string]int64{}
		cash, pnl := arena.InitialCash, int64(0)
		for _, f := range e.Fills {
			cash += f.CashDelta
			pnl += f.Realized
			if f.Side == "buy" {
				quantities[f.Symbol] += f.Quantity
			} else {
				quantities[f.Symbol] -= f.Quantity
			}
			if quantities[f.Symbol] < 0 {
				t.Fatal("short sale")
			}
		}
		for _, p := range e.Positions {
			if quantities[p.Symbol] != p.Quantity {
				t.Fatal("share ledger mismatch")
			}
			for _, a := range e.Assets {
				if a.Symbol == p.Symbol {
					pnl += p.Quantity*a.Price/arena.ShareScale - p.Cost
				}
			}
		}
		if cash != e.Cash || pnl != e.Equity()-arena.InitialCash {
			t.Fatalf("PnL/cash failed day %d", e.Day)
		}
	}
}
