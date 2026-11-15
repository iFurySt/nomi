package syncserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	url := os.Getenv("NOMI_SYNC_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires isolated PostgreSQL: run scripts/test-sync-server.sh")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema := "t_" + strings.ReplaceAll(randomID("sync"), ".", "_")
	if _, err = admin.Exec(ctx, `CREATE SCHEMA `+pgx.Identifier{schema}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(ctx, `DROP SCHEMA `+pgx.Identifier{schema}.Sanitize()+` CASCADE`)
		admin.Close()
	})
	s := &Store{DB: pool}
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.Migrate(ctx); err != nil {
		t.Fatal("migration must be repeatable", err)
	}
	return s
}
func fixture(t *testing.T, s *Store) (User, Space) {
	t.Helper()
	ctx := context.Background()
	u, err := s.Provision(ctx, "test@example.invalid", "a-long-test-password")
	if err != nil {
		t.Fatal(err)
	}
	sp, err := s.CreateSpace(ctx, u.ID, "Test library")
	if err != nil {
		t.Fatal(err)
	}
	return u, sp
}
func mutation(kind, id string, version int64, data string) Mutation {
	return Mutation{Kind: kind, ID: id, BaseVersion: version, Data: json.RawMessage(data)}
}
func commit(ms ...Mutation) Commit {
	return Commit{Protocol: Protocol, RequestID: randomID("request"), Mutations: ms}
}
func block(id string, v int64, text string) Mutation {
	b, _ := json.Marshal(map[string]string{"id": id, "type": "markdown", "source": text})
	return Mutation{Kind: "block", ID: id, BaseVersion: v, Data: b}
}
func seed(t *testing.T, s *Store, u User, sp Space) {
	t.Helper()
	_, err := s.Commit(context.Background(), u.ID, sp.ID, commit(
		mutation("document", "document.home", 0, `{"id":"document.home","schema":"nomi-document-ir/draft-1","title":"Notes","noteOrder":["note.a","note.b"]}`),
		mutation("board", "board.home", 0, `{"id":"board.home","placements":[],"connectors":[]}`),
		mutation("note", "note.a", 0, `{"id":"note.a","title":"A"}`), mutation("note", "note.b", 0, `{"id":"note.b","title":"B"}`),
		mutation("order", "note.a", 0, `{"id":"note.a","blocks":["text.a"]}`), mutation("order", "note.b", 0, `{"id":"note.b","blocks":["text.b"]}`),
		block("text.a", 0, "original A"), block("text.b", 0, "original B"),
	))
	if err != nil {
		t.Fatal(err)
	}
}
func wantCode(t *testing.T, err error, code string) {
	t.Helper()
	var e *APIError
	if !errors.As(err, &e) || e.Code != code {
		t.Fatalf("want %s, got %v", code, err)
	}
}
func TestCommitDifferentBlocksConflictAndIdempotence(t *testing.T) {
	s := testStore(t)
	u, sp := fixture(t, s)
	seed(t, s, u, sp)
	ctx := context.Background()
	a := commit(block("text.a", 1, "Mac A change"))
	b := commit(block("text.b", 1, "Mac B change"))
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, c := range []Commit{a, b} {
		wg.Add(1)
		go func(c Commit) { defer wg.Done(); _, e := s.Commit(ctx, u.ID, sp.ID, c); errs <- e }(c)
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	snap, err := s.Snapshot(ctx, u.ID, sp.ID)
	if err != nil || snap.Cursor != 3 {
		t.Fatal(snap.Cursor, err)
	}
	r1, err := s.Commit(ctx, u.ID, sp.ID, a)
	if err != nil {
		t.Fatal(err)
	}
	r2, err := s.Commit(ctx, u.ID, sp.ID, a)
	if err != nil || r1.Sequence != r2.Sequence {
		t.Fatal(r1, r2, err)
	}
	a.Mutations[0] = block("text.a", 1, "different retry")
	_, err = s.Commit(ctx, u.ID, sp.ID, a)
	wantCode(t, err, "request_reused")
	_, err = s.Commit(ctx, u.ID, sp.ID, commit(block("text.a", 1, "stale"), block("text.b", 2, "must not partially apply")))
	wantCode(t, err, "conflict")
	snap, _ = s.Snapshot(ctx, u.ID, sp.ID)
	for _, r := range snap.Records {
		if r.ID == "text.b" && stringField(object(r), "source") != "Mac B change" {
			t.Fatal("partial write")
		}
	}
	hist, err := s.History(ctx, u.ID, sp.ID, "block", "text.a")
	if err != nil || len(hist) != 1 || stringField(object(hist[0]), "source") != "original A" {
		t.Fatal(hist, err)
	}
	// No-op sync does not create a history version or advance the change cursor.
	_, err = s.Commit(ctx, u.ID, sp.ID, commit(block("text.a", 2, "Mac A change")))
	if err != nil {
		t.Fatal(err)
	}
	snap, _ = s.Snapshot(ctx, u.ID, sp.ID)
	if snap.Cursor != 3 {
		t.Fatal("no-op advanced cursor")
	}
	var src string
	var data []byte
	if err = s.DB.QueryRow(ctx, `SELECT source,data FROM sync_entities WHERE space_id=$1 AND id='text.a'`, sp.ID).Scan(&src, &data); err != nil || src != "Mac A change" || strings.Contains(string(data), "source") {
		t.Fatal("Markdown must be stored as text", src, string(data), err)
	}
}
func TestDeleteCannotResurrectAndGraphIsAtomic(t *testing.T) {
	s := testStore(t)
	u, sp := fixture(t, s)
	seed(t, s, u, sp)
	ctx := context.Background()
	_, err := s.Commit(ctx, u.ID, sp.ID, commit(Mutation{Kind: "block", ID: "text.a", BaseVersion: 1, Deleted: true}))
	wantCode(t, err, "missing_reference")
	del := commit(Mutation{Kind: "block", ID: "text.a", BaseVersion: 1, Deleted: true}, mutation("order", "note.a", 1, `{"id":"note.a","blocks":[]}`))
	if _, err = s.Commit(ctx, u.ID, sp.ID, del); err != nil {
		t.Fatal(err)
	}
	_, err = s.Commit(ctx, u.ID, sp.ID, commit(block("text.a", 0, "new")))
	wantCode(t, err, "conflict")
	_, err = s.Commit(ctx, u.ID, sp.ID, commit(block("text.a", 1, "offline edit")))
	wantCode(t, err, "conflict")
	if _, err = s.Commit(ctx, u.ID, sp.ID, commit(block("text.a", 2, "explicit restore"))); err != nil {
		t.Fatal(err)
	}
	// Two valid-looking moves cannot jointly create a cycle, even concurrently.
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, m := range []Mutation{mutation("note", "note.a", 1, `{"id":"note.a","title":"A","parentId":"note.b"}`), mutation("note", "note.b", 1, `{"id":"note.b","title":"B","parentId":"note.a"}`)} {
		wg.Add(1)
		go func(m Mutation) { defer wg.Done(); _, e := s.Commit(ctx, u.ID, sp.ID, commit(m)); errs <- e }(m)
	}
	wg.Wait()
	close(errs)
	success, cycle := 0, 0
	for e := range errs {
		if e == nil {
			success++
		} else {
			wantCode(t, e, "parent_cycle")
			cycle++
		}
	}
	if success != 1 || cycle != 1 {
		t.Fatal(success, cycle)
	}
}
func TestCursorCommitOrderBootstrapAndIsolation(t *testing.T) {
	s := testStore(t)
	u, sp := fixture(t, s)
	seed(t, s, u, sp)
	ctx := context.Background()
	snapshot, err := s.Snapshot(ctx, u.ID, sp.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Hold the exact per-space lock used by commit; readers see the old stable waterline.
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = owned(ctx, tx, u.ID, sp.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { _, e := s.Commit(ctx, u.ID, sp.ID, commit(block("text.a", 1, "later"))); done <- e }()
	page, err := s.Changes(ctx, u.ID, sp.ID, snapshot.Cursor, 1)
	if err != nil || len(page.Changes) != 0 || page.Cursor != 1 {
		t.Fatal(page, err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err = <-done; err != nil {
		t.Fatal(err)
	}
	if _, err = s.Commit(ctx, u.ID, sp.ID, commit(block("text.b", 1, "even later"))); err != nil {
		t.Fatal(err)
	}
	page, err = s.Changes(ctx, u.ID, sp.ID, snapshot.Cursor, 1)
	if err != nil || page.Cursor != 2 || !page.HasMore {
		t.Fatal(page, err)
	}
	page, err = s.Changes(ctx, u.ID, sp.ID, page.Cursor, 1)
	if err != nil || page.Cursor != 3 || page.HasMore {
		t.Fatal(page, err)
	}
	if snapshot.Cursor != 1 {
		t.Fatal("snapshot mutated")
	}
	_, err = s.Snapshot(ctx, "other-user", sp.ID)
	wantCode(t, err, "not_found")
	_, err = s.Commit(ctx, "other-user", sp.ID, commit(block("text.a", 2, "attack")))
	wantCode(t, err, "not_found")
	_, err = s.DB.Exec(ctx, `UPDATE sync_spaces SET log_floor=2 WHERE id=$1`, sp.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Changes(ctx, u.ID, sp.ID, 1, 50)
	wantCode(t, err, "reset_required")
	_, err = s.Changes(ctx, u.ID, sp.ID, 99, 50)
	wantCode(t, err, "invalid_cursor")
}
func TestSessionRevocationAndPasswordValidation(t *testing.T) {
	s := testStore(t)
	u, _ := fixture(t, s)
	ctx := context.Background()
	_, err := s.Provision(ctx, "bad", "short")
	wantCode(t, err, "invalid_credentials")
	a, err := s.Login(ctx, Login{Email: u.Email, Password: "a-long-test-password", DeviceID: "device.a", DeviceName: "Mac A"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.Login(ctx, Login{Email: u.Email, Password: "a-long-test-password", DeviceID: "device.b", DeviceName: "Mac B"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Authenticate(ctx, a.Token); err != nil {
		t.Fatal(err)
	}
	sessions, err := s.Sessions(ctx, u.ID)
	if err != nil || len(sessions) != 2 {
		t.Fatal(sessions, err)
	}
	if err = s.Revoke(ctx, u.ID, a.SessionID); err != nil {
		t.Fatal(err)
	}
	_, err = s.Authenticate(ctx, a.Token)
	wantCode(t, err, "unauthorized")
	if _, err = s.Authenticate(ctx, b.Token); err != nil {
		t.Fatal(err)
	}
	_, err = s.Login(ctx, Login{Email: u.Email, Password: "wrong", DeviceID: "device.x"})
	wantCode(t, err, "invalid_credentials")
	_, err = s.DB.Exec(ctx, `UPDATE sync_sessions SET expires_at=$1 WHERE id=$2`, time.Now().Add(-time.Hour), b.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Authenticate(ctx, b.Token)
	wantCode(t, err, "unauthorized")
	var tokenHash string
	if err = s.DB.QueryRow(ctx, `SELECT token_hash FROM sync_sessions WHERE id=$1`, b.SessionID).Scan(&tokenHash); err != nil || tokenHash == b.Token {
		t.Fatal("raw token stored", err)
	}
}
func TestProtocolValidation(t *testing.T) {
	tests := []Commit{
		{Protocol: "future", RequestID: "request.a", Mutations: []Mutation{block("text.a", 0, "hi")}},
		commit(mutation("block", "text.a", 0, `{"id":"text.a","type":"markdown","source":"ok","__proto__":{}}`)),
		commit(mutation("block", "text.a", 0, `{"id":"text.b","type":"markdown","source":"ok"}`)),
		commit(block("text.a", -1, "bad")), commit(block("text.a", 0, "a"), block("text.a", 0, "b")),
	}
	for n, c := range tests {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			if validateCommit(&c) == nil {
				t.Fatal("accepted invalid commit")
			}
		})
	}
}
