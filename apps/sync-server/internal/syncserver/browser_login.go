package syncserver

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"html/template"
	"net"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
)

var proofPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

type BrowserStart struct {
	Challenge  string `json:"challenge"`
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
	Scheme     string `json:"scheme"`
}
type BrowserRequest struct {
	ID        string    `json:"id"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (s *Store) StartBrowserLogin(ctx context.Context, in BrowserStart) (BrowserRequest, error) {
	if !proofPattern.MatchString(in.Challenge) || !safeID(in.DeviceID) || len(in.DeviceName) > 100 || (in.Scheme != "nomi" && in.Scheme != "nomi-dev") {
		return BrowserRequest{}, problem(400, "invalid_login", "Invalid login request")
	}
	out := BrowserRequest{randomID("login"), time.Now().UTC().Add(5 * time.Minute)}
	_, err := s.DB.Exec(ctx, `DELETE FROM sync_browser_logins WHERE expires_at<now()`)
	if err != nil {
		return out, err
	}
	_, err = s.DB.Exec(ctx, `INSERT INTO sync_browser_logins(id,challenge,device_id,device_name,scheme,expires_at) VALUES($1,$2,$3,$4,$5,$6)`, out.ID, in.Challenge, in.DeviceID, in.DeviceName, in.Scheme, out.ExpiresAt)
	return out, err
}
func (s *Store) ApproveBrowserLogin(ctx context.Context, id, email, password string) (string, error) {
	u, err := s.passwordUser(ctx, email, password)
	if err != nil {
		return "", err
	}
	var scheme string
	err = s.DB.QueryRow(ctx, `UPDATE sync_browser_logins SET user_id=$2 WHERE id=$1 AND user_id IS NULL AND expires_at>now() RETURNING scheme`, id, u.ID).Scan(&scheme)
	if errors.Is(err, pgx.ErrNoRows) {
		err = problem(410, "login_expired", "This sign-in request has expired. Start again in Nomi.")
	}
	return scheme, err
}
func (s *Store) ExchangeBrowserLogin(ctx context.Context, id, verifier string) (*LoginResult, error) {
	if !proofPattern.MatchString(verifier) || !safeID(id) {
		return nil, problem(400, "invalid_login", "Invalid login request")
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var challenge, device, name string
	var user *string
	err = tx.QueryRow(ctx, `SELECT challenge,device_id,device_name,user_id FROM sync_browser_logins WHERE id=$1 AND expires_at>now() FOR UPDATE`, id).Scan(&challenge, &device, &name, &user)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, problem(410, "login_expired", "Sign-in expired. Try again.")
	}
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256([]byte(verifier))
	proof := base64.RawURLEncoding.EncodeToString(hash[:])
	if subtle.ConstantTimeCompare([]byte(challenge), []byte(proof)) != 1 {
		return nil, problem(401, "invalid_proof", "Invalid login proof")
	}
	if user == nil {
		return nil, nil
	}
	out := &LoginResult{Identity: Identity{SessionID: randomID("session"), DeviceID: device}, Token: randomID("token"), ExpiresAt: time.Now().UTC().Add(30 * 24 * time.Hour)}
	err = tx.QueryRow(ctx, `SELECT id,email FROM sync_users WHERE id=$1`, *user).Scan(&out.User.ID, &out.User.Email)
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO sync_sessions(id,token_hash,user_id,device_id,device_name,expires_at) VALUES($1,$2,$3,$4,$5,$6)`, out.SessionID, digest([]byte(out.Token)), out.User.ID, device, name, out.ExpiresAt)
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx, `DELETE FROM sync_browser_logins WHERE id=$1`, id)
	if err != nil {
		return nil, err
	}
	return out, tx.Commit(ctx)
}
func (s *Server) browserRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /auth/desktop/start", func(w http.ResponseWriter, r *http.Request) {
		peer, _, _ := net.SplitHostPort(r.RemoteAddr)
		if !s.limiter.allow("start:" + peer) {
			writeError(w, problem(429, "rate_limited", "Try again later"))
			return
		}
		var in BrowserStart
		if !decode(w, r, &in) {
			return
		}
		out, err := s.Store.StartBrowserLogin(r.Context(), in)
		reply(w, out, err)
	})
	mux.HandleFunc("POST /auth/desktop/exchange", func(w http.ResponseWriter, r *http.Request) {
		peer, _, _ := net.SplitHostPort(r.RemoteAddr)
		if !s.limiter.allowLimit("exchange:"+peer, 120) {
			writeError(w, problem(429, "rate_limited", "Try again later"))
			return
		}
		var in struct {
			ID       string `json:"id"`
			Verifier string `json:"verifier"`
		}
		if !decode(w, r, &in) {
			return
		}
		out, err := s.Store.ExchangeBrowserLogin(r.Context(), in.ID, in.Verifier)
		if err != nil {
			writeError(w, err)
			return
		}
		if out == nil {
			writeJSON(w, 202, map[string]bool{"pending": true})
			return
		}
		writeJSON(w, 200, out)
	})
	mux.HandleFunc("GET /login", s.browserPage)
	mux.HandleFunc("POST /login", s.browserPage)
}
func (s *Server) browserPage(w http.ResponseWriter, r *http.Request) {
	nonce := randomID("nonce")[6:]
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'nonce-"+nonce+"'; script-src 'nonce-"+nonce+"'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	host, _, _ := net.SplitHostPort(r.Host)
	if host == "" {
		host = r.Host
	}
	local := host == "localhost" || host == "127.0.0.1" || host == "::1"
	cookieName := "__Host-nomi_login_csrf"
	if local {
		cookieName = "nomi_login_csrf"
	}
	data := struct {
		Nonce, Request, CSRF, Error, Device string
		Return                              template.URL
	}{Nonce: nonce}
	id := r.URL.Query().Get("request")
	if r.Method == "POST" {
		r.Body = http.MaxBytesReader(w, r.Body, 8192)
		if r.ParseForm() != nil {
			http.Error(w, "Invalid form", 400)
			return
		}
		id = r.PostForm.Get("request")
	}
	if !safeID(id) {
		data.Error = "Start sign-in from the Nomi app."
		browserTemplate.Execute(w, data)
		return
	}
	var scheme string
	err := s.Store.DB.QueryRow(r.Context(), `SELECT scheme,device_name FROM sync_browser_logins WHERE id=$1 AND expires_at>now() AND user_id IS NULL`, id).Scan(&scheme, &data.Device)
	if err != nil {
		data.Error = "This sign-in request has expired. Start again in Nomi."
		w.WriteHeader(410)
		browserTemplate.Execute(w, data)
		return
	}
	data.Request = id
	if r.Method == "POST" {
		cookie, err := r.Cookie(cookieName)
		if err != nil || len(cookie.Value) < 32 || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(r.PostForm.Get("csrf"))) != 1 {
			http.Error(w, "Invalid sign-in form. Open sign-in again from Nomi.", 403)
			return
		}
		peer, _, _ := net.SplitHostPort(r.RemoteAddr)
		if !s.limiter.allow(peer) {
			data.Error = "Too many attempts. Try again in a minute."
		} else {
			scheme, err = s.Store.ApproveBrowserLogin(r.Context(), id, r.PostForm.Get("email"), r.PostForm.Get("password"))
			if err == nil {
				data.Return = template.URL(scheme + "://account/complete")
				data.Request = ""
			} else {
				data.Error = "Couldn’t sign in. Check your email and password, or start again in Nomi."
			}
		}
	}
	data.CSRF = randomID("csrf")
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: data.CSRF, Path: "/", HttpOnly: true, Secure: !local, SameSite: http.SameSiteStrictMode, MaxAge: 300})
	browserTemplate.Execute(w, data)
}

