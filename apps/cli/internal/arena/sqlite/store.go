// Package sqlite implements the arena repository in a dedicated durable ledger.
package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/ifuryst/nomi/apps/cli/internal/arena"
	_ "modernc.org/sqlite"
	"net/url"
	"os"
	"path/filepath"
)

type Store struct{ db *sql.DB }

func Open(ctx context.Context, dir string) (*Store, error) {
	if e := os.MkdirAll(dir, 0700); e != nil {
		return nil, e
	}
	path, e := filepath.Abs(filepath.Join(dir, "arena.sqlite"))
	if e != nil {
		return nil, e
	}
	f, e := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if e != nil {
		return nil, e
	}
	f.Close()
	uri := url.URL{Scheme: "file", Path: filepath.ToSlash(path)}
	uri.RawQuery = "_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_txlock=immediate"
	db, e := sql.Open("sqlite", uri.String())
	if e != nil {
		return nil, e
	}
	db.SetMaxOpenConns(1)
	fail := func(e error) (*Store, error) { db.Close(); return nil, e }
	if _, e = db.ExecContext(ctx, "PRAGMA journal_mode=WAL"); e != nil {
		return fail(e)
	}
	if _, e = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS arena_schema(version INTEGER PRIMARY KEY);`); e != nil {
		return fail(e)
	}
	var version int
	if e = db.QueryRowContext(ctx, "SELECT COALESCE(MAX(version),0) FROM arena_schema").Scan(&version); e != nil {
		return fail(e)
	}
	if version > 1 {
		return fail(errors.New("ARENA_SCHEMA: Use a compatible Nomi version"))
	}
	if _, e = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS arena_episodes(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,revision INTEGER NOT NULL,seed TEXT NOT NULL,state_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS arena_events(episode_id TEXT NOT NULL,sequence INTEGER NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(episode_id,sequence)); INSERT OR IGNORE INTO arena_schema VALUES(1);`); e != nil {
		return fail(e)
	}
	return &Store{db}, nil
}
func (s *Store) Close() error { return s.db.Close() }
func (s *Store) Create(ctx context.Context, e arena.Episode) error {
	if err := e.Validate(); err != nil {
		return err
	}
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO arena_episodes VALUES(?,?,0,?,?)`, e.ID, e.CreatedAt, e.Seed, string(b))
	return err
}
func decode(raw, seed string) (arena.Episode, error) {
	var e arena.Episode
	err := json.Unmarshal([]byte(raw), &e)
	e.Seed = seed
	return e, err
}
func (s *Store) Latest(ctx context.Context) (*arena.Episode, error) {
	var raw, seed string
	err := s.db.QueryRowContext(ctx, "SELECT state_json,seed FROM arena_episodes ORDER BY created_at DESC,id DESC LIMIT 1").Scan(&raw, &seed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e, err := decode(raw, seed)
	return &e, err
}
func (s *Store) Load(ctx context.Context, id string) (arena.Episode, error) {
	var raw, seed string
	err := s.db.QueryRowContext(ctx, "SELECT state_json,seed FROM arena_episodes WHERE id=?", id).Scan(&raw, &seed)
	if errors.Is(err, sql.ErrNoRows) {
		return arena.Episode{}, errors.New("ARENA_MISSING: Episode not found")
	}
	if err != nil {
		return arena.Episode{}, err
	}
	return decode(raw, seed)
}
func (s *Store) Update(ctx context.Context, id string, change func(*arena.Episode) (arena.Event, error)) (out arena.Episode, err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	var raw, seed string
	var version int
	if err = tx.QueryRowContext(ctx, "SELECT state_json,seed,revision FROM arena_episodes WHERE id=?", id).Scan(&raw, &seed, &version); err != nil {
		return out, errors.New("ARENA_MISSING: Episode not found")
	}
	out, err = decode(raw, seed)
	if err != nil {
		return out, err
	}
	event, err := change(&out)
	if err != nil {
		return out, err
	}
	if err = out.Validate(); err != nil {
		return out, err
	}
	b, err := json.Marshal(out)
	if err != nil {
		return out, err
	}
	if len(b) > 4*1024*1024 {
		return out, errors.New("ARENA_LIMIT: Episode history is full")
	}
	result, err := tx.ExecContext(ctx, "UPDATE arena_episodes SET revision=?,state_json=? WHERE id=? AND revision=?", version+1, string(b), id, version)
	if err != nil {
		return out, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return out, err
	}
	if rows != 1 {
		return out, errors.New("ARENA_CONFLICT: Account changed; retry")
	}

	payload, err := json.Marshal(event.Payload)
	if err != nil {
		return out, err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO arena_events VALUES(?,?,?,?)", id, version+1, event.Kind, string(payload)); err != nil {
		return out, err
	}
	err = tx.Commit()
	return out, err
}

// Recover is an explicit operator startup operation, never an ordinary research read.
func (s *Store) Recover(ctx context.Context, service *arena.Service) error {
	rows, err := s.db.QueryContext(ctx, "SELECT id FROM arena_episodes WHERE json_extract(state_json,'$.run.status') IN ('running','submitted')")
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		e, err := s.Load(ctx, id)
		if err != nil {
			return err
		}
		if _, err = service.Finish(ctx, id, e.Run.ID, "interrupted", "Application restarted; committed virtual decisions were recovered exactly once"); err != nil {
			return err
		}
	}
	return nil
}
