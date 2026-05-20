package app

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/cobra"
	"go.uber.org/zap"
)

const defaultDatabaseURL = "postgres://bytedance:bytedance@localhost:5432/nomi?sslmode=disable"

type Config struct {
	Addr                      string
	DatabaseURL               string
	SeedXAPIKey               string
	ImageStorageDir           string
	SeedXCodexModel           string
	SeedXCodexReasoningEffort string
	SeedXCommandTimeout       time.Duration
	PublicBaseURL             string
}

func NewRootCommand() *cobra.Command {
	cfg := Config{
		Addr:                      envOrDefault("NOMI_SERVER_ADDR", ":8088"),
		DatabaseURL:               envOrDefault("NOMI_DATABASE_URL", defaultDatabaseURL),
		SeedXAPIKey:               envOrDefault("NOMI_SEEDX_API_KEY", ""),
		ImageStorageDir:           envOrDefault("NOMI_IMAGE_STORAGE_DIR", ".nomi/uploads"),
		SeedXCodexModel:           envOrDefault("NOMI_SEEDX_CODEX_MODEL", ""),
		SeedXCodexReasoningEffort: envOrDefault("NOMI_SEEDX_CODEX_REASONING_EFFORT", "medium"),
		SeedXCommandTimeout:       envDurationOrDefault("NOMI_SEEDX_COMMAND_TIMEOUT", 2*time.Minute),
		PublicBaseURL:             envOrDefault("NOMI_PUBLIC_BASE_URL", ""),
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
	cmd.Flags().StringVar(&cfg.SeedXAPIKey, "seedx-api-key", cfg.SeedXAPIKey, "SeedX daemon API key")
	cmd.Flags().StringVar(&cfg.ImageStorageDir, "image-storage-dir", cfg.ImageStorageDir, "Directory for uploaded image files")
	cmd.Flags().StringVar(&cfg.SeedXCodexModel, "seedx-codex-model", cfg.SeedXCodexModel, "Optional Codex model override for SeedX image analysis")
	cmd.Flags().StringVar(&cfg.SeedXCodexReasoningEffort, "seedx-codex-reasoning-effort", cfg.SeedXCodexReasoningEffort, "Codex reasoning effort for SeedX image analysis")
	cmd.Flags().DurationVar(&cfg.SeedXCommandTimeout, "seedx-command-timeout", cfg.SeedXCommandTimeout, "Timeout for SeedX image analysis commands")
	cmd.Flags().StringVar(&cfg.PublicBaseURL, "public-base-url", cfg.PublicBaseURL, "Public HTTPS base URL used for SeedX daemon image asset downloads")

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

	handler := NewHandler(
		store,
		logger,
		cfg.SeedXAPIKey,
		WithImageStorageDir(cfg.ImageStorageDir),
		WithSeedXAnalyzerOptions(SeedXImageAnalyzerOptions{
			CWD:             defaultCodexCWD(),
			Model:           cfg.SeedXCodexModel,
			ReasoningEffort: cfg.SeedXCodexReasoningEffort,
			Timeout:         cfg.SeedXCommandTimeout,
			PublicBaseURL:   cfg.PublicBaseURL,
		}),
	)
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

func envDurationOrDefault(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	if duration, err := time.ParseDuration(value); err == nil {
		return duration
	}
	if seconds, err := strconv.Atoi(value); err == nil {
		return time.Duration(seconds) * time.Second
	}
	return fallback
}
