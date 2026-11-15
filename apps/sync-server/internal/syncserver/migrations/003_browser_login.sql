CREATE TABLE sync_browser_logins (
    id text PRIMARY KEY,
    challenge text NOT NULL,
    device_id text NOT NULL,
    device_name text NOT NULL,
    scheme text NOT NULL CHECK (scheme IN ('nomi', 'nomi-dev')),
    user_id text REFERENCES sync_users(id),
    expires_at timestamptz NOT NULL
);
CREATE INDEX sync_browser_logins_expiry ON sync_browser_logins(expires_at);
