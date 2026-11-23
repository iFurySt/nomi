package syncserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

func randomID(prefix string) string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return prefix + "." + hex.EncodeToString(b)
}

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}
type Identity struct {
	User      User   `json:"user"`
	SessionID string `json:"sessionId"`
	DeviceID  string `json:"deviceId"`
}
type Login struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
}
type LoginResult struct {
	Identity
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}
type Session struct {
	ID         string    `json:"id"`
	DeviceID   string    `json:"deviceId"`
	DeviceName string    `json:"deviceName"`
	CreatedAt  time.Time `json:"createdAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-real-account-password"), bcrypt.DefaultCost)

func (s *Store) Provision(ctx context.Context, email, password string) (User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !strings.Contains(email, "@") || len(email) > 254 || len(password) < 12 || len(password) > 72 {
		return User{}, problem(400, "invalid_credentials", "Email required; password must be 12–72 bytes")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	u := User{ID: randomID("user"), Email: email}
	_, err = s.DB.Exec(ctx, `INSERT INTO sync_users(id,email,password_hash) VALUES($1,$2,$3)`, u.ID, email, string(hash))
	return u, err
}
func (s *Store) Login(ctx context.Context, in Login) (LoginResult, error) {
	if !safeID(in.DeviceID) || len(in.DeviceName) > 100 || len(in.Email) > 254 || len(in.Password) > 72 {
		return LoginResult{}, problem(400, "invalid_login", "Invalid login fields")
	}
	u, err := s.passwordUser(ctx, in.Email, in.Password)
	if err != nil {
		return LoginResult{}, err
	}
	return s.issueSession(ctx, u, in.DeviceID, in.DeviceName)
}

func (s *Store) issueSession(ctx context.Context, u User, deviceID, deviceName string) (LoginResult, error) {
	token := randomID("token")
	out := LoginResult{Identity: Identity{User: u, SessionID: randomID("session"), DeviceID: deviceID}, Token: token, ExpiresAt: time.Now().UTC().Add(30 * 24 * time.Hour)}
	_, err := s.DB.Exec(ctx, `INSERT INTO sync_sessions(id,token_hash,user_id,device_id,device_name,expires_at) VALUES($1,$2,$3,$4,$5,$6)`, out.SessionID, digest([]byte(token)), u.ID, deviceID, deviceName, out.ExpiresAt)
	return out, err
}
func (s *Store) Authenticate(ctx context.Context, token string) (Identity, error) {
	if len(token) > 256 || !strings.HasPrefix(token, "token.") {
		return Identity{}, problem(401, "unauthorized", "Sign in required")
	}
	var i Identity
	err := s.DB.QueryRow(ctx, `SELECT u.id,u.email,s.id,s.device_id FROM sync_sessions s JOIN sync_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, digest([]byte(token))).Scan(&i.User.ID, &i.User.Email, &i.SessionID, &i.DeviceID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = problem(401, "unauthorized", "Session expired or revoked")
	}
	return i, err
}
func (s *Store) Sessions(ctx context.Context, user string) ([]Session, error) {
	rows, err := s.DB.Query(ctx, `SELECT id,device_id,device_name,created_at,expires_at FROM sync_sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var v Session
		if err = rows.Scan(&v.ID, &v.DeviceID, &v.DeviceName, &v.CreatedAt, &v.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Store) Revoke(ctx context.Context, user, id string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM sync_sessions WHERE user_id=$1 AND id=$2`, user, id)
	return err
}

func (s *Store) passwordUser(ctx context.Context, email, password string) (User, error) {
	if len(email) > 254 || len(password) > 72 {
		return User{}, problem(400, "invalid_login", "Invalid login fields")
	}
	var u User
	hash := string(dummyHash)
	err := s.DB.QueryRow(ctx, `SELECT id,email,password_hash FROM sync_users WHERE email=$1`, strings.ToLower(strings.TrimSpace(email))).Scan(&u.ID, &u.Email, &hash)
	providerOnly := hash == "!"
	if providerOnly {
		hash = string(dummyHash)
	}
	compareErr := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return User{}, err
	}
	if err != nil || compareErr != nil || providerOnly {
		return User{}, problem(401, "invalid_credentials", "Email or password is incorrect")
	}
	return u, nil
}
