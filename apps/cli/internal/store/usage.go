package store

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"sort"
	"time"
)

type TokenUsage struct {
	Input     int64  `json:"inputTokens"`
	Output    int64  `json:"outputTokens"`
	Total     int64  `json:"totalTokens"`
	Cached    *int64 `json:"cachedTokens,omitempty"`
	Reasoning *int64 `json:"reasoningTokens,omitempty"`
}
type UsageRecord struct {
	RequestID      string      `json:"requestId"`
	ProfileID      string      `json:"profileId"`
	ConversationID string      `json:"conversationId"`
	Model          string      `json:"model"`
	Effort         string      `json:"effort"`
	StartedAt      int64       `json:"startedAt"`
	FinishedAt     *int64      `json:"finishedAt,omitempty"`
	Status         string      `json:"status"`
	Usage          *TokenUsage `json:"usage,omitempty"`
}

var usageID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)
var usageModel = regexp.MustCompile(`^[a-zA-Z0-9._:-]{1,160}$`)

// Writes are private stdio operations, never renderer capabilities.
func (s *Store) RecordUsage(ctx context.Context, r UsageRecord) error {
	if !usageID.MatchString(r.RequestID) || !usageID.MatchString(r.ProfileID) || !usageID.MatchString(r.ConversationID) || !usageModel.MatchString(r.Model) || !usageModel.MatchString(r.Effort) || r.StartedAt <= 0 {
		return errors.New("invalid usage record")
	}
	if r.Status == "running" {
		if r.FinishedAt != nil || r.Usage != nil {
			return errors.New("invalid running usage")
		}
		_, e := s.db.ExecContext(ctx, `INSERT INTO ai_usage(request_id,profile_id,conversation_id,model,effort,started_at,status) VALUES(?,?,?,?,?,?,'running')`, r.RequestID, r.ProfileID, r.ConversationID, r.Model, r.Effort, r.StartedAt)
		return e // Duplicate IDs must not dispatch another inference.
	}
	if (r.Status != "succeeded" && r.Status != "failed" && r.Status != "cancelled") || r.FinishedAt == nil || *r.FinishedAt < r.StartedAt {
		return errors.New("invalid usage completion")
	}
	var input, output, total, cached, reasoning any
	if u := r.Usage; u != nil {
		if u.Input < 0 || u.Input > 1e12 || u.Output < 0 || u.Output > 1e12 || u.Total != u.Input+u.Output || u.Total > 1e12 || (u.Cached != nil && (*u.Cached < 0 || *u.Cached > u.Input)) || (u.Reasoning != nil && (*u.Reasoning < 0 || *u.Reasoning > u.Output)) {
			return errors.New("invalid token usage")
		}
		input, output, total, cached, reasoning = u.Input, u.Output, u.Total, u.Cached, u.Reasoning
	}
	result, e := s.db.ExecContext(ctx, `UPDATE ai_usage SET finished_at=?,status=?,input_tokens=?,output_tokens=?,total_tokens=?,cached_tokens=?,reasoning_tokens=? WHERE request_id=? AND profile_id=? AND conversation_id=? AND model=? AND effort=? AND started_at=? AND status='running'`, r.FinishedAt, r.Status, input, output, total, cached, reasoning, r.RequestID, r.ProfileID, r.ConversationID, r.Model, r.Effort, r.StartedAt)
	if e != nil {
		return e
	}
	n, e := result.RowsAffected()
	if e == nil && n != 1 {
		return errors.New("usage request already finished or missing")
	}
	return e
}

type UsageQuery struct {
	ProfileID string `json:"profileId,omitempty"`
	Days      int    `json:"days"`
	Timezone  string `json:"timezone"`
}
type UsageBucket struct {
	Key               string `json:"key"`
	Requests          int64  `json:"requests"`
	Succeeded         int64  `json:"succeeded"`
	Failed            int64  `json:"failed"`
	Cancelled         int64  `json:"cancelled"`
	Interrupted       int64  `json:"interrupted"`
	Running           int64  `json:"running"`
	Measured          int64  `json:"measured"`
	Input             int64  `json:"inputTokens"`
	Output            int64  `json:"outputTokens"`
	Total             int64  `json:"totalTokens"`
	Cached            int64  `json:"cachedTokens"`
	Reasoning         int64  `json:"reasoningTokens"`
	CachedMeasured    int64  `json:"cachedMeasured"`
	ReasoningMeasured int64  `json:"reasoningMeasured"`
	Duration          int64  `json:"durationMs"`
	Longest           int64  `json:"longestMs"`
}
type UsageStats struct {
	Summary           UsageBucket   `json:"summary"`
	Daily             []UsageBucket `json:"daily"`
	Models            []UsageBucket `json:"models"`
	Efforts           []UsageBucket `json:"efforts"`
	Accounts          []UsageBucket `json:"accounts"`
	Conversations     []UsageBucket `json:"conversations"`
	First             *int64        `json:"firstRecordedAt,omitempty"`
	ConversationCount int           `json:"conversationCount"`
	ActiveDays        int           `json:"activeDays"`
	CurrentStreak     int           `json:"currentStreak"`
	LongestStreak     int           `json:"longestStreak"`
	Peak              int64         `json:"peakDailyTokens"`
	Timezone          string        `json:"timezone"`
	From              string        `json:"fromDay"`
	Through           string        `json:"throughDay"`
}

