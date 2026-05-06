package app

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/cobra"
	"go.uber.org/zap"
)

const defaultDatabaseURL = "postgres://bytedance:bytedance@localhost:5432/nomi?sslmode=disable"

type Config struct {
	Addr        string
	DatabaseURL string
}

func NewRootCommand() *cobra.Command {
	cfg := Config{
		Addr:        envOrDefault("NOMI_SERVER_ADDR", ":8088"),
		DatabaseURL: envOrDefault("NOMI_DATABASE_URL", defaultDatabaseURL),
	}

	cmd := &cobra.Command{
		Use:   "nomi-server",
		Short: "Run the Nomi API server",
		RunE: func(cmd *cobra.Command, args []string) error {
			return run(cmd.Context(), cfg)
		},
	}

	cmd.Flags().StringVar(&cfg.Addr, "addr", cfg.Addr, "HTTP listen address")
	cmd.Flags().StringVar(&cfg.DatabaseURL, "database-url", cfg.DatabaseURL, "Postgres connection URL")

	return cmd
}

func run(ctx context.Context, cfg Config) error {
	logger, err := zap.NewDevelopment()
	if err != nil {
		return err
	}
	defer func() {
		_ = logger.Sync()
	}()

	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return err
	}

	store := NewPostgresStore(pool)
	if err := store.EnsureSchema(ctx); err != nil {
		return err
	}

	handler := NewHandler(store, logger)
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("nomi server listening", zap.String("addr", cfg.Addr))
		errCh <- server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}
