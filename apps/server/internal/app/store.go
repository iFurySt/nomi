package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound      = errors.New("not_found")
	ErrConflict      = errors.New("conflict")
	ErrInvalidInvite = errors.New("invalid_invite")
)

type Store interface {
	Ping(context.Context) error
	EnsureSchema(context.Context) error
	CreateOwner(context.Context, string, string, string, string) (AuthIdentity, error)
	JoinHousehold(context.Context, string, string, string, string) (AuthIdentity, error)
	FindIdentityByEmail(context.Context, string) (AuthIdentity, error)
	CreateSession(context.Context, Principal, string, time.Time) error
	ResolveSession(context.Context, string, time.Time) (Principal, error)
	DeleteSession(context.Context, string) error
	CreateInvite(context.Context, Principal, string, time.Time) error
	ListPeople(context.Context, string) ([]Person, error)
	CreatePerson(context.Context, Principal, string, string) (Person, error)
	UpdatePerson(context.Context, Principal, string, string, string) (Person, error)
	DeletePerson(context.Context, Principal, string) (bool, error)
	CreateAsset(context.Context, Asset) (Asset, error)
	ListAssets(context.Context, string, *string) ([]Asset, error)
	GetAsset(context.Context, string, string) (Asset, error)
	DeleteAsset(context.Context, string, string) (Asset, error)
	CompleteAssetAnalysis(context.Context, string, string, json.RawMessage) error
	CreateJob(context.Context, Job) (Job, error)
	ListJobs(context.Context, string, *string) ([]Job, error)
	GetJob(context.Context, string, string) (Job, error)
	ClaimNextJob(context.Context, time.Time) (Job, error)
	CompleteJob(context.Context, string, json.RawMessage) error
	FailJob(context.Context, string, string) error
	RequeueExpiredJobs(context.Context, time.Time) error
	CreateThread(context.Context, Principal, *string, string) (Thread, error)
	ListThreads(context.Context, string, *string) ([]Thread, error)
	GetThread(context.Context, string, string) (Thread, error)
	DeleteThread(context.Context, string, string) (bool, error)
	CreateMessage(context.Context, Message) (Message, error)
	ListMessages(context.Context, string, string) ([]Message, error)
}

type PostgresStore struct{ pool *pgxpool.Pool }

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore { return &PostgresStore{pool: pool} }
func (s *PostgresStore) Ping(ctx context.Context) error  { return s.pool.Ping(ctx) }

