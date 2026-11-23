package syncserver

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
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
	return s.approveUser(ctx, id, u.ID)
}

func (s *Store) approveUser(ctx context.Context, id, user string) (string, error) {
	var scheme string
	err := s.DB.QueryRow(ctx, `UPDATE sync_browser_logins SET user_id=$2 WHERE id=$1 AND user_id IS NULL AND expires_at>now() RETURNING scheme`, id, user).Scan(&scheme)
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
	web := s.websiteLogin()
	mux.HandleFunc("GET /auth/web/google", web.callback)
	mux.HandleFunc("POST /auth/web/apple", web.callback)
	mux.HandleFunc("GET /login", web.browserPage)
	mux.HandleFunc("POST /login", web.browserPage)
}

type browserView struct {
	Nonce, Request, CSRF, Error string
	Google, Apple               bool
	Return                      template.URL
}

func newBrowserView(w http.ResponseWriter) browserView {
	nonce := randomID("nonce")[6:]
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'nonce-"+nonce+"'; script-src 'nonce-"+nonce+"'; form-action 'self' https://accounts.google.com https://appleid.apple.com; base-uri 'none'; frame-ancestors 'none'")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	return browserView{Nonce: nonce}
}
func csrfCookie(r *http.Request) (string, bool) {
	host, _, _ := net.SplitHostPort(r.Host)
	if host == "" {
		host = r.Host
	}
	local := host == "localhost" || host == "127.0.0.1" || host == "::1"
	if local {
		return "nomi_login_csrf", false
	}
	return "__Host-nomi_login_csrf", true
}
func (data *browserView) render(w http.ResponseWriter, r *http.Request) {
	name, secure := csrfCookie(r)
	data.CSRF = randomID("csrf")
	http.SetCookie(w, &http.Cookie{Name: name, Value: data.CSRF, Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode, MaxAge: 300})
	browserTemplate.Execute(w, data)
}
func (s *webLogin) browserPage(w http.ResponseWriter, r *http.Request) {
	data := newBrowserView(w)
	_, data.Google = s.providers["google"]
	_, data.Apple = s.providers["apple"]
	cookieName, _ := csrfCookie(r)
	id := r.URL.Query().Get("request")
	if r.Method == "POST" {
		r.Body = http.MaxBytesReader(w, r.Body, 32768)
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
	err := s.Store.DB.QueryRow(r.Context(), `SELECT scheme FROM sync_browser_logins WHERE id=$1 AND expires_at>now() AND user_id IS NULL`, id).Scan(&scheme)
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
		} else if provider := r.PostForm.Get("provider"); provider != "" {
			s.begin(w, r, id, provider)
			return
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
	data.render(w, r)
}

//go:embed login.html
var loginPage embed.FS

// The Google branding asset is bundled so opening the form makes no third-party requests.
//
//go:embed google-g.png
var googleMark []byte

var browserTemplate = template.Must(template.New("login.html").Funcs(template.FuncMap{
	"googleLogo": func() template.URL { return googleLogoURL },
}).ParseFS(loginPage, "login.html"))

var googleLogoURL = template.URL("data:image/png;base64," + base64.StdEncoding.EncodeToString(googleMark))
