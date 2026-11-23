package syncserver

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-jose/go-jose/v4"
)

func TestNativeIdentityBindingAndLogin(t *testing.T) {
	store := testStore(t)
	user, _ := fixture(t, store)
	other, err := store.Provision(context.Background(), "second@example.invalid", "synthetic-passphrase")
	if err != nil {
		t.Fatal(err)
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, nil)
	if err != nil {
		t.Fatal(err)
	}
	const issuer = "https://issuer.example.invalid"
	const client = "nomi-ios-test"
	verifier := oidc.NewVerifier(issuer, &oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}}, &oidc.Config{ClientID: client})
	mux := http.NewServeMux()
	(&Server{Store: store}).nativeIdentityRoutes(mux, map[string]nativeProvider{"google": {client, verifier}})
	call := func(route, token string, in nativeIdentityRequest, status int) map[string]any {
		t.Helper()
		body, _ := json.Marshal(in)
		req := httptest.NewRequest("POST", "/auth/native/"+route, bytes.NewReader(body))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != status {
			t.Fatalf("%s: got %d, want %d", route, w.Code, status)
		}
		var out map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	subject, email, verified := "stable-subject", user.Email, false
	hostedDomain := "example.invalid"
	proof := func(session, aud string) nativeIdentityRequest {
		t.Helper()
		in := nativeIdentityRequest{Provider: "google", DeviceID: "device.test"}
		in.Nonce = call("challenge", session, in, 200)["nonce"].(string)
		payload, _ := json.Marshal(map[string]any{"iss": issuer, "aud": aud, "exp": time.Now().Add(time.Minute).Unix(), "sub": subject, "nonce": in.Nonce, "email": email, "hd": hostedDomain, "email_verified": verified})
		obj, err := signer.Sign(payload)
		if err != nil {
			t.Fatal(err)
		}
		in.IDToken, err = obj.CompactSerialize()
		if err != nil {
			t.Fatal(err)
		}
		return in
	}
	first, err := store.issueSession(context.Background(), user, "device.test", "Test")
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.issueSession(context.Background(), other, "device.other", "Test")
	if err != nil {
		t.Fatal(err)
	}
	call("exchange", "", proof("", "another-client"), 401)
	call("exchange", "", proof("", client), 403) // An unverified email cannot claim an account.
	verified = true
	hostedDomain = ""
	call("exchange", "", proof("", client), 403)
	hostedDomain = "example.invalid"
	call("exchange", "", proof("", client), 200)
	in := proof(first.Token, client)
	call("exchange", second.Token, in, 401)
	call("exchange", first.Token, in, 200)
	call("exchange", first.Token, in, 401)
	call("exchange", second.Token, proof(second.Token, client), 409)
	fresh := proof("", client)
	different := proof("", client)
	different.IDToken = fresh.IDToken
	call("exchange", "", different, 401)
	token := call("exchange", "", fresh, 200)["token"].(string)
	identity, err := store.Authenticate(context.Background(), token)
	if err != nil || identity.User != user {
		t.Fatal("provider login did not restore the linked account")
	}
	subject = "another-subject"
	call("exchange", "", proof("", client), 409)
	email = "new-user@example.invalid"
	token = call("exchange", "", proof("", client), 200)["token"].(string)
	created, err := store.Authenticate(context.Background(), token)
	if err != nil || created.User.Email != email || created.User.ID == user.ID {
		t.Fatal("first login should create a separate user", err)
	}
	if _, err := store.passwordUser(context.Background(), email, "not-a-real-account-password"); err == nil {
		t.Fatal("provider-only user accepted password")
	}
	email = user.Email
	verified = false
	token = call("exchange", "", proof("", client), 200)["token"].(string)
	returning, err := store.Authenticate(context.Background(), token)
	if err != nil || returning.User != created.User {
		t.Fatal("returning subject was reassigned")
	}

}

func TestConcurrentFirstProviderLogins(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	type result struct {
		user User
		err  error
	}
	done := make(chan result, 4)
	for _, provider := range []string{"google", "apple", "google", "apple"} {
		go func(name string) {
			tx, err := store.DB.Begin(ctx)
			if err != nil {
				done <- result{err: err}
				return
			}
			defer tx.Rollback(ctx)
			u, err := resolveExternal(ctx, tx, name, externalProof{subject: "s." + name, email: "same@example.invalid", hostedDomain: "example.invalid"}, User{})
			if err == nil {
				err = tx.Commit(ctx)
			}
			done <- result{u, err}
		}(provider)
	}
	var userID string
	for i := 0; i < 4; i++ {
		r := <-done
		if r.err != nil || r.user.ID == "" || (userID != "" && userID != r.user.ID) {
			t.Fatalf("concurrent login resolved a different user: %v", r.err)
		}
		userID = r.user.ID
	}
}
