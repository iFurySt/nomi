package syncserver

import (
	"context"
	"crypto/hmac"
	"errors"
	"html/template"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"
)

type websiteProvider struct {
	nativeProvider
	config oauth2.Config
}
type webLogin struct {
	*Server
	providers map[string]websiteProvider
}

func (s *Server) websiteLogin() *webLogin {
	providers := map[string]websiteProvider{}
	// Registered return URLs must never be constructed from the incoming Host header.
	const base = "https://nomi.ifuryst.com/api/auth/web/"
	if id, secret := os.Getenv("NOMI_GOOGLE_WEB_CLIENT_ID"), os.Getenv("NOMI_GOOGLE_WEB_CLIENT_SECRET"); id != "" && secret != "" {
		providers["google"] = websiteProvider{newIdentityProvider("https://accounts.google.com", "https://www.googleapis.com/oauth2/v3/certs", id), oauth2.Config{
			ClientID: id, ClientSecret: secret, RedirectURL: base + "google", Scopes: []string{"openid", "email"},
			Endpoint: oauth2.Endpoint{AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token", AuthStyle: oauth2.AuthStyleInParams},
		}}
	}
	if id := os.Getenv("NOMI_APPLE_WEB_SERVICE_ID"); id != "" {
		providers["apple"] = websiteProvider{newIdentityProvider("https://appleid.apple.com", "https://appleid.apple.com/auth/keys", id), oauth2.Config{
			ClientID: id, RedirectURL: base + "apple", Scopes: []string{"email"}, Endpoint: oauth2.Endpoint{AuthURL: "https://appleid.apple.com/auth/authorize"},
		}}
	}
	return &webLogin{s, providers}
}

// Each desktop request has a separate host-only browser secret. The state, ID
// token nonce and Google PKCE verifier are distinct and tied to that request.
type webAttempt struct{ id, provider, secret string }

func (a webAttempt) proof(purpose string) string {
	return digest([]byte(strings.Join([]string{purpose, a.id, a.provider, a.secret}, "|")))
}
func (a webAttempt) state() string { return a.id + "~" + a.proof("state") }
func (a webAttempt) cookie() *http.Cookie {
	return &http.Cookie{Name: "__Host-nomi_web_" + a.id, Value: a.secret, Secure: true, HttpOnly: true, Path: "/", SameSite: http.SameSiteNoneMode, MaxAge: 300}
}
func attemptFrom(r *http.Request, provider, state string) (webAttempt, bool) {
	id, _, ok := strings.Cut(state, "~")
	a := webAttempt{id: id, provider: provider}
	if !ok || !safeID(id) {
		return a, false
	}
	c, err := r.Cookie(a.cookie().Name)
	if err != nil || len(c.Value) < 32 {
		return a, false
	}
	a.secret = c.Value
	return a, hmac.Equal([]byte(a.state()), []byte(state))
}

func (s *webLogin) begin(w http.ResponseWriter, r *http.Request, id, name string) {
	p, ok := s.providers[name]
	if !ok {
		http.Error(w, "This sign-in method is unavailable.", 400)
		return
	}
	a := webAttempt{id, name, randomID("web")}
	http.SetCookie(w, a.cookie())
	options := []oauth2.AuthCodeOption{oauth2.SetAuthURLParam("nonce", a.proof("nonce"))}
	if name == "google" {
		options = append(options, oauth2.S256ChallengeOption(a.proof("pkce")), oauth2.SetAuthURLParam("prompt", "select_account"))
	} else {
		// Apple returns its signed identity directly to our HTTPS form_post endpoint.
		options = append(options, oauth2.SetAuthURLParam("response_type", "code id_token"), oauth2.SetAuthURLParam("response_mode", "form_post"))
	}
	http.Redirect(w, r, p.config.AuthCodeURL(a.state(), options...), http.StatusSeeOther)
}

func (s *webLogin) callback(w http.ResponseWriter, r *http.Request) {
	data := newBrowserView(w)
	name := strings.TrimPrefix(r.URL.Path, "/auth/web/")
	p, ok := s.providers[name]
	if !ok {
		http.NotFound(w, r)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32768)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Invalid sign-in response.", 400)
		return
	}
	params := r.PostForm
	if name == "google" {
		params = r.URL.Query()
	}
	state := params.Get("state")
	a, ok := attemptFrom(r, name, state)
	if !ok {
		http.Error(w, "Open sign-in again from Nomi.", 403)
		return
	}
	peer, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !s.limiter.allowLimit("web-callback:"+peer, 40) {
		http.Error(w, "Too many attempts. Try again later.", 429)
		return
	}
	if params.Get("error") != "" {
		http.Redirect(w, r, "/login?request="+url.QueryEscape(a.id), 303)
		return
	}
	raw := params.Get("id_token")
	if name == "google" {
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		code := params.Get("code")
		if code == "" {
			http.Error(w, "Missing Google authorization.", 400)
			return
		}
		token, err := p.config.Exchange(ctx, code, oauth2.VerifierOption(a.proof("pkce")))
		if err != nil {
			http.Error(w, "Google sign-in expired. Start again in Nomi.", 401)
			return
		}
		raw, _ = token.Extra("id_token").(string)
	}
	proof, err := p.identity(r.Context(), raw, a.proof("nonce"))
	if err != nil {
		http.Error(w, "Could not verify this identity. Start again in Nomi.", 401)
		return
	}
	scheme, err := s.approveExternal(r.Context(), a.id, name, proof)
	if err != nil {
		var api *APIError
		if errors.As(err, &api) {
			http.Error(w, api.Message, api.Status)
		} else {
			http.Error(w, "Could not complete sign-in.", 500)
		}
		return
	}
	data.Return = template.URL(scheme + "://account/complete")
	cookie := a.cookie()
	cookie.MaxAge = -1
	http.SetCookie(w, cookie)
	data.render(w, r)
}

// Lock the pending request before linking. A cancelled or already consumed
// desktop request cannot leave a new association behind.
func (s *webLogin) approveExternal(ctx context.Context, id, provider string, proof externalProof) (string, error) {
	tx, err := s.Store.DB.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var scheme string
	err = tx.QueryRow(ctx, `SELECT scheme FROM sync_browser_logins WHERE id=$1 AND expires_at>now() AND user_id IS NULL FOR UPDATE`, id).Scan(&scheme)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", problem(410, "login_expired", "Start sign-in again in Nomi.")
	}
	if err != nil {
		return "", err
	}
	user, err := resolveExternal(ctx, tx, provider, proof, User{})
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `UPDATE sync_browser_logins SET user_id=$2 WHERE id=$1`, id, user.ID)
	if err != nil {
		return "", err
	}
	return scheme, tx.Commit(ctx)
}
