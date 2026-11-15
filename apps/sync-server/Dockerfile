FROM golang:1.26.1-alpine AS build
WORKDIR /src
COPY apps/sync-server/go.mod apps/sync-server/go.sum ./
RUN go mod download
COPY apps/sync-server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /nomi-sync ./cmd/nomi-sync
FROM alpine:3.23
RUN apk add --no-cache ca-certificates && addgroup -g 10001 nomi && adduser -D -u 10001 -G nomi nomi && mkdir -p /data/objects && chown -R nomi:nomi /data
COPY --from=build /nomi-sync /usr/local/bin/nomi-sync
USER 10001:10001
ENTRYPOINT ["nomi-sync"]
