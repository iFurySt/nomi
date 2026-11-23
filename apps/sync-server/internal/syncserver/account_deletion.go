package syncserver

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"io/fs"
)

// Delete the authenticated account and all of its database records atomically.
// Keep a durable cleanup entry for each private object directory across crashes.
func (s *Store) DeleteAccount(ctx context.Context, user string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// The backup script holds the matching shared lock across dump and object export.
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(68410237)"); err != nil {
		return err
	}
	var id string
	if err = tx.QueryRow(ctx, "SELECT id FROM sync_users WHERE id=$1 FOR UPDATE", user).Scan(&id); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, "SELECT id FROM sync_spaces WHERE owner_id=$1 ORDER BY id FOR UPDATE", user)
	if err != nil {
		return err
	}
	spaces, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, table := range []string{"sync_entities", "sync_history", "sync_changes", "sync_receipts", "sync_objects", "sync_asset_identities"} {
		if _, err = tx.Exec(ctx, "DELETE FROM "+table+" WHERE space_id=ANY($1::text[])", spaces); err != nil {
			return err
		}
	}
	for _, stmt := range []string{
		"INSERT INTO sync_erased_spaces SELECT id FROM sync_spaces WHERE owner_id=$1",
		"DELETE FROM sync_spaces WHERE owner_id=$1",
		"DELETE FROM sync_identity_challenges WHERE binding_session IN (SELECT id FROM sync_sessions WHERE user_id=$1)",
		"DELETE FROM sync_browser_logins WHERE user_id=$1",
		"DELETE FROM sync_sessions WHERE user_id=$1",
		"DELETE FROM sync_users WHERE id=$1",
	} {
		if _, err = tx.Exec(ctx, stmt, user); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) PurgeErasedSpaces(ctx context.Context, disk *DiskObjects) error {
	rows, err := s.DB.Query(ctx, "SELECT space_id FROM sync_erased_spaces")
	if err != nil {
		return err
	}
	spaces, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, space := range spaces {
		if !safeID(space) || space == "." || space == ".." {
			return errors.New("invalid storage namespace")
		}
		if err = disk.root.RemoveAll(space); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
		if _, err = s.DB.Exec(ctx, "DELETE FROM sync_erased_spaces WHERE space_id=$1", space); err != nil {
			return err
		}
	}
	return nil
}
