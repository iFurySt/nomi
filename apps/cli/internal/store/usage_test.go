package store

import (
	"context"
	"testing"
	"time"
)

func TestUsageDurableAndDimensions(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	s, e := Open(ctx, dir)
	if e != nil {
		t.Fatal(e)
	}
	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	add := func(id, profile, model, state string, start time.Time, usage *TokenUsage) {
		t.Helper()
		r := UsageRecord{RequestID: id, ProfileID: profile, ConversationID: "chat-1", Model: model, Effort: "low", StartedAt: start.UnixMilli(), Status: "running"}
		if e := s.RecordUsage(ctx, r); e != nil {
			t.Fatal(e)
		}
		if e := s.RecordUsage(ctx, r); e == nil {
			t.Fatal("duplicate request admitted")
		}
		if state == "running" {
			return
		}
		end := start.Add(time.Second).UnixMilli()
		r.FinishedAt = &end
		r.Status = state
		r.Usage = usage
		if e := s.RecordUsage(ctx, r); e != nil {
			t.Fatal(e)
		}
		if e := s.RecordUsage(ctx, r); e == nil {
			t.Fatal("terminal event counted twice")
		}
	}
	cached, reasoning := int64(3), int64(2)
	add("one", "account-1", "model-a", "succeeded", time.Date(2026, 10, 16, 17, 0, 0, 0, time.UTC), &TokenUsage{Input: 10, Output: 5, Total: 15, Cached: &cached, Reasoning: &reasoning})
	add("two", "account-1", "model-b", "cancelled", now.Add(-time.Hour), nil)
	add("three", "account-2", "model-a", "failed", now.Add(-time.Hour), &TokenUsage{Input: 2, Output: 0, Total: 2})
	add("old", "account-1", "model-a", "running", now.Add(-12*time.Minute), nil)
	add("active", "account-1", "model-a", "running", now.Add(-time.Minute), nil)
	if e = s.Close(); e != nil {
		t.Fatal(e)
	}
	s, e = Open(ctx, dir)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	v, e := s.Usage(ctx, UsageQuery{ProfileID: "account-1", Days: 7, Timezone: "Asia/Taipei"}, now)
	if e != nil {
		t.Fatal(e)
	}
	if v.Summary.Requests != 4 || v.Summary.Measured != 1 || v.Summary.Total != 15 || v.Summary.Cached != 3 || v.Summary.Reasoning != 2 || v.Summary.Cancelled != 1 || v.Summary.Interrupted != 1 || v.Summary.Running != 1 {
		t.Fatalf("wrong totals: %+v", v.Summary)
	}
	if len(v.Models) != 2 || len(v.Accounts) != 1 || v.ConversationCount != 1 || v.ActiveDays != 1 || v.CurrentStreak != 1 || v.Peak != 15 || v.Daily[6].Requests != 4 {
		t.Fatalf("wrong dimensions: %+v", v)
	}
	utc, e := s.Usage(ctx, UsageQuery{Days: 7, Timezone: "UTC"}, now)
	if e != nil {
		t.Fatal(e)
	}
	if utc.ActiveDays != 2 || utc.Summary.Total != 17 || utc.Summary.Requests != 5 || utc.LongestStreak != 2 {
		t.Fatalf("UTC/account separation: %+v", utc)
	}
	none, e := s.Usage(ctx, UsageQuery{ProfileID: "account-3", Days: 30, Timezone: "UTC"}, now)
	if e != nil || none.Summary.Requests != 0 || len(none.Daily) != 30 || none.Models == nil {
		t.Fatalf("empty result: %+v %v", none, e)
	}
}
func TestUsageRangeAndValidation(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	start := now.AddDate(0, 0, -8).UnixMilli()
	r := UsageRecord{RequestID: "old", ProfileID: "profile", ConversationID: "chat", Model: "model", Effort: "low", StartedAt: start, Status: "running"}
	if e := s.RecordUsage(ctx, r); e != nil {
		t.Fatal(e)
	}
	for _, q := range []UsageQuery{{Days: 8, Timezone: "UTC"}, {Days: 7, Timezone: "bad/location"}, {ProfileID: "bad/id", Days: 7, Timezone: "UTC"}} {
		if _, e := s.Usage(ctx, q, now); e == nil {
			t.Fatal("invalid query accepted")
		}
	}
	v, e := s.Usage(ctx, UsageQuery{Days: 7, Timezone: "UTC"}, now)
	if e != nil || v.Summary.Requests != 0 {
		t.Fatalf("range includes old request: %+v %v", v, e)
	}
	end := start + 1000
	r.FinishedAt = &end
	r.Status = "succeeded"
	r.Usage = &TokenUsage{Input: 10, Output: 2, Total: 99}
	if e := s.RecordUsage(ctx, r); e == nil {
		t.Fatal("inconsistent tokens accepted")
	}
	r.Usage = &TokenUsage{Input: 10, Output: 2, Total: 12}
	if e := s.RecordUsage(ctx, r); e != nil {
		t.Fatal(e)
	}
}
