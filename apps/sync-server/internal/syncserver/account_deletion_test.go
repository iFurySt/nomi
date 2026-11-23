package syncserver

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestAccountDeletionIsolationAndObjectCleanup(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	victim, space := fixture(t, s)
	other, err := s.Provision(ctx, "second@example.invalid", "different-long-password")
	if err != nil {
		t.Fatal(err)
	}
	keep, err := s.CreateSpace(ctx, other.ID, "Keep")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	obj, err := NewDiskObjects(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer obj.Close()
	data := []byte("synthetic content")
	for _, id := range []string{space.ID, keep.ID} {
		if _, err = obj.Put(ctx, id, digest(data), bytes.NewReader(data)); err != nil {
			t.Fatal(err)
		}
		if _, err = s.DB.Exec(ctx, "INSERT INTO sync_objects(space_id,sha256,bytes) VALUES($1,$2,$3)", id, digest(data), len(data)); err != nil {
			t.Fatal(err)
		}
	}
	login, err := s.Login(ctx, Login{Email: victim.Email, Password: "a-long-test-password", DeviceID: "device.test", DeviceName: "Test"})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteAccount(ctx, victim.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Authenticate(ctx, login.Token); err == nil {
		t.Fatal("session survived")
	}
	if err = s.PurgeErasedSpaces(ctx, obj); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(dir, space.ID)); !os.IsNotExist(err) {
		t.Fatal("deleted files retained", err)
	}
	if err = s.OwnsSpace(ctx, other.ID, keep.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(dir, keep.ID, digest(data))); err != nil {
		t.Fatal(err)
	}
}
