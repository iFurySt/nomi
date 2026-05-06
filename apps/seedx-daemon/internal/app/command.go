package app

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"go.uber.org/zap"
)

type Config struct {
	ServerURL string
	Once      bool
}

func NewRootCommand() *cobra.Command {
	cfg := Config{
		ServerURL: envOrDefault("NOMI_SEEDX_WS_URL", "ws://localhost:8088/seedx/ws"),
	}

	cmd := &cobra.Command{
		Use:   "nomi-seedx-daemon",
		Short: "Run the local Nomi SeedX daemon",
		RunE: func(cmd *cobra.Command, args []string) error {
			return run(cmd.Context(), cfg)
		},
	}

	cmd.Flags().StringVar(&cfg.ServerURL, "server-url", cfg.ServerURL, "Server websocket URL")
	cmd.Flags().BoolVar(&cfg.Once, "once", false, "Run one websocket exchange and exit")

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

	for {
		if err := RunExchange(ctx, cfg.ServerURL, logger); err != nil {
			if cfg.Once {
				return err
			}
			logger.Warn("seedx websocket exchange failed", zap.Error(err))
		} else if cfg.Once {
			return nil
		}

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(2 * time.Second):
		}
	}
}

func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}
