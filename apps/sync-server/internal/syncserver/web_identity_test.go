package syncserver

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-jose/go-jose/v4"
	"golang.org/x/oauth2"
)

func TestWebsiteProvidersShareMobileAccount(t *testing.T) {
	store := testStore(t)
	user, space := fixture(t, store)
	ctx := context.Background()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, nil)
	if err != nil {
		t.Fatal(err)
	}
	const issuer = "https://provider.invalid"
	for _, name := range []string{"google", "apple"} {
		t.Run(name, func(t *testing.T) {
			const aud = "website-test"
			p := websiteProvider{nativeProvider{aud, oidc.NewVerifier(issuer, &oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}}, &oidc.Config{ClientID: aud})}, oauth2.Config{ClientID: aud, ClientSecret: "test", RedirectURL: "https://nomi.invalid/api/auth/web/" + name, Endpoint: oauth2.Endpoint{AuthURL: issuer + "/auth"}}}
			s := &webLogin{&Server{Store: store}, map[string]websiteProvider{name: p}}
			verifier := strings.Repeat("a", 43)
			hash := sha256.Sum256([]byte(verifier))
			start := func() (webAttempt, *http.Cookie) {
				req, e := store.StartBrowserLogin(ctx, BrowserStart{base64.RawURLEncoding.EncodeToString(hash[:]), "desktop.test", "Test Mac", "nomi"})
				if e != nil {
					t.Fatal(e)
				}
				w := httptest.NewRecorder()
				s.begin(w, httptest.NewRequest("POST", "/login", nil), req.ID, name)
				location, _ := url.Parse(w.Header().Get("Location"))
				cookie := w.Result().Cookies()[0]
				a := webAttempt{req.ID, name, cookie.Value}
				if w.Code != 303 || location.Query().Get("state") != a.state() || location.Query().Get("nonce") != a.proof("nonce") || !cookie.Secure || !cookie.HttpOnly {
					t.Fatal("provider start")
				}
				return a, cookie
			}
			sign := func(nonce, subject, audience string) string {
				payload, _ := json.Marshal(map[string]any{"iss": issuer, "aud": audience, "exp": time.Now().Add(time.Minute).Unix(), "sub": subject, "nonce": nonce, "hd": "example.invalid", "email": strings.ToUpper(user.Email), "email_verified": map[string]any{"apple": "true", "google": true}[name]})
				obj, e := signer.Sign(payload)
				if e != nil {
					t.Fatal(e)
				}
				raw, e := obj.CompactSerialize()
				if e != nil {
					t.Fatal(e)
				}
				return raw
			}
			callback := func(a webAttempt, cookie *http.Cookie, raw string) *httptest.ResponseRecorder {
				v := url.Values{"state": {a.state()}}
				path := "/auth/web/" + name
				var r *http.Request
				if name == "google" {
					mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						if r.FormValue("code_verifier") != a.proof("pkce") || r.FormValue("code") != "one-code" {
							t.Error("code exchange proof")
						}
						w.Header().Set("Content-Type", "application/json")
						json.NewEncoder(w).Encode(map[string]string{"access_token": "test", "id_token": raw, "token_type": "Bearer"})
					}))
					defer mock.Close()
					p.config.Endpoint.TokenURL = mock.URL
					s.providers[name] = p
					v.Set("code", "one-code")
					r = httptest.NewRequest("GET", path+"?"+v.Encode(), nil)
				} else {
					v.Set("id_token", raw)
					r = httptest.NewRequest("POST", path, strings.NewReader(v.Encode()))
					r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				}
				if cookie != nil {
					r.AddCookie(cookie)
				}
				w := httptest.NewRecorder()
				s.callback(w, r)
				return w
			}
			a, cookie := start()
			raw := sign(a.proof("nonce"), "stable-subject", aud)
			if callback(a, nil, raw).Code != 403 || callback(a, cookie, sign(a.proof("nonce"), "stable-subject", "mobile-audience")).Code != 401 {
				t.Fatal("invalid provider callback accepted")
			}
			w := callback(a, cookie, raw)
			if !strings.Contains(w.Body.String(), "nomi://account/complete") {
				t.Fatal("first sign-in did not approve desktop")
			}
			first, e := store.ExchangeBrowserLogin(ctx, a.id, verifier)
			if e != nil || first.User != user {
				t.Fatal("wrong Nomi account", e)
			}
			if callback(a, cookie, raw).Code != 410 {
				t.Fatal("approved request reused")
			}
			next, nextCookie := start()
			if callback(next, nextCookie, raw).Code != 401 {
				t.Fatal("old identity token reused for a new request")
			}
			w = callback(next, nextCookie, sign(next.proof("nonce"), "stable-subject", aud))
			if !strings.Contains(w.Body.String(), "nomi://account/complete") {
				t.Fatal("linked identity should directly approve")
			}
			second, e := store.ExchangeBrowserLogin(ctx, next.id, verifier)
			if e != nil || second.User != first.User || second.Token == first.Token {
				t.Fatal("expected same user and independent session", e)
			}

			// A phone with its own audience and nonce must resolve the web link
			// without another password prompt or sharing the desktop token.
			const mobileAudience = "ios-test"
			keys := &oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}}
			mobile := nativeProvider{mobileAudience, oidc.NewVerifier(issuer, keys, &oidc.Config{ClientID: mobileAudience})}
			mux := http.NewServeMux()
			s.nativeIdentityRoutes(mux, map[string]nativeProvider{name: mobile})
			in := nativeIdentityRequest{Provider: name, DeviceID: "phone.test"}
			post := func(route string, out any) {
				t.Helper()
				body, err := json.Marshal(in)
				if err != nil {
					t.Fatal(err)
				}
				w := httptest.NewRecorder()
				mux.ServeHTTP(w, httptest.NewRequest("POST", "/auth/native/"+route, bytes.NewReader(body)))
				if w.Code != 200 {
					t.Fatalf("native %s returned %d", route, w.Code)
				}
				if err := json.NewDecoder(w.Body).Decode(out); err != nil {
					t.Fatal(err)
				}
			}
			var challenge struct{ Nonce string }
			post("challenge", &challenge)
			in.Nonce = challenge.Nonce
			in.IDToken = sign(in.Nonce, "stable-subject", mobileAudience)
			var phone LoginResult
			post("exchange", &phone)
			if _, err := store.Snapshot(ctx, phone.User.ID, space.ID); err != nil {
				t.Fatal("original library unavailable", err)
			}
			if phone.User != first.User || phone.Token == first.Token || phone.DeviceID != in.DeviceID {
				t.Fatal("web-linked identity did not restore the same account on iOS")
			}

		})
	}
}
