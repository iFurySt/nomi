package syncserver

import (
	"archive/tar"
	"bytes"
	"context"
	"testing"
)

func TestOriginalBackupRestoreAndIntegrity(t *testing.T) {
	s := testStore(t)
	u, sp := fixture(t, s)
	seed(t, s, u, sp)
	ctx := context.Background()
	original, _ := NewDiskObjects(t.TempDir())
	defer original.Close()
	data := []byte("synthetic original")
	hash := digest(data)
	if _, err := original.Put(ctx, sp.ID, hash, bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(ctx, `INSERT INTO sync_objects(space_id,sha256,bytes) VALUES($1,$2,$3)`, sp.ID, hash, len(data)); err != nil {
		t.Fatal(err)
	}
	var archive bytes.Buffer
	if err := s.ExportObjects(ctx, original, &archive); err != nil {
		t.Fatal(err)
	}
	restored, _ := NewDiskObjects(t.TempDir())
	defer restored.Close()
	if err := ImportObjects(ctx, restored, bytes.NewReader(archive.Bytes())); err != nil {
		t.Fatal(err)
	}
	report, err := s.Verify(ctx, restored)
	if err != nil || report.Objects != 1 || report.Spaces != 1 || report.Bytes != int64(len(data)) {
		t.Fatal(report, err)
	}
	if err = restored.root.Remove(sp.ID + "/" + hash); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Verify(ctx, restored); err == nil {
		t.Fatal("missing original accepted")
	}
	for _, header := range []tar.Header{{Name: "../escape", Typeflag: tar.TypeReg, Size: 1}, {Name: sp.ID + "/" + hash, Typeflag: tar.TypeSymlink, Linkname: "/tmp"}} {
		var bad bytes.Buffer
		tw := tar.NewWriter(&bad)
		_ = tw.WriteHeader(&header)
		if header.Size > 0 {
			_, _ = tw.Write([]byte("x"))
		}
		_ = tw.Close()
		if err = ImportObjects(ctx, restored, &bad); err == nil {
			t.Fatal("unsafe archive accepted")
		}
	}
}
