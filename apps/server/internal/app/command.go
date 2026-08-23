package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
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
	DataRoot                  string
	AgentWorkspaceRoot        string
	BootstrapInviteCode       string
	AssetSigningKey           string
	SessionDuration           time.Duration
	SeedXCodexModel           string
	SeedXCodexReasoningEffort string
	SeedXCommandTimeout       time.Duration
	JobPollInterval           time.Duration
}

func NewRootCommand() *cobra.Command {
	dataRoot := envOrDefault("NOMI_DATA_ROOT", ".nomi/data")
	cfg := Config{
		Addr:                      envOrDefault("NOMI_SERVER_ADDR", ":8088"),
		DatabaseURL:               envOrDefault("NOMI_DATABASE_URL", defaultDatabaseURL),
		SeedXAPIKey:               envOrDefault("NOMI_SEEDX_API_KEY", "dev_seedx_key"),
		DataRoot:                  dataRoot,
		AgentWorkspaceRoot:        envOrDefault("NOMI_AGENT_WORKSPACE_ROOT", filepath.Join(dataRoot, "workspaces")),
		BootstrapInviteCode:       envOrDefault("NOMI_BOOTSTRAP_INVITE_CODE", "dev-nomi-family"),
		AssetSigningKey:           envOrDefault("NOMI_ASSET_SIGNING_KEY", "dev-nomi-asset-signing-key"),
		SessionDuration:           envDurationOrDefault("NOMI_SESSION_DURATION", 30*24*time.Hour),
		SeedXCodexModel:           envOrDefault("NOMI_SEEDX_CODEX_MODEL", ""),
		SeedXCodexReasoningEffort: envOrDefault("NOMI_SEEDX_CODEX_REASONING_EFFORT", "low"),
		SeedXCommandTimeout:       envDurationOrDefault("NOMI_SEEDX_COMMAND_TIMEOUT", 5*time.Minute),
		JobPollInterval:           envDurationOrDefault("NOMI_JOB_POLL_INTERVAL", 750*time.Millisecond),
	}
	cmd := &cobra.Command{Use: "nomi-server", Short: "Run the Nomi family health API server", RunE: func(cmd *cobra.Command, args []string) error { return run(cmd.Context(), cfg) }}
	cmd.Flags().StringVar(&cfg.Addr, "addr", cfg.Addr, "HTTP listen address")
	cmd.Flags().StringVar(&cfg.DatabaseURL, "database-url", cfg.DatabaseURL, "Postgres connection URL")
	cmd.Flags().StringVar(&cfg.SeedXAPIKey, "seedx-api-key", cfg.SeedXAPIKey, "SeedX daemon API key")
	cmd.Flags().StringVar(&cfg.DataRoot, "data-root", cfg.DataRoot, "Container data root for assets and workspaces")
	cmd.Flags().StringVar(&cfg.AgentWorkspaceRoot, "agent-workspace-root", cfg.AgentWorkspaceRoot, "Workspace root visible to SeedX/Codex")
	cmd.Flags().StringVar(&cfg.BootstrapInviteCode, "bootstrap-invite-code", cfg.BootstrapInviteCode, "Private beta bootstrap invitation code")
	cmd.Flags().StringVar(&cfg.AssetSigningKey, "asset-signing-key", cfg.AssetSigningKey, "HMAC key for scoped Agent asset links")
	cmd.Flags().DurationVar(&cfg.SessionDuration, "session-duration", cfg.SessionDuration, "User session duration")
	cmd.Flags().StringVar(&cfg.SeedXCodexModel, "seedx-codex-model", cfg.SeedXCodexModel, "Optional Codex model override")
	cmd.Flags().StringVar(&cfg.SeedXCodexReasoningEffort, "seedx-codex-reasoning-effort", cfg.SeedXCodexReasoningEffort, "Codex reasoning effort")
	cmd.Flags().DurationVar(&cfg.SeedXCommandTimeout, "seedx-command-timeout", cfg.SeedXCommandTimeout, "Agent job timeout")
	cmd.Flags().DurationVar(&cfg.JobPollInterval, "job-poll-interval", cfg.JobPollInterval, "Persistent job queue poll interval")
	cmd.AddCommand(newProvisionReviewHouseholdCommand(&cfg))
	cmd.AddCommand(newImportLegacyWorkspaceCommand(&cfg))
	return cmd
}

type reviewCredentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func newProvisionReviewHouseholdCommand(cfg *Config) *cobra.Command {
	var email, displayName, householdName, credentialsFile string
	cmd := &cobra.Command{
		Use:   "provision-review-household",
		Short: "Create an isolated App Review household and write its generated credentials",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if credentialsFile == "" {
				return errors.New("credentials-file is required")
			}
			email = normalizeEmail(email)
			displayName = normalizeDisplayName(displayName)
			householdName = strings.TrimSpace(householdName)
			if email == "" || !strings.Contains(email, "@") || displayName == "" || householdName == "" {
				return errors.New("email, display-name and household-name are required")
			}
			password, err := randomToken(24)
			if err != nil {
				return err
			}
			passwordHash, err := hashPassword(password)
			if err != nil {
				return err
			}
			temporaryCredentials, err := prepareReviewCredentials(credentialsFile, reviewCredentials{Email: email, Password: password})
			if err != nil {
				return err
			}
			pool, err := pgxpool.New(cmd.Context(), cfg.DatabaseURL)
			if err != nil {
				_ = os.Remove(temporaryCredentials)
				return err
			}
			defer pool.Close()
			if err = pool.Ping(cmd.Context()); err != nil {
				_ = os.Remove(temporaryCredentials)
				return err
			}
			store := NewPostgresStore(pool)
			if err = store.EnsureSchema(cmd.Context()); err != nil {
				_ = os.Remove(temporaryCredentials)
				return err
			}
			identity, err := store.ProvisionIsolatedOwner(cmd.Context(), email, passwordHash, displayName, householdName)
			if err != nil {
				_ = os.Remove(temporaryCredentials)
				return err
			}
			if err = os.Rename(temporaryCredentials, credentialsFile); err != nil {
				return fmt.Errorf("review household created but credential activation failed; recover %s: %w", temporaryCredentials, err)
			}
			fmt.Fprintf(cmd.OutOrStdout(), "created isolated review household %s; credentials written to %s\n", identity.Household.ID, credentialsFile)
			return nil
		},
	}
	cmd.Flags().StringVar(&email, "email", "app-review@nomi.ifuryst.com", "Review account email")
	cmd.Flags().StringVar(&displayName, "display-name", "App Review", "Review account display name")
	cmd.Flags().StringVar(&householdName, "household-name", "Nomi Review Demo", "Isolated review household name")
	cmd.Flags().StringVar(&credentialsFile, "credentials-file", "", "Path for generated credentials (created with mode 0600)")
	return cmd
}

func prepareReviewCredentials(path string, credentials reviewCredentials) (string, error) {
	if _, err := os.Stat(path); err == nil {
		return "", fmt.Errorf("credentials file already exists: %s", path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", err
	}
	contents, err := json.MarshalIndent(credentials, "", "  ")
	if err != nil {
		return "", err
	}
	file, err := os.CreateTemp(directory, ".nomi-review-*.tmp")
	if err != nil {
		return "", err
	}
	temporary := file.Name()
	cleanup := func() {
		_ = file.Close()
		_ = os.Remove(temporary)
	}
	if err = file.Chmod(0o600); err != nil {
		cleanup()
		return "", err
	}
	if _, err = file.Write(append(contents, '\n')); err != nil {
		cleanup()
		return "", err
	}
	if err = file.Sync(); err != nil {
		cleanup()
		return "", err
	}
	if err = file.Close(); err != nil {
		_ = os.Remove(temporary)
		return "", err
	}
	return temporary, nil
}

func run(ctx context.Context, cfg Config) error {
	logger, err := zap.NewProduction()
	if err != nil {
		return err
	}
	defer logger.Sync()
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err = pool.Ping(ctx); err != nil {
		return err
	}
	store := NewPostgresStore(pool)
	if err = store.EnsureSchema(ctx); err != nil {
		return err
	}
	storage := NewFSStorage(filepath.Join(cfg.DataRoot, "assets"))
	handler := NewHandler(store, logger, cfg.SeedXAPIKey, WithStorage(storage), WithAuthConfig(cfg.BootstrapInviteCode, cfg.AssetSigningKey, cfg.SessionDuration))
	workspace := NewWorkspaceManager(filepath.Join(cfg.DataRoot, "workspaces"), cfg.AgentWorkspaceRoot, storage)
	runner := NewSeedXAgentRunner(handler.seedX, cfg.SeedXCodexModel, cfg.SeedXCodexReasoningEffort, cfg.SeedXCommandTimeout)
	worker := NewJobWorker(store, workspace, runner, logger, cfg.JobPollInterval)
	go worker.Run(ctx)
	server := &http.Server{Addr: cfg.Addr, Handler: handler.Routes(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 70 * time.Second, WriteTimeout: 10 * time.Minute, IdleTimeout: 60 * time.Second}
	errCh := make(chan error, 1)
	go func() {
		logger.Info("nomi server listening", zap.String("addr", cfg.Addr))
		errCh <- server.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err = <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func envOrDefault(key, fallback string) string {
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
