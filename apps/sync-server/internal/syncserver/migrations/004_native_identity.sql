CREATE TABLE sync_external_identities (
    provider text NOT NULL,
    subject text NOT NULL,
    user_id text NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    PRIMARY KEY (provider, subject),
    UNIQUE (user_id, provider)
);

CREATE TABLE sync_identity_challenges (
    nonce text PRIMARY KEY,
    provider text NOT NULL,
    device_id text NOT NULL,
    binding_session text NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);
CREATE INDEX sync_identity_expiry ON sync_identity_challenges(expires_at);
