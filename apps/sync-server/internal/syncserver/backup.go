package syncserver

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"strings"
)

// Originals are immutable and physical GC is disabled: export after pg_dump includes
// every object referenced by that database snapshot; concurrent extras are harmless.
func (s *Store) ExportObjects(ctx context.Context, objects ObjectStore, output io.Writer) error {
	rows, err := s.DB.Query(ctx, `SELECT space_id,sha256,bytes FROM sync_objects ORDER BY space_id,sha256`)
	if err != nil {
		return err
	}
	defer rows.Close()
	archive := tar.NewWriter(output)
	for rows.Next() {
		var space, hash string
		var size int64
		if err = rows.Scan(&space, &hash, &size); err != nil {
			return err
		}
		file, err := objects.Open(ctx, space, hash)
		if err != nil {
			return fmt.Errorf("backup original unavailable")
		}
		if err = archive.WriteHeader(&tar.Header{Name: space + "/" + hash, Mode: 0600, Size: size, Typeflag: tar.TypeReg}); err != nil {
			file.Close()
			return err
		}
		digest := sha256.New()
		n, copyErr := io.Copy(io.MultiWriter(archive, digest), file)
		file.Close()
		if copyErr != nil {
			return copyErr
		}
		if n != size || hex.EncodeToString(digest.Sum(nil)) != hash {
			return fmt.Errorf("backup original failed integrity check")
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}
	return archive.Close()
}
func ImportObjects(ctx context.Context, objects ObjectStore, input io.Reader) error {
	archive := tar.NewReader(input)
	seen := map[string]bool{}
	for {
		header, err := archive.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		parts := strings.Split(header.Name, "/")
		if header.Typeflag != tar.TypeReg || len(parts) != 2 || header.Size < 0 || header.Size > MaxObjectBytes || seen[header.Name] {
			return fmt.Errorf("invalid object archive")
		}
		if _, err = objectKey(parts[0], parts[1]); err != nil {
			return err
		}
		seen[header.Name] = true
		n, err := objects.Put(ctx, parts[0], parts[1], archive)
		if err != nil {
			return err
		}
		if n != header.Size {
			return fmt.Errorf("object archive size mismatch")
		}
	}
}

type VerifyReport struct {
	Objects int   `json:"objects"`
	Bytes   int64 `json:"bytes"`
	Spaces  int   `json:"spaces"`
}

func (s *Store) Verify(ctx context.Context, objects ObjectStore) (VerifyReport, error) {
	report := VerifyReport{}
	if err := s.CheckSchema(ctx); err != nil {
		return report, err
	}
	rows, err := s.DB.Query(ctx, `SELECT space_id,sha256,bytes FROM sync_objects ORDER BY space_id,sha256`)
	if err != nil {
		return report, err
	}
	for rows.Next() {
		var space, hash string
		var size int64
		if err = rows.Scan(&space, &hash, &size); err != nil {
			rows.Close()
			return report, err
		}
		file, e := objects.Open(ctx, space, hash)
		if e != nil {
			rows.Close()
			return report, fmt.Errorf("original missing")
		}
		digest := sha256.New()
		n, e := io.Copy(digest, file)
		file.Close()
		if e != nil || n != size || hex.EncodeToString(digest.Sum(nil)) != hash {
			rows.Close()
			return report, fmt.Errorf("original integrity check failed")
		}
		report.Objects++
		report.Bytes += n
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return report, err
	}
	rows, err = s.DB.Query(ctx, `SELECT id FROM sync_spaces ORDER BY id`)
	if err != nil {
		return report, err
	}
	spaces := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return report, err
		}
		spaces = append(spaces, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return report, err
	}
	for _, space := range spaces {
		tx, e := s.DB.Begin(ctx)
		if e != nil {
			return report, e
		}
		records, e := readRecords(ctx, tx, space)
		_ = tx.Rollback(ctx)
		if e != nil {
			return report, e
		}
		if e = validateGraph(records); e != nil {
			return report, fmt.Errorf("restored document graph invalid")
		}
		report.Spaces++
	}
	return report, nil
}
