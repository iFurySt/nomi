package service

import (
	"context"
	"encoding/json"
	"errors"
	"sync"

	"github.com/ifuryst/nomi/apps/cli/internal/arena"
	arenasqlite "github.com/ifuryst/nomi/apps/cli/internal/arena/sqlite"
)

type arenaState struct {
	mu    sync.Mutex
	store *arenasqlite.Store
}

func (s *Service) arenaDispatch(ctx context.Context, req Request) (any, error) {
	s.arena.mu.Lock()
	defer s.arena.mu.Unlock()
	if s.arena.store == nil {
		var err error
		s.arena.store, err = arenasqlite.Open(ctx, s.DataDir)
		if err != nil {
			return nil, err
		}
	}
	a := &arena.Service{Repo: s.arena.store, Now: s.Now}
	var in struct {
		EpisodeID       string `json:"episodeId"`
		RunID           string `json:"runId"`
		Model           string `json:"model"`
		Effort          string `json:"effort"`
		Status          string `json:"status"`
		Summary         string `json:"summary"`
		AutomationID    string `json:"automationId"`
		ProfileID       string `json:"profileId"`
		IntervalSeconds int    `json:"intervalSeconds"`
		MaxRounds       int    `json:"maxRounds"`
	}
	if len(req.Params) > 0 && string(req.Params) != "null" {
		if err := decode(req.Params, &in); err != nil {
			return nil, err
		}
	}
	switch req.Method {
	case "arena.read":
		e, err := s.arena.store.Latest(ctx)
		if err != nil {
			return nil, err
		}
		if e == nil {
			return map[string]any{"episode": nil}, nil
		}
		return arenaView(*e), nil
	case "arena.create":
		latest, err := s.arena.store.Latest(ctx)
		if err != nil {
			return nil, err
		}
		if latest != nil && ((latest.Automation != nil && latest.Automation.Enabled) || (latest.Run != nil && (latest.Run.Status == "running" || latest.Run.Status == "submitted"))) {
			return nil, errors.New("ARENA_BUSY: Session running")
		}
		e, err := a.Create(ctx)
		return arenaView(e), err
	case "arena.advance":
		e, err := a.Advance(ctx, in.EpisodeID)
		return arenaView(e), err
	// These methods are private host control plane, deliberately absent from renderer DataMethod.
	case "arena.auto.start":
		e, err := a.StartAuto(ctx, in.EpisodeID, arena.AutoConfig{ProfileID: in.ProfileID, Model: in.Model, Effort: in.Effort, IntervalSeconds: in.IntervalSeconds, MaxRounds: in.MaxRounds})
		return arenaView(e), err
	case "arena.auto.pause":
		e, err := a.PauseAuto(ctx, in.EpisodeID, in.Summary)
		return arenaView(e), err
	case "arena.auto.defer":
		e, err := a.DeferAuto(ctx, in.EpisodeID, in.AutomationID, in.Summary)
		return arenaView(e), err
	case "arena.run.begin":
		if in.AutomationID != "" {
			e, err := a.BeginAuto(ctx, in.EpisodeID, in.RunID, in.Model, in.Effort, in.AutomationID)
			return arenaView(e), err
		}
		e, err := a.Begin(ctx, in.EpisodeID, in.RunID, in.Model, in.Effort)
		return arenaView(e), err
	case "arena.run.finish":
		e, err := a.Finish(ctx, in.EpisodeID, in.RunID, in.Status, in.Summary)
		return arenaView(e), err
	case "arena.recover":
		return nil, s.arena.store.Recover(ctx, a)
	}
	return nil, errors.New("Unknown arena method")
}
func arenaView(e arena.Episode) map[string]any {
	// Public episode omits the private future-market seed via its JSON tags.
	b, _ := json.Marshal(e)
	var public any
	_ = json.Unmarshal(b, &public)
	return map[string]any{"episode": public, "account": e.Snapshot(), "performance": e.Performance()}
}
