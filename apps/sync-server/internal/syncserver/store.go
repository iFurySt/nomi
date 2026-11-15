package syncserver

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct{ DB *pgxpool.Pool }

func (s *Store) Migrate(ctx context.Context) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(70151115)`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS sync_migrations (name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	for _, e := range entries {
		sql, err := migrations.ReadFile("migrations/" + e.Name())
		if err != nil {
			return err
		}
		hash := digest(sql)
		var old string
		err = tx.QueryRow(ctx, `SELECT sha256 FROM sync_migrations WHERE name=$1`, e.Name()).Scan(&old)
		if err == nil {
			if old != hash {
				return fmt.Errorf("migration checksum mismatch: %s", e.Name())
			}
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if _, err = tx.Exec(ctx, string(sql)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO sync_migrations(name,sha256) VALUES($1,$2)`, e.Name(), hash); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// CheckSchema refuses to serve partially migrated or modified schemas.
func (s *Store) CheckSchema(ctx context.Context) error {
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	for _, e := range entries {
		sql, err := migrations.ReadFile("migrations/" + e.Name())
		if err != nil {
			return err
		}
		var hash string
		if err = s.DB.QueryRow(ctx, `SELECT sha256 FROM sync_migrations WHERE name=$1`, e.Name()).Scan(&hash); err != nil || hash != digest(sql) {
			return fmt.Errorf("migration missing or checksum mismatch: %s; run migrate", e.Name())
		}
	}
	return nil
}

func digest(b []byte) string { sum := sha256.Sum256(b); return hex.EncodeToString(sum[:]) }

type Space struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Sequence int64  `json:"sequence"`
}