var browserTemplate = template.Must(template.New("login").Parse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Nomi</title>
<style nonce="{{.Nonce}}">:root{color-scheme:light dark;--bg:#fff;--ink:#202020;--muted:#737373;--fill:#f5f5f5;--line:#e5e5e5}@media(prefers-color-scheme:dark){:root{--bg:#171717;--ink:#eee;--muted:#a0a0a0;--fill:#252525;--line:#393939}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100svh;display:grid;place-items:center;padding:28px}main{width:100%;max-width:340px}.brand{font-weight:600;font-size:18px;margin-bottom:36px}h1{font-size:26px;font-weight:550;letter-spacing:-.5px;margin:0 0 24px}label{display:grid;gap:7px;font-size:13px;margin-top:18px}input{width:100%;padding:11px 12px;background:var(--fill);border:1px solid var(--line);border-radius:9px;color:var(--ink);font:inherit}input:focus{outline:2px solid var(--muted);outline-offset:2px}button,.button{display:block;width:100%;padding:11px 16px;margin-top:24px;border:0;border-radius:999px;background:var(--ink);color:var(--bg);font:inherit;text-align:center;text-decoration:none;cursor:pointer}button:hover,.button:hover{opacity:.85}p{color:var(--muted);font-size:13px}footer{margin-top:28px} .error{margin-bottom:20px}</style>
<main><div class="brand">Nomi</div>{{if .Return}}<h1>You’re signed in.</h1><p>Continue in the Nomi app.</p><a class="button" href="{{.Return}}">Open Nomi</a><script nonce="{{.Nonce}}">location.href={{.Return}};</script>{{else}}<h1>Sign in to Nomi</h1>{{if .Error}}<p class="error" role="alert">{{.Error}}</p>{{end}}{{if .Request}}<form method="post"><input type="hidden" name="request" value="{{.Request}}"><input type="hidden" name="csrf" value="{{.CSRF}}"><label>Email<input type="email" name="email" autocomplete="username" required autofocus maxlength="254"></label><label>Password<input type="password" name="password" autocomplete="current-password" required maxlength="72"></label><button type="submit">Sign in</button></form><footer><p>Sign in to sync your documents on {{.Device}}.</p></footer>{{end}}{{end}}</main></html>`))
