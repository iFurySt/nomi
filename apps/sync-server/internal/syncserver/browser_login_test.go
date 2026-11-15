package syncserver

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"testing"
)

func TestBrowserLoginProofFormAndReplay(t *testing.T) {
	s := testStore(t)
	fixture(t, s)
	ctx := context.Background()
	verifier := strings.Repeat("a", 43)
	hash := sha256.Sum256([]byte(verifier))
	in := BrowserStart{base64.RawURLEncoding.EncodeToString(hash[:]), "device.web", "Test Mac", "nomi-dev"}
	h := (&Server{Store: s}).Handler()
	call := func(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Host = "nomi.example.test"
		if cookie != nil {
			r.AddCookie(cookie)
		}
		if method == "POST" {
			r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	raw, _ := json.Marshal(in)
	w := call("POST", "/api/auth/desktop/start", string(raw), nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var request BrowserRequest
	json.Unmarshal(w.Body.Bytes(), &request)
	if result, err := s.ExchangeBrowserLogin(ctx, request.ID, verifier); err != nil || result != nil {
		t.Fatal("pending", err)
	}
	_, err := s.ExchangeBrowserLogin(ctx, request.ID, strings.Repeat("b", 43))
	wantCode(t, err, "invalid_proof")
	w = call("GET", "/login?request="+request.ID, "", nil)
	if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("page security", w.Code)
	}
	cookie := w.Result().Cookies()[0]
	if !cookie.Secure || !cookie.HttpOnly || cookie.Name != "__Host-nomi_login_csrf" || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatal("cookie protections")
	}
	csrf := regexp.MustCompile(`name="csrf" value="([^"]+)"`).FindStringSubmatch(w.Body.String())[1]
	form := url.Values{"request": {request.ID}, "csrf": {csrf}, "email": {"test@example.invalid"}, "password": {"a-long-test-password"}}
	if call("POST", "/login", form.Encode(), nil).Code != 403 {
		t.Fatal("missing csrf accepted")
	}
	form.Set("password", "wrong")
	w = call("POST", "/login", form.Encode(), cookie)
	if !strings.Contains(w.Body.String(), "Couldn’t sign in") {
		t.Fatal("wrong password accepted")
	}
	cookie = w.Result().Cookies()[0]
	form.Set("csrf", cookie.Value)
	form.Set("password", "a-long-test-password")
	w = call("POST", "/login", form.Encode(), cookie)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `href="nomi-dev://account/complete"`) || strings.Contains(w.Body.String(), "ZgotmplZ") || strings.Contains(w.Body.String(), "token.") {
		t.Fatal("app handoff", w.Body.String())
	}
	// A request can create exactly one device session, including concurrent claims.
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			login, e := s.ExchangeBrowserLogin(ctx, request.ID, verifier)
			if e == nil && login != nil {
				mu.Lock()
				success++
				mu.Unlock()
				if _, e = s.Authenticate(ctx, login.Token); e != nil {
					t.Error(e)
				}
			}
		}()
	}
	wg.Wait()
	if success != 1 {
		t.Fatal("claims", success)
	}
	_, err = s.ExchangeBrowserLogin(ctx, request.ID, verifier)
	wantCode(t, err, "login_expired")
	expired, err := s.StartBrowserLogin(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	s.DB.Exec(ctx, `UPDATE sync_browser_logins SET expires_at=now()-interval '1 second' WHERE id=$1`, expired.ID)
	_, err = s.ExchangeBrowserLogin(ctx, expired.ID, verifier)
	wantCode(t, err, "login_expired")
	if call("GET", "/login?request="+expired.ID, "", nil).Code != 410 {
		t.Fatal("expired form")
	}
	in.Scheme = "https://evil.invalid"
	_, err = s.StartBrowserLogin(ctx, in)
	wantCode(t, err, "invalid_login")
	if !strings.Contains(call("GET", "/login", "", nil).Body.String(), "Start sign-in from the Nomi app") {
		t.Fatal("direct landing")
	}
}