func (s *PostgresStore) EnsureSchema(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
create extension if not exists pgcrypto;
drop table if exists records cascade;
create table if not exists users(id uuid primary key default gen_random_uuid(),email text not null unique,password_hash text not null,display_name text not null,created_at timestamptz not null default now());
create table if not exists households(id uuid primary key default gen_random_uuid(),name text not null,created_by uuid not null references users(id),created_at timestamptz not null default now());
create table if not exists household_memberships(household_id uuid not null references households(id) on delete cascade,user_id uuid not null references users(id) on delete cascade,role text not null check(role in('owner','member')),created_at timestamptz not null default now(),primary key(household_id,user_id));
create table if not exists sessions(id uuid primary key default gen_random_uuid(),token_hash text not null unique,user_id uuid not null references users(id) on delete cascade,household_id uuid not null references households(id) on delete cascade,expires_at timestamptz not null,created_at timestamptz not null default now());
create table if not exists household_invites(id uuid primary key default gen_random_uuid(),household_id uuid not null references households(id) on delete cascade,token_hash text not null unique,created_by uuid not null references users(id),expires_at timestamptz not null,redeemed_at timestamptz,created_at timestamptz not null default now());
create table if not exists people(id uuid primary key default gen_random_uuid(),household_id uuid not null references households(id) on delete cascade,display_name text not null,relationship text not null default '',created_by uuid not null references users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists assets(id uuid primary key default gen_random_uuid(),household_id uuid not null references households(id) on delete cascade,person_id uuid references people(id) on delete set null,created_by uuid not null references users(id),storage_provider text not null,storage_key text not null unique,original_name text not null,mime_type text not null,size_bytes bigint not null,sha256 text not null,status text not null default 'queued',analysis jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists jobs(id uuid primary key default gen_random_uuid(),household_id uuid not null references households(id) on delete cascade,person_id uuid references people(id) on delete set null,created_by uuid not null references users(id),kind text not null check(kind in('ingest','chat')),status text not null default 'queued' check(status in('queued','processing','completed','failed')),payload jsonb not null default '{}'::jsonb,result jsonb,error text not null default '',attempts int not null default 0,created_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz);
create table if not exists threads(id uuid primary key default gen_random_uuid(),household_id uuid not null references households(id) on delete cascade,person_id uuid references people(id) on delete set null,created_by uuid not null references users(id),title text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists messages(id uuid primary key default gen_random_uuid(),household_id uuid not null references households(id) on delete cascade,thread_id uuid not null references threads(id) on delete cascade,user_id uuid references users(id) on delete set null,role text not null check(role in('user','assistant')),content text not null,citations jsonb,status text not null default 'completed',created_at timestamptz not null default now());
create index if not exists sessions_token_hash_idx on sessions(token_hash);
create index if not exists people_household_idx on people(household_id,created_at);
create index if not exists assets_household_idx on assets(household_id,created_at desc);
create index if not exists jobs_queue_idx on jobs(status,created_at);
create index if not exists jobs_household_idx on jobs(household_id,created_at desc);
create index if not exists threads_household_idx on threads(household_id,updated_at desc);
create index if not exists messages_thread_idx on messages(thread_id,created_at);`)
	return err
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *PostgresStore) CreateOwner(ctx context.Context, email, passwordHash, displayName, householdName string) (AuthIdentity, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AuthIdentity{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext('nomi-bootstrap-owner'))`); err != nil {
		return AuthIdentity{}, err
	}
	var householdExists bool
	if err = tx.QueryRow(ctx, `select exists(select 1 from households)`).Scan(&householdExists); err != nil {
		return AuthIdentity{}, err
	}
	if householdExists {
		return AuthIdentity{}, ErrInvalidInvite
	}
	var out AuthIdentity
	err = tx.QueryRow(ctx, `insert into users(email,password_hash,display_name) values($1,$2,$3) returning id::text,email,display_name,created_at`, email, passwordHash, displayName).Scan(&out.User.ID, &out.User.Email, &out.User.DisplayName, &out.User.CreatedAt)
	if err != nil {
		return AuthIdentity{}, mapPGError(err)
	}
	err = tx.QueryRow(ctx, `insert into households(name,created_by) values($1,$2::uuid) returning id::text,name,created_at`, householdName, out.User.ID).Scan(&out.Household.ID, &out.Household.Name, &out.Household.CreatedAt)
	if err != nil {
		return AuthIdentity{}, err
	}
	out.Household.Role = RoleOwner
	if _, err = tx.Exec(ctx, `insert into household_memberships(household_id,user_id,role) values($1::uuid,$2::uuid,'owner')`, out.Household.ID, out.User.ID); err != nil {
		return AuthIdentity{}, err
	}
	if _, err = tx.Exec(ctx, `insert into people(household_id,display_name,relationship,created_by) values($1::uuid,$2,'本人',$3::uuid)`, out.Household.ID, displayName, out.User.ID); err != nil {
		return AuthIdentity{}, err
	}
	return out, tx.Commit(ctx)
}

// ProvisionIsolatedOwner is intentionally available only to the server CLI. It
// creates a separate household for operational accounts such as App Review and
// never joins the real bootstrap household.
func (s *PostgresStore) ProvisionIsolatedOwner(ctx context.Context, email, passwordHash, displayName, householdName string) (AuthIdentity, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AuthIdentity{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext($1))`, "nomi-provision-isolated-owner:"+email); err != nil {
		return AuthIdentity{}, err
	}
	var out AuthIdentity
	err = tx.QueryRow(ctx, `insert into users(email,password_hash,display_name) values($1,$2,$3) returning id::text,email,display_name,created_at`, email, passwordHash, displayName).Scan(&out.User.ID, &out.User.Email, &out.User.DisplayName, &out.User.CreatedAt)
	if err != nil {
		return AuthIdentity{}, mapPGError(err)
	}
	err = tx.QueryRow(ctx, `insert into households(name,created_by) values($1,$2::uuid) returning id::text,name,created_at`, householdName, out.User.ID).Scan(&out.Household.ID, &out.Household.Name, &out.Household.CreatedAt)
	if err != nil {
		return AuthIdentity{}, err
	}
	out.Household.Role = RoleOwner
	if _, err = tx.Exec(ctx, `insert into household_memberships(household_id,user_id,role) values($1::uuid,$2::uuid,'owner')`, out.Household.ID, out.User.ID); err != nil {
		return AuthIdentity{}, err
	}
	if _, err = tx.Exec(ctx, `insert into people(household_id,display_name,relationship,created_by) values($1::uuid,$2,'演示账号',$3::uuid)`, out.Household.ID, displayName, out.User.ID); err != nil {
		return AuthIdentity{}, err
	}
	return out, tx.Commit(ctx)
}

func (s *PostgresStore) JoinHousehold(ctx context.Context, inviteToken, email, passwordHash, displayName string) (AuthIdentity, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AuthIdentity{}, err
	}
	defer tx.Rollback(ctx)
	var householdID, householdName string
	var createdAt time.Time
	err = tx.QueryRow(ctx, `select h.id::text,h.name,h.created_at from household_invites i join households h on h.id=i.household_id where i.token_hash=$1 and i.redeemed_at is null and i.expires_at>now() for update`, tokenHash(inviteToken)).Scan(&householdID, &householdName, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return AuthIdentity{}, ErrInvalidInvite
	}
	if err != nil {
		return AuthIdentity{}, err
	}
	var out AuthIdentity
	err = tx.QueryRow(ctx, `insert into users(email,password_hash,display_name) values($1,$2,$3) returning id::text,email,display_name,created_at`, email, passwordHash, displayName).Scan(&out.User.ID, &out.User.Email, &out.User.DisplayName, &out.User.CreatedAt)
	if err != nil {
		return AuthIdentity{}, mapPGError(err)
	}
	if _, err = tx.Exec(ctx, `insert into household_memberships(household_id,user_id,role) values($1::uuid,$2::uuid,'member')`, householdID, out.User.ID); err != nil {
		return AuthIdentity{}, err
	}
	if _, err = tx.Exec(ctx, `update household_invites set redeemed_at=now() where token_hash=$1`, tokenHash(inviteToken)); err != nil {
		return AuthIdentity{}, err
	}
	if _, err = tx.Exec(ctx, `insert into people(household_id,display_name,relationship,created_by) values($1::uuid,$2,'本人',$3::uuid)`, householdID, displayName, out.User.ID); err != nil {
		return AuthIdentity{}, err
	}
	out.Household = Household{ID: householdID, Name: householdName, Role: RoleMember, CreatedAt: createdAt}
	return out, tx.Commit(ctx)
}

func (s *PostgresStore) FindIdentityByEmail(ctx context.Context, email string) (AuthIdentity, error) {
	var out AuthIdentity
	err := s.pool.QueryRow(ctx, `select u.id::text,u.email,u.display_name,u.created_at,u.password_hash,h.id::text,h.name,m.role,h.created_at from users u join household_memberships m on m.user_id=u.id join households h on h.id=m.household_id where u.email=$1 order by m.created_at limit 1`, email).Scan(&out.User.ID, &out.User.Email, &out.User.DisplayName, &out.User.CreatedAt, &out.PasswordHash, &out.Household.ID, &out.Household.Name, &out.Household.Role, &out.Household.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return AuthIdentity{}, ErrNotFound
	}
	return out, err
}
func (s *PostgresStore) CreateSession(ctx context.Context, p Principal, token string, expires time.Time) error {
	_, err := s.pool.Exec(ctx, `insert into sessions(token_hash,user_id,household_id,expires_at) values($1,$2::uuid,$3::uuid,$4)`, tokenHash(token), p.UserID, p.HouseholdID, expires)
	return err
}
func (s *PostgresStore) ResolveSession(ctx context.Context, token string, now time.Time) (Principal, error) {
	var p Principal
	err := s.pool.QueryRow(ctx, `select s.user_id::text,s.household_id::text,m.role from sessions s join household_memberships m on m.user_id=s.user_id and m.household_id=s.household_id where s.token_hash=$1 and s.expires_at>$2`, tokenHash(token), now).Scan(&p.UserID, &p.HouseholdID, &p.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return Principal{}, ErrNotFound
	}
	return p, err
}
func (s *PostgresStore) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `delete from sessions where token_hash=$1`, tokenHash(token))
	return err
}
func (s *PostgresStore) CreateInvite(ctx context.Context, p Principal, token string, expires time.Time) error {
	if p.Role != RoleOwner {
		return ErrNotFound
	}
	_, err := s.pool.Exec(ctx, `insert into household_invites(household_id,token_hash,created_by,expires_at) values($1::uuid,$2,$3::uuid,$4)`, p.HouseholdID, tokenHash(token), p.UserID, expires)
	return err
}

func scanPerson(row pgx.Row) (Person, error) {
	var p Person
	err := row.Scan(&p.ID, &p.HouseholdID, &p.DisplayName, &p.Relationship, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}
func (s *PostgresStore) ListPeople(ctx context.Context, h string) ([]Person, error) {
	rows, err := s.pool.Query(ctx, `select id::text,household_id::text,display_name,relationship,created_by::text,created_at,updated_at from people where household_id=$1::uuid order by created_at`, h)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Person{}
	for rows.Next() {
		p, err := scanPerson(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func (s *PostgresStore) CreatePerson(ctx context.Context, p Principal, name, relationship string) (Person, error) {
	return scanPerson(s.pool.QueryRow(ctx, `insert into people(household_id,display_name,relationship,created_by) values($1::uuid,$2,$3,$4::uuid) returning id::text,household_id::text,display_name,relationship,created_by::text,created_at,updated_at`, p.HouseholdID, name, relationship, p.UserID))
}
func (s *PostgresStore) UpdatePerson(ctx context.Context, p Principal, id, name, relationship string) (Person, error) {
	out, err := scanPerson(s.pool.QueryRow(ctx, `update people set display_name=$3,relationship=$4,updated_at=now() where id=$1::uuid and household_id=$2::uuid returning id::text,household_id::text,display_name,relationship,created_by::text,created_at,updated_at`, id, p.HouseholdID, name, relationship))
	if errors.Is(err, pgx.ErrNoRows) {
		return Person{}, ErrNotFound
	}
	return out, err
}
func (s *PostgresStore) DeletePerson(ctx context.Context, p Principal, id string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `delete from people where id=$1::uuid and household_id=$2::uuid`, id, p.HouseholdID)
	return tag.RowsAffected() > 0, err
}

func scanAsset(row pgx.Row) (Asset, error) {
	var a Asset
	err := row.Scan(&a.ID, &a.HouseholdID, &a.PersonID, &a.CreatedBy, &a.StorageProvider, &a.StorageKey, &a.OriginalName, &a.MimeType, &a.SizeBytes, &a.SHA256, &a.Status, &a.Analysis, &a.CreatedAt, &a.UpdatedAt)
	return a, err
}

const assetCols = `id::text,household_id::text,person_id::text,created_by::text,storage_provider,storage_key,original_name,mime_type,size_bytes,sha256,status,analysis,created_at,updated_at`

func (s *PostgresStore) CreateAsset(ctx context.Context, a Asset) (Asset, error) {
	return scanAsset(s.pool.QueryRow(ctx, `insert into assets(id,household_id,person_id,created_by,storage_provider,storage_key,original_name,mime_type,size_bytes,sha256,status) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10,$11) returning `+assetCols, a.ID, a.HouseholdID, a.PersonID, a.CreatedBy, a.StorageProvider, a.StorageKey, a.OriginalName, a.MimeType, a.SizeBytes, a.SHA256, a.Status))
}
func (s *PostgresStore) ListAssets(ctx context.Context, h string, person *string) ([]Asset, error) {
	q := `select ` + assetCols + ` from assets where household_id=$1::uuid`
	args := []any{h}
	if person != nil {
		q += ` and person_id=$2::uuid`
		args = append(args, *person)
	}
	q += ` order by created_at desc limit 100`
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Asset{}
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
func (s *PostgresStore) GetAsset(ctx context.Context, h, id string) (Asset, error) {
	a, err := scanAsset(s.pool.QueryRow(ctx, `select `+assetCols+` from assets where id=$1::uuid and household_id=$2::uuid`, id, h))
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	return a, err
}
func (s *PostgresStore) DeleteAsset(ctx context.Context, h, id string) (Asset, error) {
	a, err := scanAsset(s.pool.QueryRow(ctx, `delete from assets where id=$1::uuid and household_id=$2::uuid returning `+assetCols, id, h))
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	return a, err
}
func (s *PostgresStore) CompleteAssetAnalysis(ctx context.Context, h, id string, result json.RawMessage) error {
	tag, err := s.pool.Exec(ctx, `update assets set status='completed',analysis=$3,updated_at=now() where id=$1::uuid and household_id=$2::uuid`, id, h, result)
	if tag.RowsAffected() == 0 && err == nil {
		return ErrNotFound
	}
	return err
}

func scanJob(row pgx.Row) (Job, error) {
	var j Job
	err := row.Scan(&j.ID, &j.HouseholdID, &j.PersonID, &j.CreatedBy, &j.Kind, &j.Status, &j.Payload, &j.Result, &j.Error, &j.Attempts, &j.CreatedAt, &j.StartedAt, &j.CompletedAt)
	return j, err
}

const jobCols = `id::text,household_id::text,person_id::text,created_by::text,kind,status,payload,result,error,attempts,created_at,started_at,completed_at`

func (s *PostgresStore) CreateJob(ctx context.Context, j Job) (Job, error) {
	return scanJob(s.pool.QueryRow(ctx, `insert into jobs(id,household_id,person_id,created_by,kind,status,payload) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'queued',$6) returning `+jobCols, j.ID, j.HouseholdID, j.PersonID, j.CreatedBy, j.Kind, j.Payload))
}
func (s *PostgresStore) ListJobs(ctx context.Context, h string, person *string) ([]Job, error) {
	q := `select ` + jobCols + ` from jobs where household_id=$1::uuid`
	args := []any{h}
	if person != nil {
		q += ` and person_id=$2::uuid`
		args = append(args, *person)
	}
	q += ` order by created_at desc limit 100`
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Job{}
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}
func (s *PostgresStore) GetJob(ctx context.Context, h, id string) (Job, error) {
	j, err := scanJob(s.pool.QueryRow(ctx, `select `+jobCols+` from jobs where id=$1::uuid and household_id=$2::uuid`, id, h))
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	return j, err
}
func (s *PostgresStore) ClaimNextJob(ctx context.Context, now time.Time) (Job, error) {
	j, err := scanJob(s.pool.QueryRow(ctx, `update jobs set status='processing',started_at=$1,attempts=attempts+1,error='' where id=(select id from jobs where status='queued' order by created_at for update skip locked limit 1) returning `+jobCols, now))
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	return j, err
}
func (s *PostgresStore) CompleteJob(ctx context.Context, id string, result json.RawMessage) error {
	_, err := s.pool.Exec(ctx, `update jobs set status='completed',result=$2,error='',completed_at=now() where id=$1::uuid`, id, result)
	return err
}
func (s *PostgresStore) FailJob(ctx context.Context, id, message string) error {
	_, err := s.pool.Exec(ctx, `update jobs set status='failed',error=$2,completed_at=now() where id=$1::uuid`, id, message)
	return err
}
func (s *PostgresStore) RequeueExpiredJobs(ctx context.Context, before time.Time) error {
	_, err := s.pool.Exec(ctx, `update jobs set status='queued',started_at=null,error='worker lease expired' where status='processing' and started_at<$1`, before)
	return err
}

func scanThread(row pgx.Row) (Thread, error) {
	var t Thread
	err := row.Scan(&t.ID, &t.HouseholdID, &t.PersonID, &t.CreatedBy, &t.Title, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

const threadCols = `id::text,household_id::text,person_id::text,created_by::text,title,created_at,updated_at`

func (s *PostgresStore) CreateThread(ctx context.Context, p Principal, person *string, title string) (Thread, error) {
	return scanThread(s.pool.QueryRow(ctx, `insert into threads(household_id,person_id,created_by,title) values($1::uuid,$2::uuid,$3::uuid,$4) returning `+threadCols, p.HouseholdID, person, p.UserID, title))
}
func (s *PostgresStore) ListThreads(ctx context.Context, h string, person *string) ([]Thread, error) {
	q := `select ` + threadCols + ` from threads where household_id=$1::uuid`
	args := []any{h}
	if person != nil {
		q += ` and person_id=$2::uuid`
		args = append(args, *person)
	}
	q += ` order by updated_at desc`
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Thread{}
	for rows.Next() {
		t, err := scanThread(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
func (s *PostgresStore) GetThread(ctx context.Context, h, id string) (Thread, error) {
	t, err := scanThread(s.pool.QueryRow(ctx, `select `+threadCols+` from threads where id=$1::uuid and household_id=$2::uuid`, id, h))
	if errors.Is(err, pgx.ErrNoRows) {
		return Thread{}, ErrNotFound
	}
	return t, err
}
func (s *PostgresStore) DeleteThread(ctx context.Context, h, id string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `delete from threads where id=$1::uuid and household_id=$2::uuid`, id, h)
	return tag.RowsAffected() > 0, err
}
func scanMessage(row pgx.Row) (Message, error) {
	var m Message
	err := row.Scan(&m.ID, &m.HouseholdID, &m.ThreadID, &m.UserID, &m.Role, &m.Content, &m.Citations, &m.Status, &m.CreatedAt)
	return m, err
}

const messageCols = `id::text,household_id::text,thread_id::text,user_id::text,role,content,citations,status,created_at`

func (s *PostgresStore) CreateMessage(ctx context.Context, m Message) (Message, error) {
	out, err := scanMessage(s.pool.QueryRow(ctx, `insert into messages(household_id,thread_id,user_id,role,content,citations,status) values($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7) returning `+messageCols, m.HouseholdID, m.ThreadID, m.UserID, m.Role, m.Content, m.Citations, m.Status))
	if err == nil {
		_, _ = s.pool.Exec(ctx, `update threads set updated_at=now() where id=$1::uuid and household_id=$2::uuid`, m.ThreadID, m.HouseholdID)
	}
	return out, err
}
func (s *PostgresStore) ListMessages(ctx context.Context, h, thread string) ([]Message, error) {
	rows, err := s.pool.Query(ctx, `select `+messageCols+` from messages where household_id=$1::uuid and thread_id=$2::uuid order by created_at`, h, thread)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func mapPGError(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrConflict
	}
	return err
}
