package syncserver

import (
	"context"
	"testing"
	"time"
)

func TestRetentionUnionAndLogPrefix(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u, sp := fixture(t, s)
	now := time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC)
	// A quiet entity still retains 50 old versions; a busy one retains all 200 recent versions.
	for _, x := range []struct {
		id  string
		n   int
		age time.Duration
	}{{"quiet", 80, 180 * 24 * time.Hour}, {"busy", 200, 24 * time.Hour}, {"small", 8, 300 * 24 * time.Hour}, {"boundary", 60, 30 * 24 * time.Hour}} {
		_, err := s.DB.Exec(ctx, `INSERT INTO sync_history(space_id,kind,id,version,deleted,data,archived_at) SELECT $1,'block',$2,g,false,jsonb_build_object('id',$2::text,'type','markdown'),$4 FROM generate_series(1,$3::integer) g`, sp.ID, x.id, x.n, now.Add(-x.age))
		if err != nil {
			t.Fatal(err)
		}
	}
	_, err := s.DB.Exec(ctx, `UPDATE sync_spaces SET sequence=4 WHERE id=$1`, sp.ID)
	if err != nil {
		t.Fatal(err)
	}
	for i, age := range []time.Duration{100 * 24 * time.Hour, 99 * 24 * time.Hour, 24 * time.Hour, 95 * 24 * time.Hour} {
		_, err = s.DB.Exec(ctx, `INSERT INTO sync_changes(space_id,sequence,records,created_at) VALUES($1,$2,'[]',$3)`, sp.ID, i+1, now.Add(-age))
		if err != nil {
			t.Fatal(err)
		}
	}
	report, err := s.Maintain(ctx, now, false)
	if err != nil {
		t.Fatal(err)
	}
	if report.History != 30 || report.Changes != 2 {
		t.Fatalf("dry-run: %+v", report)
	}
	var count int
	_ = s.DB.QueryRow(ctx, `SELECT count(*) FROM sync_history WHERE space_id=$1`, sp.ID).Scan(&count)
	if count != 348 {
		t.Fatal(count)
	}
	report, err = s.Maintain(ctx, now, true)
	if err != nil {
		t.Fatal(err)
	}
	if report.History != 30 || report.Changes != 2 {
		t.Fatalf("apply: %+v", report)
	}
	for id, want := range map[string]int{"quiet": 50, "busy": 200, "small": 8, "boundary": 60} {
		_ = s.DB.QueryRow(ctx, `SELECT count(*) FROM sync_history WHERE space_id=$1 AND id=$2`, sp.ID, id).Scan(&count)
		if count != want {
			t.Fatalf("%s: %d", id, count)
		}
	}
	if _, err = s.Changes(ctx, u.ID, sp.ID, 1, 50); err == nil {
		t.Fatal("old cursor accepted")
	}
	changes, err := s.Changes(ctx, u.ID, sp.ID, 2, 50)
	if err != nil || len(changes.Changes) != 2 {
		t.Fatalf("prefix pruning lost fresh log: %+v %v", changes, err)
	}
	first, err := s.HistoryPage(ctx, u.ID, sp.ID, "block", "busy", 0, 30)
	if err != nil || len(first) != 30 || first[0].Version != 200 {
		t.Fatal(first, err)
	}
	second, err := s.HistoryPage(ctx, u.ID, sp.ID, "block", "busy", first[len(first)-1].Version, 30)
	if err != nil || second[0].Version != 170 {
		t.Fatal(second, err)
	}
	report, err = s.Maintain(ctx, now, true)
	if err != nil || report.History != 0 || report.Changes != 0 {
		t.Fatal(report, err)
	}
}
func TestRetentionPreservesCurrentTombstoneAndReceipt(t *testing.T) {
	s := testStore(t)
	u, sp := fixture(t, s)
	seed(t, s, u, sp)
	ctx := context.Background()
	c := commit(Mutation{Kind: "block", ID: "text.a", BaseVersion: 1, Deleted: true}, mutation("order", "note.a", 1, `{"id":"note.a","blocks":[]}`))
	receipt, err := s.Commit(ctx, u.ID, sp.ID, c)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Maintain(ctx, time.Now().Add(400*24*time.Hour), true); err != nil {
		t.Fatal(err)
	}
	replay, err := s.Commit(ctx, u.ID, sp.ID, c)
	if err != nil || replay.Sequence != receipt.Sequence {
		t.Fatal(replay, err)
	}
	_, err = s.Commit(ctx, u.ID, sp.ID, commit(block("text.a", 0, "stale resurrection")))
	wantCode(t, err, "conflict")
	snapshot, err := s.Snapshot(ctx, u.ID, sp.ID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, r := range snapshot.Records {
		if r.ID == "text.a" {
			found = r.Deleted && r.Version == 2
		}
	}
	if !found {
		t.Fatal("tombstone expired")
	}
}
