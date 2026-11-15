package syncserver

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Server struct {
	Store   *Store
	Objects ObjectStore
	limiter loginLimiter
}
type loginWindow struct {
	start time.Time
	count int
}
type loginLimiter struct {
	mu      sync.Mutex
	windows map[string]loginWindow
}

func (l *loginLimiter) allow(key string) bool { return l.allowLimit(key, 10) }
func (l *loginLimiter) allowLimit(key string, limit int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if l.windows == nil {
		l.windows = map[string]loginWindow{}
	}
	for k, w := range l.windows {
		if now.Sub(w.start) > time.Minute {
			delete(l.windows, k)
		}
	}
	w := l.windows[key]
	if w.start.IsZero() {
		w.start = now
	}
	w.count++
	l.windows[key] = w
	return w.count <= limit
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	s.browserRoutes(mux)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		if err := s.Store.DB.Ping(r.Context()); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok", "protocol": Protocol})
	})
	mux.HandleFunc("POST /auth/login", func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		if !s.limiter.allow(host) {
			w.Header().Set("Retry-After", "60")
			writeError(w, problem(429, "rate_limited", "Try again later"))
			return
		}
		var in Login
		if !decode(w, r, &in) {
			return
		}
		out, err := s.Store.Login(r.Context(), in)
		reply(w, out, err)
	})
	mux.HandleFunc("/v1/", s.authorized)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		start := time.Now()
		response := &observedResponse{ResponseWriter: w, status: http.StatusOK}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			cloned := r.Clone(r.Context())
			url := *r.URL
			url.Path = strings.TrimPrefix(url.Path, "/api")
			cloned.URL = &url
			r = cloned
		}
		mux.ServeHTTP(response, r)
		if r.URL.Path != "/health" {
			// No path IDs, bodies, emails, tokens or original names in operational logs.
			slog.Info("sync request", "operation", operationName(r.URL.Path), "method", r.Method,
				"status", response.status, "duration_ms", time.Since(start).Milliseconds())
		}
	})
}
func (s *Server) authorized(w http.ResponseWriter, r *http.Request) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		writeError(w, problem(401, "unauthorized", "Sign in required"))
		return
	}
	i, err := s.Store.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, err)
		return
	}
	ctx := r.Context()
	user := i.User.ID
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/v1/"), "/")
	parts := strings.Split(path, "/")
	switch {
	case path == "me" && r.Method == "GET":
		writeJSON(w, 200, i)
	case path == "sessions" && r.Method == "GET":
		out, err := s.Store.Sessions(ctx, user)
		reply(w, out, err)
	case len(parts) == 2 && parts[0] == "sessions" && r.Method == "DELETE":
		err := s.Store.Revoke(ctx, user, parts[1])
		reply(w, map[string]bool{"ok": true}, err)
	case path == "spaces" && r.Method == "GET":
		out, err := s.Store.Spaces(ctx, user)
		reply(w, out, err)
	case path == "spaces" && r.Method == "POST":
		var in struct {
			Name string `json:"name"`
		}
		if !decode(w, r, &in) {
			return
		}
		out, err := s.Store.CreateSpace(ctx, user, in.Name)
		reply(w, out, err)
	case len(parts) >= 3 && parts[0] == "spaces" && safeID(parts[1]):
		space := parts[1]
		switch {
		case len(parts) == 4 && parts[2] == "objects":
			s.object(w, r, user, space, parts[3])
		case len(parts) == 3 && parts[2] == "commit" && r.Method == "POST":
			var in Commit
			if !decode(w, r, &in) {
				return
			}
			out, err := s.Store.Commit(ctx, user, space, in)
			reply(w, out, err)
		case len(parts) == 3 && parts[2] == "snapshot" && r.Method == "GET":
			out, err := s.Store.Snapshot(ctx, user, space)
			reply(w, out, err)
		case len(parts) == 3 && parts[2] == "changes" && r.Method == "GET":
			after, e := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
			if e != nil {
				writeError(w, problem(400, "invalid_cursor", "after required"))
				return
			}
			limit := 50
			if q := r.URL.Query().Get("limit"); q != "" {
				limit, e = strconv.Atoi(q)
				if e != nil {
					writeError(w, problem(400, "invalid_cursor", "Invalid limit"))
					return
				}
			}
			out, err := s.Store.Changes(ctx, user, space, after, limit)
			reply(w, out, err)
		case len(parts) == 5 && parts[2] == "history" && validKind(parts[3]) && safeID(parts[4]) && r.Method == "GET":
			before, limit := int64(0), 50
			var err error
			if q := r.URL.Query().Get("before"); q != "" {
				before, err = strconv.ParseInt(q, 10, 64)
			}
			if err != nil {
				writeError(w, problem(400, "invalid_history_cursor", "Invalid before"))
				return
			}
			if q := r.URL.Query().Get("limit"); q != "" {
				limit, err = strconv.Atoi(q)
			}
			if err != nil {
				writeError(w, problem(400, "invalid_history_cursor", "Invalid limit"))
				return
			}
			out, err := s.Store.HistoryPage(ctx, user, space, parts[3], parts[4], before, limit)
			reply(w, out, err)
		default:
			writeError(w, problem(404, "not_found", "Route not found"))
		}
	default:
		writeError(w, problem(404, "not_found", "Route not found"))
	}
}
func decode(w http.ResponseWriter, r *http.Request, out any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBody)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(out); err != nil {
		writeError(w, problem(400, "invalid_json", "Invalid or oversized request"))
		return false
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		writeError(w, problem(400, "invalid_json", "One JSON object required"))
		return false
	}
	return true
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func reply(w http.ResponseWriter, v any, err error) {
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 200, v)
}
func writeError(w http.ResponseWriter, err error) {
	var e *APIError
	if !errors.As(err, &e) {
		slog.Error("sync request failed", "error_type", stringErrorType(err))
		e = &APIError{Status: 500, Code: "internal_error", Message: "Server could not complete the request"}
	}
	writeJSON(w, e.Status, e)
}

// Do not log SQL arguments, credentials or document bodies on internal errors.
func stringErrorType(err error) string {
	switch {
	case errors.Is(err, io.EOF):
		return "io_eof"
	default:
		return "storage_or_internal"
	}
}

// Preserve ResponseController support while recording the first HTTP status.
type observedResponse struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (w *observedResponse) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *observedResponse) WriteHeader(status int) {
	if !w.wrote {
		w.status = status
		w.wrote = true
		w.ResponseWriter.WriteHeader(status)
	}
}
func (w *observedResponse) Write(b []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}
func operationName(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if path == "/auth/login" {
		return "login"
	}
	if len(parts) >= 2 && parts[0] == "v1" {
		if parts[1] == "sessions" {
			return "sessions"
		}
		if parts[1] == "me" {
			return "me"
		}
		if parts[1] == "spaces" {
			if len(parts) == 2 {
				return "spaces"
			}
			if len(parts) >= 4 {
				switch parts[3] {
				case "snapshot", "changes", "commit", "history", "objects":
					return parts[3]
				}
			}
		}
	}
	return "unknown"
}
