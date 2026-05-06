# Nomi Server

Go API skeleton for Nomi / 知己. It owns record persistence, mock Ask responses, and later websocket coordination with the local SeedX daemon.

## Local Setup

The default development database is:

```text
postgres://bytedance:bytedance@localhost:5432/nomi?sslmode=disable
```

Create the database in the existing local Postgres container:

```sh
docker exec postgres17 createdb -U bytedance nomi
```

The command is idempotent enough for local use if the database already exists.

## Run

```sh
go test ./...
go run ./cmd/nomi-server --addr :8088
```

## Smoke

```sh
curl -s http://localhost:8088/health

curl -s http://localhost:8088/records \
  -H 'Content-Type: application/json' \
  -d '{"type":"food","source":"manual","title":"Lunch","summary":"Rice bowl","metadata":{"protein":"28 g"}}'
```

## Boundaries

The server returns mock Ask answers for now. Medical diagnosis, treatment, medication, dosage, emergency, disease risk, and abnormality language is blocked with non-medical boundary copy.
