package syncserver

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5"
)

type nativeProvider struct {
	audience string
	verifier *oidc.IDTokenVerifier
}

func nativeProviders() map[string]nativeProvider {
	return map[string]nativeProvider{
		"apple":  newIdentityProvider("https://appleid.apple.com", "https://appleid.apple.com/auth/keys", "com.ifuryst.nomi"),
		"google": newIdentityProvider("https://accounts.google.com", "https://www.googleapis.com/oauth2/v3/certs", os.Getenv("NOMI_GOOGLE_IOS_CLIENT_ID")),
	}
}

type nativeIdentityRequest struct {
	Provider string `json:"provider"`
	DeviceID string `json:"deviceId"`
	Nonce    string `json:"nonce"`
	IDToken  string `json:"idToken"`
}

func (s *Server) nativeIdentityRoutes(mux *http.ServeMux, providers map[string]nativeProvider) {
	handle := func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		if !s.limiter.allowLimit("native:"+host, 40) {
			writeError(w, problem(429, "rate_limited", "Try again later"))
			return
		}
		var in nativeIdentityRequest
		if !decode(w, r, &in) {
			return
		}
		provider, ok := providers[in.Provider]
		if !ok || provider.audience == "" {
			writeError(w, problem(503, "provider_unavailable", "Provider unavailable"))
			return
		}
		if !safeID(in.DeviceID) {
			writeError(w, problem(400, "invalid_device", "Invalid device"))
			return
		}
		var actor Identity
		if header := r.Header.Get("Authorization"); header != "" {
			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok {
				writeError(w, problem(401, "unauthorized", "Invalid authorization"))
				return
			}
			var err error
			actor, err = s.Store.Authenticate(r.Context(), token)
			if err != nil {
				writeError(w, err)
				return
			}
		}
		ctx := r.Context()
		if r.URL.Path == "/auth/native/challenge" {
			nonce := randomID("nonce")
			_, err := s.Store.DB.Exec(ctx, `DELETE FROM sync_identity_challenges WHERE expires_at<=now()`)
			if err == nil {
				_, err = s.Store.DB.Exec(ctx, `INSERT INTO sync_identity_challenges(nonce,provider,device_id,binding_session) VALUES($1,$2,$3,$4)`, nonce, in.Provider, in.DeviceID, actor.SessionID)
			}
			reply(w, map[string]string{"nonce": nonce, "clientId": provider.audience}, err)
			return
		}
		if !safeID(in.Nonce) || len(in.IDToken) > 16384 || in.IDToken == "" {
			writeError(w, problem(400, "invalid_proof", "Invalid proof"))
			return
		}
		row, err := s.Store.DB.Exec(ctx, `DELETE FROM sync_identity_challenges WHERE nonce=$1 AND provider=$2 AND device_id=$3 AND binding_session=$4 AND expires_at>now()`, in.Nonce, in.Provider, in.DeviceID, actor.SessionID)
		if err != nil {
			writeError(w, err)
			return
		}
		if row.RowsAffected() != 1 {
			writeError(w, problem(401, "invalid_proof", "Start sign-in again"))
			return
		}
		proof, err := provider.identity(ctx, in.IDToken, in.Nonce)
		if err != nil {
			writeError(w, err)
			return
		}
		tx, err := s.Store.DB.Begin(ctx)
		if err != nil {
			writeError(w, err)
			return
		}
		defer tx.Rollback(ctx)
		user, err := resolveExternal(ctx, tx, in.Provider, proof, actor.User)
		if err == nil {
			err = tx.Commit(ctx)
		}
		if err != nil {
			writeError(w, err)
			return
		}
		if actor.User.ID != "" {
			reply(w, map[string]bool{"linked": true}, nil)
			return
		}
		out, err := s.Store.issueSession(ctx, user, in.DeviceID, "Nomi · iPhone")
		reply(w, out, err)
	}
	mux.HandleFunc("POST /auth/native/challenge", handle)
	mux.HandleFunc("POST /auth/native/exchange", handle)
}