func (s *Store) CreateSpace(ctx context.Context, user, name string) (Space, error) {
	if len(name) == 0 || len(name) > 200 {
		return Space{}, problem(400, "invalid_name", "Name required (max 200 bytes)")
	}
	sp := Space{ID: randomID("space"), Name: name}
	_, err := s.DB.Exec(ctx, `INSERT INTO sync_spaces(id,owner_id,name) VALUES($1,$2,$3)`, sp.ID, user, name)
	return sp, err
}
func (s *Store) Spaces(ctx context.Context, user string) ([]Space, error) {
	rows, err := s.DB.Query(ctx, `SELECT id,name,sequence FROM sync_spaces WHERE owner_id=$1 ORDER BY created_at,id`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Space{}
	for rows.Next() {
		var p Space
		if err = rows.Scan(&p.ID, &p.Name, &p.Sequence); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func owned(ctx context.Context, tx pgx.Tx, user, space string, lock bool) (int64, int64, error) {
	q := `SELECT sequence,log_floor FROM sync_spaces WHERE id=$1 AND owner_id=$2`
	if lock {
		q += ` FOR UPDATE`
	}
	var seq, floor int64
	err := tx.QueryRow(ctx, q, space, user).Scan(&seq, &floor)
	if errors.Is(err, pgx.ErrNoRows) {
		err = problem(404, "not_found", "Space not found")
	}
	return seq, floor, err
}
func readRecords(ctx context.Context, tx pgx.Tx, space string) (map[string]Record, error) {
	rows, err := tx.Query(ctx, `SELECT kind,id,version,deleted,data,source,updated_at FROM sync_entities WHERE space_id=$1 ORDER BY kind,id`, space)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Record{}
	for rows.Next() {
		var r Record
		var source *string
		if err = rows.Scan(&r.Kind, &r.ID, &r.Version, &r.Deleted, &r.Data, &source, &r.UpdatedAt); err != nil {
			return nil, err
		}
		restoreSource(&r, source)
		out[key(r.Kind, r.ID)] = r
	}
	return out, rows.Err()
}
func restoreSource(r *Record, source *string) {
	if source == nil {
		return
	}
	var o map[string]json.RawMessage
	_ = json.Unmarshal(r.Data, &o)
	o["source"], _ = json.Marshal(*source)
	r.Data, _ = json.Marshal(o)
}
func splitSource(r Record) (json.RawMessage, *string) {
	if r.Deleted {
		return nil, nil
	}
	var o map[string]json.RawMessage
	_ = json.Unmarshal(r.Data, &o)
	var t string
	_ = json.Unmarshal(o["type"], &t)
	if r.Kind == "block" && t == "markdown" {
		var src string
		_ = json.Unmarshal(o["source"], &src)
		delete(o, "source")
		b, _ := json.Marshal(o)
		return b, &src
	}
	return r.Data, nil
}
func (s *Store) Commit(ctx context.Context, user, space string, c Commit) (Receipt, error) {
	if err := validateCommit(&c); err != nil {
		return Receipt{}, err
	}
	raw, _ := json.Marshal(c)
	hash := digest(raw)
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return Receipt{}, err
	}
	defer tx.Rollback(ctx)
	seq, _, err := owned(ctx, tx, user, space, true)
	if err != nil {
		return Receipt{}, err
	}
	var oldHash string
	var receipt Receipt
	var versions []byte
	err = tx.QueryRow(ctx, `SELECT payload_hash,sequence,versions FROM sync_receipts WHERE space_id=$1 AND request_id=$2`, space, c.RequestID).Scan(&oldHash, &receipt.Sequence, &versions)
	if err == nil {
		if oldHash != hash {
			return Receipt{}, problem(409, "request_reused", "Request ID already used for different content")
		}
		err = json.Unmarshal(versions, &receipt.Versions)
		return receipt, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Receipt{}, err
	}
	records, err := readRecords(ctx, tx, space)
	if err != nil {
		return Receipt{}, err
	}
	conflicts := []Record{}
	for _, m := range c.Mutations {
		old := records[key(m.Kind, m.ID)]
		if old.Version != m.BaseVersion {
			if old.ID == "" {
				old = Record{Kind: m.Kind, ID: m.ID, Deleted: true}
			}
			conflicts = append(conflicts, old)
		}
	}
	if len(conflicts) > 0 {
		return Receipt{}, &APIError{Status: 409, Code: "conflict", Message: "Entities changed since your base version", Conflicts: conflicts}
	}
	now := time.Now().UTC()
	changed := []Record{}
	receipt.Versions = []Version{}
	for _, m := range c.Mutations {
		k := key(m.Kind, m.ID)
		old := records[k]

		// Tombstones can only be explicitly restored using their current version.
		same := old.Version > 0 && old.Deleted == m.Deleted
		if same && !m.Deleted {
			a, _ := canonical(old.Data)
			same = string(a) == string(m.Data)
		}
		if same {
			receipt.Versions = append(receipt.Versions, Version{m.Kind, m.ID, old.Version})
			continue
		}
		r := Record{Kind: m.Kind, ID: m.ID, Version: old.Version + 1, Deleted: m.Deleted, Data: m.Data, UpdatedAt: now}
		records[k] = r
		changed = append(changed, r)
		receipt.Versions = append(receipt.Versions, Version{m.Kind, m.ID, r.Version})
	}
	if err = validateGraph(records); err != nil {
		return Receipt{}, err
	}
	for _, r := range records {
		if r.Kind != "asset" || r.Deleted {
			continue
		}
		o := object(r)
		var size int64
		err = tx.QueryRow(ctx, `SELECT bytes FROM sync_objects WHERE space_id=$1 AND sha256=$2`, space, stringField(o, "sha256")).Scan(&size)
		if errors.Is(err, pgx.ErrNoRows) {
			return Receipt{}, problem(422, "asset_not_ready", "Upload attachment before committing")
		}
		if err != nil {
			return Receipt{}, err
		}
		if size != int64(o["bytes"].(float64)) {
			return Receipt{}, problem(422, "invalid_asset", "Attachment byte count mismatch")
		}
	}
	// Original identity remains immutable even after deletion and explicit restoration.
	for _, r := range changed {
		if r.Kind != "asset" || r.Deleted {
			continue
		}
		o := object(r)
		hash := stringField(o, "sha256")
		mime := stringField(o, "mime")
		size := int64(o["bytes"].(float64))
		var oldHash, oldMime string
		var oldSize int64
		err = tx.QueryRow(ctx, `SELECT sha256,bytes,mime FROM sync_asset_identities WHERE space_id=$1 AND id=$2`, space, r.ID).Scan(&oldHash, &oldSize, &oldMime)
		if err == nil {
			if oldHash != hash || oldSize != size || oldMime != mime {
				return Receipt{}, problem(422, "immutable_asset", "Use a new asset ID when replacing an original")
			}
		} else if errors.Is(err, pgx.ErrNoRows) {
			if _, err = tx.Exec(ctx, `INSERT INTO sync_asset_identities(space_id,id,sha256,bytes,mime) VALUES($1,$2,$3,$4,$5)`, space, r.ID, hash, size, mime); err != nil {
				return Receipt{}, err
			}
		} else {
			return Receipt{}, err
		}
	}

	for _, r := range changed {
		if _, err = tx.Exec(ctx, `INSERT INTO sync_history(space_id,kind,id,version,deleted,data,source,archived_at) SELECT space_id,kind,id,version,deleted,data,source,$4 FROM sync_entities WHERE space_id=$1 AND kind=$2 AND id=$3`, space, r.Kind, r.ID, now); err != nil {
			return Receipt{}, err
		}
		data, source := splitSource(r)
		_, err = tx.Exec(ctx, `INSERT INTO sync_entities(space_id,kind,id,version,deleted,data,source,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(space_id,kind,id) DO UPDATE SET version=excluded.version,deleted=excluded.deleted,data=excluded.data,source=excluded.source,updated_at=excluded.updated_at`, space, r.Kind, r.ID, r.Version, r.Deleted, data, source, now)
		if err != nil {
			return Receipt{}, err
		}
	}
	if len(changed) > 0 {
		seq++
		body, _ := json.Marshal(changed)
		if _, err = tx.Exec(ctx, `INSERT INTO sync_changes(space_id,sequence,records) VALUES($1,$2,$3)`, space, seq, body); err != nil {
			return Receipt{}, err
		}
		if _, err = tx.Exec(ctx, `UPDATE sync_spaces SET sequence=$2 WHERE id=$1`, space, seq); err != nil {
			return Receipt{}, err
		}
	}
	receipt.Sequence = seq
	versions, _ = json.Marshal(receipt.Versions)
	if _, err = tx.Exec(ctx, `INSERT INTO sync_receipts(space_id,request_id,payload_hash,sequence,versions) VALUES($1,$2,$3,$4,$5)`, space, c.RequestID, hash, seq, versions); err != nil {
		return Receipt{}, err
	}
	return receipt, tx.Commit(ctx)
}
func (s *Store) Snapshot(ctx context.Context, user, space string) (Snapshot, error) {
	tx, err := s.DB.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return Snapshot{}, err
	}
	defer tx.Rollback(ctx)
	seq, _, err := owned(ctx, tx, user, space, false)
	if err != nil {
		return Snapshot{}, err
	}
	records, err := readRecords(ctx, tx, space)
	if err != nil {
		return Snapshot{}, err
	}
	out := Snapshot{Protocol: Protocol, Cursor: seq, Records: []Record{}}
	for _, r := range records {
		out.Records = append(out.Records, r)
	}
	sort.Slice(out.Records, func(i, j int) bool {
		return key(out.Records[i].Kind, out.Records[i].ID) < key(out.Records[j].Kind, out.Records[j].ID)
	})
	return out, tx.Commit(ctx)
}
func (s *Store) Changes(ctx context.Context, user, space string, after int64, limit int) (Changes, error) {
	if after < 0 || limit < 1 || limit > 100 {
		return Changes{}, problem(400, "invalid_cursor", "Invalid cursor or page size")
	}
	tx, err := s.DB.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return Changes{}, err
	}
	defer tx.Rollback(ctx)
	seq, floor, err := owned(ctx, tx, user, space, false)
	if err != nil {
		return Changes{}, err
	}
	if after < floor {
		return Changes{}, problem(410, "reset_required", "Sync cursor expired; rebuild from snapshot")
	}
	if after > seq {
		return Changes{}, problem(400, "invalid_cursor", "Cursor is ahead of server")
	}
	rows, err := tx.Query(ctx, `SELECT sequence,records FROM sync_changes WHERE space_id=$1 AND sequence>$2 ORDER BY sequence LIMIT $3`, space, after, limit)
	if err != nil {
		return Changes{}, err
	}
	out := Changes{Protocol: Protocol, Cursor: after, Changes: []Change{}}
	size := 128 // response envelope; individual commits are never split
	for rows.Next() {
		var c Change
		var data []byte
		if err = rows.Scan(&c.Sequence, &data); err != nil {
			rows.Close()
			return Changes{}, err
		}
		if err = json.Unmarshal(data, &c.Records); err != nil {
			rows.Close()
			return Changes{}, err
		}
		encoded, encodeErr := json.Marshal(c)
		if encodeErr != nil {
			rows.Close()
			return Changes{}, encodeErr
		}
		if len(out.Changes) > 0 && size+len(encoded) > MaxBody {
			break
		}
		size += len(encoded)
		out.Changes = append(out.Changes, c)
		out.Cursor = c.Sequence
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Changes{}, err
	}
	out.HasMore = out.Cursor < seq
	return out, tx.Commit(ctx)
}
func (s *Store) History(ctx context.Context, user, space, kind, id string) ([]Record, error) {
	return s.HistoryPage(ctx, user, space, kind, id, 0, 500)
}
func (s *Store) HistoryPage(ctx context.Context, user, space, kind, id string, before int64, limit int) ([]Record, error) {
	if before < 0 || limit < 1 || limit > 500 {
		return nil, problem(400, "invalid_history_cursor", "Invalid history cursor or limit")
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, _, err = owned(ctx, tx, user, space, false); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT kind,id,version,deleted,data,source,archived_at FROM sync_history WHERE space_id=$1 AND kind=$2 AND id=$3 AND ($4::bigint=0 OR version<$4) ORDER BY version DESC LIMIT $5`, space, kind, id, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Record{}
	size := 0
	for rows.Next() {
		var r Record
		var src *string
		if err = rows.Scan(&r.Kind, &r.ID, &r.Version, &r.Deleted, &r.Data, &src, &r.UpdatedAt); err != nil {
			return nil, err
		}
		restoreSource(&r, src)
		encoded, encodeErr := json.Marshal(r)
		if encodeErr != nil {
			return nil, encodeErr
		}
		if len(out) > 0 && size+len(encoded) > MaxBody {
			break
		}
		size += len(encoded)
		out = append(out, r)
	}
	return out, rows.Err()
}
