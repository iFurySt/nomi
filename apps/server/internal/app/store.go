package app

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

func (s *PostgresStore) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

func (s *PostgresStore) EnsureSchema(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
create extension if not exists pgcrypto;

create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('food', 'body_stats', 'document', 'note')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  source text not null,
  title text not null,
  summary text not null,
  raw_text text not null default '',
  image_uri text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  confidence double precision
);

create index if not exists records_occurred_at_idx on records (occurred_at desc);
create index if not exists records_type_idx on records (type);
`)
	return err
}

func (s *PostgresStore) ListRecords(ctx context.Context) ([]Record, error) {
	rows, err := s.pool.Query(ctx, `
select id::text, type, occurred_at, created_at, source, title, summary, raw_text, image_uri, metadata, confidence
from records
order by occurred_at desc, created_at desc
limit 100
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]Record, 0)
	for rows.Next() {
		var record Record
		if err := rows.Scan(
			&record.ID,
			&record.Type,
			&record.OccurredAt,
			&record.CreatedAt,
			&record.Source,
			&record.Title,
			&record.Summary,
			&record.RawText,
			&record.ImageURI,
			&record.Metadata,
			&record.Confidence,
		); err != nil {
			return nil, err
		}
		records = append(records, record)
	}

	return records, rows.Err()
}

func (s *PostgresStore) CreateRecord(ctx context.Context, input CreateRecordInput) (Record, error) {
	occurredAt := time.Now()
	if input.OccurredAt != nil {
		occurredAt = *input.OccurredAt
	}
	if input.Metadata == nil {
		input.Metadata = map[string]string{}
	}

	var record Record
	err := s.pool.QueryRow(ctx, `
insert into records (type, occurred_at, source, title, summary, raw_text, image_uri, metadata, confidence)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning id::text, type, occurred_at, created_at, source, title, summary, raw_text, image_uri, metadata, confidence
`,
		input.Type,
		occurredAt,
		input.Source,
		input.Title,
		input.Summary,
		input.RawText,
		input.ImageURI,
		input.Metadata,
		input.Confidence,
	).Scan(
		&record.ID,
		&record.Type,
		&record.OccurredAt,
		&record.CreatedAt,
		&record.Source,
		&record.Title,
		&record.Summary,
		&record.RawText,
		&record.ImageURI,
		&record.Metadata,
		&record.Confidence,
	)
	return record, err
}
