package syncserver

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const MaxObjectBytes = 20 << 20

// Domain APIs refer only to space-scoped immutable keys, never a disk path or public URL.
type ObjectStore interface {
	Put(context.Context, string, string, io.Reader) (int64, error)
	Open(context.Context, string, string) (io.ReadSeekCloser, error)
}
type DiskObjects struct{ root *os.Root }

func NewDiskObjects(dir string) (*DiskObjects, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	return &DiskObjects{root: root}, nil
}
func (d *DiskObjects) Close() error { return d.root.Close() }
func objectKey(space, hash string) (string, error) {
	if !safeID(space) || !validHash.MatchString(hash) {
		return "", problem(400, "invalid_object", "Invalid object key")
	}
	return filepath.Join(space, hash), nil
}
func (d *DiskObjects) Put(ctx context.Context, space, hash string, input io.Reader) (int64, error) {
	key, err := objectKey(space, hash)
	if err != nil {
		return 0, err
	}
	if err = d.root.MkdirAll(space, 0700); err != nil {
		return 0, err
	}
	temp := filepath.Join(space, randomID("upload"))
	f, err := d.root.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return 0, err
	}
	defer d.root.Remove(temp)
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), io.LimitReader(input, MaxObjectBytes+1))
	if err != nil {
		return 0, err
	}
	if n > MaxObjectBytes {
		return 0, problem(413, "object_too_large", "Attachment exceeds 20 MiB")
	}
	if hex.EncodeToString(h.Sum(nil)) != hash {
		return 0, problem(422, "digest_mismatch", "Attachment digest does not match")
	}
	if err = ctx.Err(); err != nil {
		return 0, err
	}
	if err = f.Sync(); err != nil {
		return 0, err
	}
	if err = f.Close(); err != nil {
		return 0, err
	}
	// Link publishes without replacement even when two uploads race.
	if err = d.root.Link(temp, key); err != nil {
		if !errors.Is(err, os.ErrExist) {
			return 0, err
		}
		existing, err := d.Open(ctx, space, hash)
		if err != nil {
			return 0, err
		}
		defer existing.Close()
		verify := sha256.New()
		size, err := io.Copy(verify, existing)
		if err != nil {
			return 0, err
		}
		if size != n || hex.EncodeToString(verify.Sum(nil)) != hash {
			return 0, problem(500, "object_corrupt", "Stored attachment requires recovery")
		}
	}
	dir, err := d.root.Open(space)
	if err != nil {
		return 0, err
	}
	err = dir.Sync()
	_ = dir.Close()
	if err != nil {
		return 0, err
	}
	// Persist the space directory itself before acknowledging the upload.
	parent, err := d.root.Open(".")
	if err != nil {
		return 0, err
	}
	err = parent.Sync()
	_ = parent.Close()
	return n, err
}
func (d *DiskObjects) Open(ctx context.Context, space, hash string) (io.ReadSeekCloser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	key, err := objectKey(space, hash)
	if err != nil {
		return nil, err
	}
	f, err := d.root.Open(key)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if !info.Mode().IsRegular() {
		f.Close()
		return nil, problem(422, "invalid_object", "Expected regular file")
	}
	return f, nil
}
func (s *Store) OwnsSpace(ctx context.Context, user, space string) error {
	var exists bool
	if err := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM sync_spaces WHERE id=$1 AND owner_id=$2)`, space, user).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return problem(404, "not_found", "Space not found")
	}
	return nil
}
func (s *Server) object(w http.ResponseWriter, r *http.Request, user, space, hash string) {
	if _, err := objectKey(space, hash); err != nil {
		writeError(w, err)
		return
	}
	if err := s.Store.OwnsSpace(r.Context(), user, space); err != nil {
		writeError(w, err)
		return
	}
	if s.Objects == nil {
		writeError(w, problem(503, "objects_unavailable", "Object storage is not configured"))
		return
	}
	switch r.Method {
	case "PUT":
		if r.ContentLength > MaxObjectBytes {
			writeError(w, problem(413, "object_too_large", "Attachment exceeds 20 MiB"))
			return
		}
		// Disk writes finish before the ready marker; a crash between these steps is safely retried.
		n, err := s.Objects.Put(r.Context(), space, hash, http.MaxBytesReader(w, r.Body, MaxObjectBytes+1))
		if err != nil {
			writeError(w, err)
			return
		}
		_, err = s.Store.DB.Exec(r.Context(), `INSERT INTO sync_objects(space_id,sha256,bytes) VALUES($1,$2,$3) ON CONFLICT(space_id,sha256) DO NOTHING`, space, hash, n)
		reply(w, map[string]any{"sha256": hash, "bytes": n, "ready": true}, err)
	case "GET", "HEAD":
		var ready bool
		err := s.Store.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM sync_objects WHERE space_id=$1 AND sha256=$2)`, space, hash).Scan(&ready)
		if err != nil {
			writeError(w, err)
			return
		}
		if !ready {
			writeError(w, problem(404, "not_found", "Attachment not found"))
			return
		}
		f, err := s.Objects.Open(r.Context(), space, hash)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				err = problem(503, "object_missing", "Attachment unavailable; restore original")
			}
			writeError(w, err)
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", `attachment; filename="`+hash+`"`)
		w.Header().Set("ETag", `"`+hash+`"`)
		http.ServeContent(w, r, hash, time.Time{}, f)
	default:
		writeError(w, problem(405, "method_not_allowed", "Use PUT, GET or HEAD"))
	}
}