func (s *Store) Usage(ctx context.Context, q UsageQuery, now time.Time) (UsageStats, error) {
	out := UsageStats{Timezone: q.Timezone, Summary: UsageBucket{Key: "total"}}
	if (q.ProfileID != "" && !usageID.MatchString(q.ProfileID)) || (q.Days != 0 && q.Days != 7 && q.Days != 30 && q.Days != 90 && q.Days != 365) || len(q.Timezone) > 100 {
		return out, errors.New("invalid usage query")
	}
	loc, e := time.LoadLocation(q.Timezone)
	if e != nil {
		return out, errors.New("invalid usage timezone")
	}
	today := time.Date(now.In(loc).Year(), now.In(loc).Month(), now.In(loc).Day(), 0, 0, 0, 0, loc)
	out.Through = today.Format("2006-01-02")
	from := int64(0)
	if q.Days > 0 {
		from = today.AddDate(0, 0, 1-q.Days).UnixMilli()
	}
	heatStart := today.AddDate(0, 0, -364)
	if from > heatStart.UnixMilli() {
		heatStart = time.UnixMilli(from).In(loc)
	}
	out.From = heatStart.Format("2006-01-02")
	rows, e := s.db.QueryContext(ctx, `SELECT profile_id,conversation_id,model,effort,started_at,finished_at,status,input_tokens,output_tokens,total_tokens,cached_tokens,reasoning_tokens FROM ai_usage WHERE (?='' OR profile_id=?) AND started_at>=? AND started_at<? ORDER BY started_at`, q.ProfileID, q.ProfileID, from, now.UnixMilli()+1)
	if e != nil {
		return out, e
	}
	defer rows.Close()
	daily, models, efforts, accounts, chats := map[string]*UsageBucket{}, map[string]*UsageBucket{}, map[string]*UsageBucket{}, map[string]*UsageBucket{}, map[string]*UsageBucket{}
	activity := map[string]bool{}
	bucket := func(m map[string]*UsageBucket, k string) *UsageBucket {
		if m[k] == nil {
			m[k] = &UsageBucket{Key: k}
		}
		return m[k]
	}
	for rows.Next() {
		var p, c, m, eff, state string
		var start int64
		var finish, input, output, total, cached, reasoning sql.NullInt64
		if e = rows.Scan(&p, &c, &m, &eff, &start, &finish, &state, &input, &output, &total, &cached, &reasoning); e != nil {
			return out, e
		}
		if out.First == nil {
			v := start
			out.First = &v
		}
		day := time.UnixMilli(start).In(loc).Format("2006-01-02")
		activity[day] = true
		if state == "running" && now.UnixMilli()-start > 660000 {
			state = "interrupted"
		}
		bs := []*UsageBucket{&out.Summary, bucket(models, m), bucket(efforts, eff), bucket(accounts, p), bucket(chats, c)}
		bs = append(bs, bucket(daily, day))
		for _, b := range bs {
			b.Requests++
			switch state {
			case "succeeded":
				b.Succeeded++
			case "failed":
				b.Failed++
			case "cancelled":
				b.Cancelled++
			case "interrupted":
				b.Interrupted++
			default:
				b.Running++
			}
			if total.Valid {
				b.Measured++
				b.Input += input.Int64
				b.Output += output.Int64
				b.Total += total.Int64
			}
			if cached.Valid {
				b.Cached += cached.Int64
				b.CachedMeasured++
			}
			if reasoning.Valid {
				b.Reasoning += reasoning.Int64
				b.ReasoningMeasured++
			}
			if finish.Valid {
				d := finish.Int64 - start
				b.Duration += d
				if d > b.Longest {
					b.Longest = d
				}
			}
		}
	}
	if e = rows.Err(); e != nil {
		return out, e
	}
	for _, b := range daily {
		if b.Total > out.Peak {
			out.Peak = b.Total
		}
	}
	// Fill calendar days so the heatmap distinguishes no activity from missing usage.
	for d := heatStart; !d.After(today); d = d.AddDate(0, 0, 1) {
		b := *bucket(daily, d.Format("2006-01-02"))
		out.Daily = append(out.Daily, b)
	}
	keys := make([]string, 0, len(activity))
	for d := range activity {
		keys = append(keys, d)
	}
	sort.Strings(keys)
	streak := 0
	prev := ""
	for _, d := range keys {
		t, _ := time.ParseInLocation("2006-01-02", d, loc)
		if prev == t.AddDate(0, 0, -1).Format("2006-01-02") {
			streak++
		} else {
			streak = 1
		}
		if streak > out.LongestStreak {
			out.LongestStreak = streak
		}
		prev = d
	}
	for d := today; activity[d.Format("2006-01-02")] || (d.Equal(today) && activity[d.AddDate(0, 0, -1).Format("2006-01-02")]); d = d.AddDate(0, 0, -1) {
		if activity[d.Format("2006-01-02")] {
			out.CurrentStreak++
		}
	}
	out.ActiveDays = len(activity)
	out.ConversationCount = len(chats)
	list := func(m map[string]*UsageBucket) []UsageBucket {
		v := make([]UsageBucket, 0, len(m))
		for _, b := range m {
			v = append(v, *b)
		}
		sort.Slice(v, func(i, j int) bool {
			if v[i].Total == v[j].Total {
				return v[i].Key < v[j].Key
			}
			return v[i].Total > v[j].Total
		})
		if len(v) > 100 {
			v = v[:100]
		}
		return v
	}
	out.Models, out.Efforts, out.Accounts, out.Conversations = list(models), list(efforts), list(accounts), list(chats)
	return out, nil
}
