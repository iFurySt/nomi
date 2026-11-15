package syncserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

type brokenReader struct{ read bool }

func (r *brokenReader) Read(b []byte) (int, error) {
	if r.read {
		return 0, errors.New("interrupted upload")
	}
	r.read = true
	return copy(b, []byte("partial")), nil
}
func TestDiskObjectsIntegrityIsolationAndReopen(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	d, err := NewDiskObjects(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	data := []byte("pdf or image bytes")
	hash := digest(data)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); _, e := d.Put(ctx, "space.a", hash, bytes.NewReader(data)); errs <- e }()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	_, err = d.Put(ctx, "space.a", hash, bytes.NewReader([]byte("wrong")))
	wantCode(t, err, "digest_mismatch")
	_, err = d.Put(ctx, "space.a", digest([]byte("partial")), &brokenReader{})
	if err == nil {
		t.Fatal("accepted interrupted upload")
	}
	files, err := os.ReadDir(filepath.Join(dir, "space.a"))
	if err != nil || len(files) != 1 {
		t.Fatal("upload temp leak", files, err)
	}
	if _, err = d.Open(ctx, "space.b", hash); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("cross-space object", err)
	}
	if _, err = d.Open(ctx, "../escape", hash); err == nil {
		t.Fatal("path traversal")
	}
	outside := t.TempDir()
	if err = os.Symlink(outside, filepath.Join(dir, "space.link")); err != nil {
		t.Fatal(err)
	}
	if _, err = d.Put(ctx, "space.link", hash, bytes.NewReader(data)); err == nil {
		t.Fatal("symlink escape")
	}
	if err = d.Close(); err != nil {
		t.Fatal(err)
	}
	d, err = NewDiskObjects(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	f, err := d.Open(ctx, "space.a", hash)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	got, err := io.ReadAll(f)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatal("reopen mismatch", err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err = d.Put(canceled, "space.a", digest([]byte("new")), bytes.NewBufferString("new")); err == nil {
		t.Fatal("accepted cancelled request")
	}
}
func TestAttachmentsMustBeReadyAndRemainReferencedByHistory(t *testing.T) {
	s := testStore(t)
	u, sp := fixture(t, s)
	seed(t, s, u, sp)
	ctx := context.Background()
	objects, err := NewDiskObjects(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer objects.Close()
	h := httptest.NewServer((&Server{Store: s, Objects: objects}).Handler())
	defer h.Close()
	login, err := s.Login(ctx, Login{Email: u.Email, Password: "a-long-test-password", DeviceID: "device.a"})
	if err != nil {
		t.Fatal(err)
	}
	original := []byte("%PDF-1.4 synthetic original")
	hash := digest(original)
	assetJSON, _ := json.Marshal(map[string]any{"id": "asset.pdf", "name": "example.pdf", "mime": "application/pdf", "bytes": len(original), "sha256": hash})
	asset := mutation("asset", "asset.pdf", 0, string(assetJSON))
	image := mutation("block", "file.pdf", 0, `{"id":"file.pdf","type":"file","asset":"asset.pdf"}`)
	batch := commit(asset, image)
	_, err = s.Commit(ctx, u.ID, sp.ID, batch)
	wantCode(t, err, "asset_not_ready")
	url := h.URL + "/v1/spaces/" + sp.ID + "/objects/" + hash
	req := func(method, url, token string, data []byte, want int) []byte {
		t.Helper()
		r, _ := http.NewRequest(method, url, bytes.NewReader(data))
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != want {
			t.Fatalf("want %d got %d %s", want, resp.StatusCode, body)
		}
		return body
	}
	req("PUT", url, "", original, 401)
	req("PUT", url, login.Token, []byte("wrong"), 422)
	req("PUT", url, login.Token, original, 200)
	req("PUT", url, login.Token, original, 200)
	if _, err = s.Commit(ctx, u.ID, sp.ID, batch); err != nil {
		t.Fatal(err)
	}
	if got := req("GET", url, login.Token, nil, 200); !bytes.Equal(got, original) {
		t.Fatal("object mismatch")
	}
	other, _ := s.Provision(ctx, "other@example.invalid", "a-second-long-password")
	ol, _ := s.Login(ctx, Login{Email: other.Email, Password: "a-second-long-password", DeviceID: "device.other"})
	req("GET", url, ol.Token, nil, 404)
	if _, err = s.Commit(ctx, u.ID, sp.ID, commit(Mutation{Kind: "block", ID: "file.pdf", BaseVersion: 1, Deleted: true}, Mutation{Kind: "asset", ID: "asset.pdf", BaseVersion: 1, Deleted: true})); err != nil {
		t.Fatal(err)
	}
	changedAsset := mutation("asset", "asset.pdf", 2, string(assetJSON))
	var changed map[string]any
	_ = json.Unmarshal(changedAsset.Data, &changed)
	changed["mime"] = "text/plain"
	changedAsset.Data, _ = json.Marshal(changed)
	_, err = s.Commit(ctx, u.ID, sp.ID, commit(changedAsset))
	wantCode(t, err, "immutable_asset")

	hist, err := s.History(ctx, u.ID, sp.ID, "block", "file.pdf")
	if err != nil || len(hist) != 1 {
		t.Fatal(hist, err)
	}
	if got := req("GET", url, login.Token, nil, 200); !bytes.Equal(got, original) {
		t.Fatal("history lost original")
	}
}