type externalProof struct{ subject, email, hostedDomain string }

func (p nativeProvider) identity(ctx context.Context, raw, nonce string) (externalProof, error) {
	id, err := p.verifier.Verify(ctx, raw)
	var claims struct {
		HostedDomain    string          `json:"hd"`
		AuthorizedParty string          `json:"azp"`
		Email           string          `json:"email"`
		Verified        json.RawMessage `json:"email_verified"`
	}
	if err != nil || id.Claims(&claims) != nil || len(id.Audience) != 1 ||
		(claims.AuthorizedParty != "" && claims.AuthorizedParty != p.audience) ||
		nonce == "" || id.Nonce != nonce || id.Subject == "" || len(id.Subject) > 255 {
		return externalProof{}, problem(401, "invalid_proof", "Invalid identity token")
	}
	proof := externalProof{subject: id.Subject, hostedDomain: claims.HostedDomain}
	// Apple also emits the verified flag as a JSON string.
	if string(claims.Verified) == "true" || string(claims.Verified) == `"true"` {
		email := strings.ToLower(strings.TrimSpace(claims.Email))
		if address, err := mail.ParseAddress(email); err == nil && address.Address == email && len(email) <= 254 {
			proof.email = email
		}
	}
	return proof, nil
}

// The stable provider subject wins on subsequent logins, even if the provider
// no longer returns an email. A first login resolves both unique keys atomically.
func resolveExternal(ctx context.Context, tx pgx.Tx, provider string, proof externalProof, actor User) (User, error) {
	var user User
	err := tx.QueryRow(ctx, `SELECT u.id,u.email FROM sync_external_identities e JOIN sync_users u ON u.id=e.user_id WHERE e.provider=$1 AND e.subject=$2`, provider, proof.subject).Scan(&user.ID, &user.Email)
	conflict := problem(409, "identity_in_use", "This identity is already associated with another account.")
	if err == nil {
		if actor.ID != "" && actor.ID != user.ID {
			return User{}, conflict
		}
		return user, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return User{}, err
	}
	if proof.email == "" {
		return User{}, problem(403, "verified_email_required", "Allow your provider to share a verified email address and try again.")
	}
	// Google can attest to an old verification of an independently hosted
	// mailbox even after ownership has changed. Only its managed addresses
	// prove current ownership on a first sign-in.
	if provider == "google" && proof.hostedDomain == "" && !strings.HasSuffix(proof.email, "@gmail.com") {
		return User{}, problem(403, "email_ownership_required", "Google cannot confirm current ownership of this external mailbox. Use a Gmail or Google Workspace account, or sign in with Apple.")
	}
	if actor.ID != "" && actor.Email != proof.email {
		return User{}, conflict
	}
	err = tx.QueryRow(ctx, `INSERT INTO sync_users(id,email,password_hash) VALUES($1,$2,'!') ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id,email`, randomID("user"), proof.email).Scan(&user.ID, &user.Email)
	if err != nil {
		return User{}, err
	}
	row, err := tx.Exec(ctx, `INSERT INTO sync_external_identities(provider,subject,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, provider, proof.subject, user.ID)
	if err != nil {
		return User{}, err
	}
	if row.RowsAffected() == 0 {
		var same bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM sync_external_identities WHERE provider=$1 AND subject=$2 AND user_id=$3)`, provider, proof.subject, user.ID).Scan(&same)
		if err != nil {
			return User{}, err
		}
		if !same {
			return User{}, conflict
		}
	}
	return user, nil
}

func newIdentityProvider(issuer, keys, audience string) nativeProvider {
	ctx := oidc.ClientContext(context.Background(), &http.Client{Timeout: 8 * time.Second})
	return nativeProvider{audience, oidc.NewVerifier(issuer, oidc.NewRemoteKeySet(ctx, keys),
		&oidc.Config{ClientID: audience, SupportedSigningAlgs: []string{"RS256"}})}
}
