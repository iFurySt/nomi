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
  status text not null default 'completed' check (status in ('pending', 'processing', 'completed', 'failed')),
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

alter table records add column if not exists status text not null default 'completed';
alter table records drop constraint if exists records_status_check;
alter table records add constraint records_status_check check (status in ('pending', 'processing', 'completed', 'failed'));
update records set status = 'completed' where status is null or status = '';

create index if not exists records_occurred_at_idx on records (occurred_at desc);
create index if not exists records_type_idx on records (type);
create index if not exists records_status_idx on records (status);
`)
	return err
}

func (s *PostgresStore) ListRecords(ctx context.Context) ([]Record, error) {
	rows, err := s.pool.Query(ctx, `
select id::text, type, status, occurred_at, created_at, source, title, summary, raw_text, image_uri, metadata, confidence
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
			&record.Status,
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
	status := input.Status
	if status == "" {
		status = RecordStatusCompleted
	}

	var record Record
	err := s.pool.QueryRow(ctx, `
insert into records (type, status, occurred_at, source, title, summary, raw_text, image_uri, metadata, confidence)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning id::text, type, status, occurred_at, created_at, source, title, summary, raw_text, image_uri, metadata, confidence
`,
		input.Type,
		status,
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
		&record.Status,
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

func (s *PostgresStore) DeleteRecord(ctx context.Context, id string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
delete from records
where id::text = $1
`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *PostgresStore) UpdateRecordStatus(ctx context.Context, id string, status string, metadata map[string]string) (Record, error) {
	if metadata == nil {
		metadata = map[string]string{}
	}

	var record Record
	err := s.pool.QueryRow(ctx, `
update records
set status = $2,
    metadata = metadata || $3::jsonb
where id = $1::uuid
returning id::text, type, status, occurred_at, created_at, source, title, summary, raw_text, image_uri, metadata, confidence
`, id, status, metadata).Scan(
		&record.ID,
		&record.Type,
		&record.Status,
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

func (s *PostgresStore) CompleteRecordWithExtraction(ctx context.Context, id string, extraction ImageExtraction, image StoredImage) (Record, error) {
	confidence := extraction.Confidence
	metadata := extractionRecordMetadata(extraction, image)

	var record Record
	err := s.pool.QueryRow(ctx, `
update records
set type = $2,
    status = $3,
    title = $4,
    summary = $5,
    raw_text = $6,
    image_uri = $7,
    metadata = $8,
    confidence = $9
where id = $1::uuid
returning id::text, type, status, occurred_at, created_at, source, title, summary, raw_text, image_uri, metadata, confidence
`,
		id,
		recordTypeForInputCategory(extraction.InputCategory),
		RecordStatusCompleted,
		extraction.Title,
		extractionSummary(extraction),
		extraction.Summary,
		image.URI,
		metadata,
		confidence,
	).Scan(
		&record.ID,
		&record.Type,
		&record.Status,
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
