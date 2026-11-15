package syncserver

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTwoDevicesOverHTTP(t *testing.T) {
	s := testStore(t)
	u, sp := fixture(t, s)
	seed(t, s, u, sp)
	server := httptest.NewServer((&Server{Store: s}).Handler())
	defer server.Close()
	request := func(method, path, token string, body any, want int) []byte {
		t.Helper()
		b, _ := json.Marshal(body)
		r, err := http.NewRequest(method, server.URL+path, bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != want {
			t.Fatalf("%s %s: want %d got %d %s", method, path, want, resp.StatusCode, raw)
		}
		return raw
	}
	var a, b LoginResult
	_ = json.Unmarshal(request("POST", "/auth/login", "", Login{Email: u.Email, Password: "a-long-test-password", DeviceID: "device.a"}, 200), &a)
	_ = json.Unmarshal(request("POST", "/auth/login", "", Login{Email: u.Email, Password: "a-long-test-password", DeviceID: "device.b"}, 200), &b)
	path := "/v1/spaces/" + sp.ID
	request("GET", path+"/snapshot", "", nil, 401)
	request("POST", path+"/commit", a.Token, commit(block("text.a", 1, "from A")), 200)
	request("POST", path+"/commit", b.Token, commit(block("text.b", 1, "from B")), 200)
	request("POST", path+"/commit", b.Token, commit(block("text.a", 1, "competing B")), 409)
	var snap Snapshot
	_ = json.Unmarshal(request("GET", path+"/snapshot", b.Token, nil, 200), &snap)
	if snap.Cursor != 3 {
		t.Fatal(snap)
	}
	request("GET", path+"/changes?after=1&limit=1", a.Token, nil, 200)
	request("GET", path+"/changes?after=wrong", a.Token, nil, 400)
	request("GET", path+"/history/block/text.a", a.Token, nil, 200)
	other, err := s.Provision(context.Background(), "other@example.invalid", "a-second-long-password")
	if err != nil {
		t.Fatal(err)
	}
	login, err := s.Login(context.Background(), Login{Email: other.Email, Password: "a-second-long-password", DeviceID: "device.other"})
	if err != nil {
		t.Fatal(err)
	}
	request("GET", path+"/snapshot", login.Token, nil, 404)
	request("DELETE", "/v1/sessions/"+a.SessionID, b.Token, nil, 200)
	request("GET", "/v1/me", a.Token, nil, 401)
	// All unknown v1 routes are authenticated, too.
	request("GET", "/v1/unknown", "", nil, 401)
}
func TestLoginRateLimit(t *testing.T) {
	s := testStore(t)
	h := (&Server{Store: s}).Handler()
	for n := 0; n < 11; n++ {
		r := httptest.NewRequest("POST", "/auth/login", bytes.NewBufferString(`{"email":"nobody@example.invalid","password":"wrong","deviceId":"device.a"}`))
		r.RemoteAddr = "192.0.2.1:1234"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		want := 401
		if n == 10 {
			want = 429
		}
		if w.Code != want {
			t.Fatal(n, w.Code, w.Body.String())
		}
		if n == 10 && w.Header().Get("Retry-After") != "60" {
			t.Fatal("missing retry delay")
		}
	}
}
