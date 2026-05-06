# Local Infrastructure

Nomi uses local infrastructure only for development at this stage.

## Postgres

Expected local container:

```text
container: postgres17
image: postgres:17
port: 5432
user: bytedance
database: nomi
```

Create the Nomi database:

```sh
docker exec postgres17 createdb -U bytedance nomi
```

The server default development URL is:

```text
postgres://bytedance:bytedance@localhost:5432/nomi?sslmode=disable
```

This is a local-only credential. Do not reuse it for shared, staging, or production environments.
