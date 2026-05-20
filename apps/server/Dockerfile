# syntax=docker/dockerfile:1

FROM golang:1.26.1-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/nomi-server ./cmd/nomi-server

FROM alpine:3.22

RUN apk add --no-cache ca-certificates wget \
    && adduser -D -H -u 10001 nomi \
    && mkdir -p /var/lib/nomi/uploads \
    && chown -R nomi:nomi /var/lib/nomi

COPY --from=build /out/nomi-server /usr/local/bin/nomi-server

USER nomi
EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8088/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/nomi-server"]
