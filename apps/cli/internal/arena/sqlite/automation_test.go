package sqlite_test

import (
	"context"
	"testing"
	"time"

	"github.com/ifuryst/nomi/apps/cli/internal/arena"
	db "github.com/ifuryst/nomi/apps/cli/internal/arena/sqlite"
)

func TestDurableAutomationRoundsPauseAndRecovery(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	r, err := db.Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	s := &arena.Service{Repo: r, Now: func() time.Time { return now }}
	e, _ := s.Create(ctx)
	cfg := arena.AutoConfig{ProfileID: "test-profile", Model: "test-model", Effort: "low", IntervalSeconds: 30, MaxRounds: 3}
	for _, bad := range []arena.AutoConfig{{ProfileID: "p", Model: "m", IntervalSeconds: 0, MaxRounds: 3}, {ProfileID: "p", Model: "m", IntervalSeconds: 30, MaxRounds: 253}} {
		if _, err = s.StartAuto(ctx, e.ID, bad); err == nil {
			t.Fatal("invalid config accepted")
		}
	}
	e, err = s.StartAuto(ctx, e.ID, cfg)
	if err != nil {
		t.Fatal(err)
	}
	generation := e.Automation.ID
	if _, err = s.Advance(ctx, e.ID); err == nil {
		t.Fatal("manual advance while automated")
	}
	if _, err = s.Begin(ctx, e.ID, arena.ID(), cfg.Model, cfg.Effort); err == nil {
		t.Fatal("manual run while automated")
	}
	for round := 0; round < 3; round++ {
		run := arena.ID()
		if _, err = s.BeginAuto(ctx, e.ID, run, cfg.Model, cfg.Effort, generation); err != nil {
			t.Fatal(err)
		}
		if _, err = s.Submit(ctx, e.ID, run, arena.Submission{Action: "hold", Thesis: "Hold the diversified synthetic portfolio"}); err != nil {
			t.Fatal(err)
		}
		if round == 1 {
			// An accepted intent survives process restart; progress is settled atomically once.
			r.Close()
			r, err = db.Open(ctx, dir)
			if err != nil {
				t.Fatal(err)
			}
			s.Repo = r
			if err = r.Recover(ctx, s); err != nil {
				t.Fatal(err)
			}
			if err = r.Recover(ctx, s); err != nil {
				t.Fatal(err)
			}
			e, _ = r.Load(ctx, e.ID)
		} else {
			e, err = s.Finish(ctx, e.ID, run, "succeeded", "")
			if err != nil {
				t.Fatal(err)
			}
		}
		if e.Automation.Completed != round+1 || e.Day != round+1 {
			t.Fatal("clock/progress mismatch", e.Automation, e.Day)
		}
		if round < 2 {
			if _, err = s.BeginAuto(ctx, e.ID, arena.ID(), cfg.Model, cfg.Effort, generation); err == nil {
				t.Fatal("started before due")
			}
			e, err = s.PauseAuto(ctx, e.ID, "Paused by you")
			if err != nil {
				t.Fatal(err)
			}
			e, err = s.StartAuto(ctx, e.ID, cfg)
			if err != nil || e.Automation.ID == generation || e.Automation.Completed != round+1 {
				t.Fatal("resume lost progress or did not rotate generation", err)
			}
			generation = e.Automation.ID
			// Deferral affects wall-time scheduling only, not market or remaining rounds.
			e, err = s.DeferAuto(ctx, e.ID, generation, "Chat busy")
			if err != nil {
				t.Fatal(err)
			}
			if _, err = s.BeginAuto(ctx, e.ID, arena.ID(), cfg.Model, cfg.Effort, generation); err == nil {
				t.Fatal("ignored deferral")
			}
			now = now.Add(31 * time.Second)
		}
	}
	defer r.Close()
	if e.Automation.Enabled || e.Automation.Reason != "Round limit reached" {
		t.Fatal("round cap failed")
	}
	if _, err = s.BeginAuto(ctx, e.ID, arena.ID(), cfg.Model, cfg.Effort, generation); err == nil {
		t.Fatal("finished generation ran")
	}
}
func TestAutomaticPauseFencesPendingRunsAndFailures(t *testing.T) {
	ctx := context.Background()
	r, _ := db.Open(ctx, t.TempDir())
	defer r.Close()
	s := &arena.Service{Repo: r}
	e, _ := s.Create(ctx)
	cfg := arena.AutoConfig{ProfileID: "p", Model: "m", IntervalSeconds: 30, MaxRounds: 3}
	e, _ = s.StartAuto(ctx, e.ID, cfg)
	old := e.Automation.ID
	s.PauseAuto(ctx, e.ID, "Paused by you")
	if _, err := s.BeginAuto(ctx, e.ID, arena.ID(), cfg.Model, "", old); err == nil {
		t.Fatal("paused timer admitted")
	}
	cfg.MaxRounds = 2
	e, _ = s.StartAuto(ctx, e.ID, cfg)
	if _, err := s.BeginAuto(ctx, e.ID, arena.ID(), cfg.Model, "", old); err == nil {
		t.Fatal("stale generation admitted")
	}
	run := arena.ID()
	s.BeginAuto(ctx, e.ID, run, cfg.Model, "", e.Automation.ID)
	e, err := s.Finish(ctx, e.ID, run, "failed", "No available model")
	if err != nil || e.Day != 0 || e.Automation.Completed != 0 || e.Automation.Enabled {
		t.Fatal("failed session advanced/continued", err)
	}
	e, _ = s.StartAuto(ctx, e.ID, cfg)
	run = arena.ID()
	s.BeginAuto(ctx, e.ID, run, cfg.Model, "", e.Automation.ID)
	s.Submit(ctx, e.ID, run, arena.Submission{Action: "hold", Thesis: "Keep positions while paused by the operator"})
	s.PauseAuto(ctx, e.ID, "Paused by you")
	e, err = s.Finish(ctx, e.ID, run, "cancelled", "")
	if err != nil || e.Day != 1 || e.Automation.Completed != 1 || e.Automation.Enabled {
		t.Fatal("pause lost committed intent", err)
	}
}

func TestInterruptedAutomaticRoundResumesWithoutSpendingBudget(t *testing.T) {
	ctx := context.Background()
	r, _ := db.Open(ctx, t.TempDir())
	defer r.Close()
	s := &arena.Service{Repo: r}
	e, _ := s.Create(ctx)
	cfg := arena.AutoConfig{ProfileID: "p", Model: "m", IntervalSeconds: 60, MaxRounds: 3}
	e, _ = s.StartAuto(ctx, e.ID, cfg)
	run := arena.ID()
	s.BeginAuto(ctx, e.ID, run, "m", "", e.Automation.ID)
	if err := r.Recover(ctx, s); err != nil {
		t.Fatal(err)
	}
	e, _ = r.Load(ctx, e.ID)
	if !e.Automation.Enabled || e.Automation.Completed != 0 || e.Day != 0 || e.Run.Status != "interrupted" {
		t.Fatal("interruption changed portfolio/budget or lost scheduling")
	}
	if err := r.Recover(ctx, s); err != nil {
		t.Fatal(err)
	}
	again, _ := r.Load(ctx, e.ID)
	if len(again.Decisions) != 1 {
		t.Fatal("recovery repeated attempt")
	}
}
