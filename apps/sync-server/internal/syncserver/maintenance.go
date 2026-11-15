package syncserver

import (
	"context"
	"time"
)

type MaintenanceReport struct {
	Spaces        int   `json:"spaces"`
	History       int64 `json:"historyCandidates"`
	Changes       int64 `json:"changeCandidates"`
	OrphanObjects int64 `json:"unpublishedObjects"`
	OrphanBytes   int64 `json:"unpublishedBytes"`
	Applied       bool  `json:"applied"`
}

// Maintain keeps the union of the latest 50 archived versions and all versions
// archived in the last 30 days. Current records, receipts and tombstones never expire.
// All decisions share the commit space lock, so concurrent edits cannot race a prune.
func (s *Store) Maintain(ctx context.Context, now time.Time, apply bool) (MaintenanceReport, error) {
	report := MaintenanceReport{Applied: apply}
	rows, err := s.DB.Query(ctx, `SELECT id,owner_id FROM sync_spaces ORDER BY id`)
	if err != nil {
		return report, err
	}
	type target struct{ id, user string }
	spaces := []target{}
	for rows.Next() {
		var p target
		if err = rows.Scan(&p.id, &p.user); err != nil {
			rows.Close()
			return report, err
		}
		spaces = append(spaces, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return report, err
	}
	for _, space := range spaces {
		tx, err := s.DB.Begin(ctx)
		if err != nil {
			return report, err
		}
		prune := func() error {
			seq, floor, err := owned(ctx, tx, space.user, space.id, true)
			if err != nil {
				return err
			}
			historySQL := `WITH ranked AS (SELECT kind,id,version,archived_at,row_number() OVER (PARTITION BY kind,id ORDER BY version DESC) AS rank FROM sync_history WHERE space_id=$1) SELECT kind,id,version FROM ranked WHERE rank>50 AND archived_at<$2`
			var n int64
			if apply {
				tag, e := tx.Exec(ctx, `DELETE FROM sync_history h USING (`+historySQL+`) d WHERE h.space_id=$1 AND h.kind=d.kind AND h.id=d.id AND h.version=d.version`, space.id, now.Add(-30*24*time.Hour))
				err = e
				n = tag.RowsAffected()
			} else {
				err = tx.QueryRow(ctx, `SELECT count(*) FROM (`+historySQL+`) candidates`, space.id, now.Add(-30*24*time.Hour)).Scan(&n)
			}
			if err != nil {
				return err
			}
			report.History += n
			// Delete only an aged contiguous prefix, even if the server clock moved backwards.
			var nextFloor int64
			err = tx.QueryRow(ctx, `SELECT COALESCE(min(sequence)-1,$3) FROM sync_changes WHERE space_id=$1 AND created_at >= $2`, space.id, now.Add(-90*24*time.Hour), seq).Scan(&nextFloor)
			if err != nil {
				return err
			}
			if nextFloor < floor {
				nextFloor = floor
			}
			if err = tx.QueryRow(ctx, `SELECT count(*) FROM sync_changes WHERE space_id=$1 AND sequence<=$2`, space.id, nextFloor).Scan(&n); err != nil {
				return err
			}
			report.Changes += n
			if apply {
				if _, err = tx.Exec(ctx, `DELETE FROM sync_changes WHERE space_id=$1 AND sequence<=$2`, space.id, nextFloor); err != nil {
					return err
				}
				if _, err = tx.Exec(ctx, `UPDATE sync_spaces SET log_floor=$2 WHERE id=$1`, space.id, nextFloor); err != nil {
					return err
				}
			}
			// Conservative object audit: every published immutable identity is protected,
			// including historical/conflict references. Physical object deletion is disabled.
			var count, bytes int64
			err = tx.QueryRow(ctx, `SELECT count(*),COALESCE(sum(o.bytes),0) FROM sync_objects o WHERE o.space_id=$1 AND o.created_at<$2 AND NOT EXISTS(SELECT 1 FROM sync_asset_identities a WHERE a.space_id=o.space_id AND a.sha256=o.sha256)`, space.id, now.Add(-7*24*time.Hour)).Scan(&count, &bytes)
			if err != nil {
				return err
			}
			report.OrphanObjects += count
			report.OrphanBytes += bytes
			return tx.Commit(ctx)
		}()
		_ = tx.Rollback(ctx)
		if prune != nil {
			return report, prune
		}
		report.Spaces++
	}
	return report, nil
}
