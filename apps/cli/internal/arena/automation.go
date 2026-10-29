package arena

import (
	"context"
	"strings"
	"time"
)

type Automation struct {
	ID              string `json:"id"`
	Enabled         bool   `json:"enabled"`
	ProfileID       string `json:"profileId"`
	Model           string `json:"model"`
	Effort          string `json:"effort,omitempty"`
	IntervalSeconds int    `json:"intervalSeconds"`
	MaxRounds       int    `json:"maxRounds"`
	Completed       int    `json:"completed"`
	StartedAt       string `json:"startedAt"`
	NextRunAt       string `json:"nextRunAt,omitempty"`
	Reason          string `json:"reason,omitempty"`
}
type AutoConfig struct {
	ProfileID       string `json:"profileId"`
	Model           string `json:"model"`
	Effort          string `json:"effort,omitempty"`
	IntervalSeconds int    `json:"intervalSeconds"`
	MaxRounds       int    `json:"maxRounds"`
}

func (s *Service) StartAuto(ctx context.Context, id string, in AutoConfig) (Episode, error) {
	return s.Repo.Update(ctx, id, func(e *Episode) (Event, error) {
		if active(e.Run) || (e.Automation != nil && e.Automation.Enabled) {
			return Event{}, fail("ARENA_BUSY", "Pause the existing session or automation first")
		}
		old := e.Automation
		resume := old != nil && old.Completed < old.MaxRounds && old.ProfileID == in.ProfileID && old.Model == in.Model && old.Effort == in.Effort && old.IntervalSeconds == in.IntervalSeconds && old.MaxRounds == in.MaxRounds
		remaining := in.MaxRounds
		if resume {
			remaining -= old.Completed
		}
		if in.IntervalSeconds < 30 || in.IntervalSeconds > 86400 || in.MaxRounds < 1 || remaining > MaxDays-e.Day || remaining > 500-len(e.Decisions) || strings.TrimSpace(in.ProfileID) == "" || len(in.ProfileID) > 160 || strings.TrimSpace(in.Model) == "" || len(in.Model) > 160 || len(in.Effort) > 20 {
			return Event{}, fail("INVALID_AUTOMATION", "Choose 30..86400 seconds and a valid remaining round budget")
		}
		if resume {
			// Preserve the budget but fence any pre-pause queued admission.
			old.ID = ID()
			old.Enabled = true
			old.NextRunAt = stamp(s.now())
			old.Reason = ""
			return Event{"automation.resumed", old}, nil
		}
		e.Automation = &Automation{ID: ID(), Enabled: true, ProfileID: in.ProfileID, Model: in.Model, Effort: in.Effort, IntervalSeconds: in.IntervalSeconds, MaxRounds: in.MaxRounds, StartedAt: stamp(s.now()), NextRunAt: stamp(s.now())}
		return Event{"automation.started", e.Automation}, nil
	})
}
func (s *Service) PauseAuto(ctx context.Context, id, reason string) (Episode, error) {
	return s.Repo.Update(ctx, id, func(e *Episode) (Event, error) {
		if e.Automation != nil {
			e.Automation.Enabled = false
			e.Automation.NextRunAt = ""
			e.Automation.Reason = reason[:min(len(reason), 300)]
		}
		return Event{"automation.paused", e.Automation}, nil
	})
}
func (s *Service) DeferAuto(ctx context.Context, id, generation, reason string) (Episode, error) {
	return s.Repo.Update(ctx, id, func(e *Episode) (Event, error) {
		a := e.Automation
		if a == nil || !a.Enabled || a.ID != generation {
			return Event{}, fail("AUTOMATION_CHANGED", "Automation no longer active")
		}
		a.NextRunAt = stamp(s.now().Add(15 * time.Second))
		a.Reason = reason[:min(len(reason), 300)]
		return Event{"automation.deferred", a}, nil
	})
}
func (s *Service) BeginAuto(ctx context.Context, id, runID, model, effort, generation string) (Episode, error) {
	return s.begin(ctx, id, runID, model, effort, generation)
}
func (s *Service) finishAuto(e *Episode, r *Run) {
	a := e.Automation
	if a == nil || r.AutomationID == "" || a.ID != r.AutomationID {
		return
	}
	if r.Intent != nil {
		a.Completed++
		if a.Enabled {
			a.Reason = ""
		}
	} else if r.Status == "interrupted" && a.Enabled {
		a.Reason = "Resuming after interrupted session"
	} else if r.Status == "deferred" && a.Enabled {
		a.Reason = "Waiting for the current ChatGPT request"
	} else {
		if a.Enabled || a.Reason == "" {
			a.Reason = "Session ended without a committed decision; review the decision feed before restarting."
		}
		a.Enabled = false
	}
	if a.Completed >= a.MaxRounds {
		a.Enabled = false
		a.Reason = "Round limit reached"
	}
	if e.Day >= MaxDays {
		a.Enabled = false
		a.Reason = "Simulation complete"
	}
	a.NextRunAt = ""
	if a.Enabled {
		wait := time.Duration(a.IntervalSeconds) * time.Second
		if r.Status == "deferred" {
			wait = 15 * time.Second
		}
		a.NextRunAt = stamp(s.now().Add(wait))
	}
}
