CREATE TABLE sync_users (
 id text PRIMARY KEY,
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sync_sessions (
 id text PRIMARY KEY,
 token_hash text NOT NULL UNIQUE,
 user_id text NOT NULL REFERENCES sync_users(id),
 device_id text NOT NULL,
 device_name text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_sessions_user ON sync_sessions(user_id);
CREATE TABLE sync_spaces (
 id text PRIMARY KEY,
 owner_id text NOT NULL REFERENCES sync_users(id),
 name text NOT NULL,
 sequence bigint NOT NULL DEFAULT 0,
 log_floor bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_spaces_owner ON sync_spaces(owner_id);
CREATE TABLE sync_entities (
 space_id text NOT NULL REFERENCES sync_spaces(id),
 kind text NOT NULL,
 id text NOT NULL,
 version bigint NOT NULL,
 deleted boolean NOT NULL DEFAULT false,
 data jsonb,
 source text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(space_id,kind,id)
);
CREATE TABLE sync_history (
 space_id text NOT NULL REFERENCES sync_spaces(id),
 kind text NOT NULL,
 id text NOT NULL,
 version bigint NOT NULL,
 deleted boolean NOT NULL,
 data jsonb,
 source text,
 archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(space_id,kind,id,version)
);
CREATE TABLE sync_changes (
 space_id text NOT NULL REFERENCES sync_spaces(id),
 sequence bigint NOT NULL,
 records jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(space_id,sequence)
);
CREATE TABLE sync_receipts (
 space_id text NOT NULL REFERENCES sync_spaces(id),
 request_id text NOT NULL,
 payload_hash text NOT NULL,
 sequence bigint NOT NULL,
 versions jsonb NOT NULL,
 PRIMARY KEY(space_id,request_id)
);
CREATE TABLE sync_objects (
 space_id text NOT NULL REFERENCES sync_spaces(id),
 sha256 text NOT NULL,
 bytes bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(space_id,sha256)
);
