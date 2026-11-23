package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/iFurySt/nomi/apps/sync-server/internal/syncserver"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/cobra"
)

func main() {
	if err := root().Execute(); err != nil {
		os.Exit(1)
	}
}
func root() *cobra.Command {
	cmd := &cobra.Command{Use: "nomi-sync", Short: "Nomi personal document sync service", SilenceUsage: true}
	withStore := func(run func(context.Context, *syncserver.Store) error) func(*cobra.Command, []string) error {
		return func(cmd *cobra.Command, _ []string) error {
			url := os.Getenv("NOMI_SYNC_DATABASE_URL")
			if url == "" {
				return errors.New("NOMI_SYNC_DATABASE_URL is required")
			}
			db, err := pgxpool.New(cmd.Context(), url)
			if err != nil {
				return errors.New("invalid database configuration")
			}
			defer db.Close()
			if err = db.Ping(cmd.Context()); err != nil {
				return errors.New("database unavailable")
			}
			return run(cmd.Context(), &syncserver.Store{DB: db})
		}
	}
	cmd.AddCommand(&cobra.Command{Use: "migrate", Short: "Apply explicit, checksummed database migrations", RunE: withStore(func(ctx context.Context, s *syncserver.Store) error { return s.Migrate(ctx) })})
	objectStore := func() (*syncserver.DiskObjects, error) {
		dir := os.Getenv("NOMI_SYNC_OBJECT_DIR")
		if dir == "" {
			return nil, errors.New("NOMI_SYNC_OBJECT_DIR required")
		}
		return syncserver.NewDiskObjects(dir)
	}
	cmd.AddCommand(&cobra.Command{Use: "export-objects", Short: "Stream verified immutable originals as a tar archive", RunE: withStore(func(ctx context.Context, s *syncserver.Store) error {
		objects, err := objectStore()
		if err != nil {
			return err
		}
		defer objects.Close()
		return s.ExportObjects(ctx, objects, os.Stdout)
	})})
	cmd.AddCommand(&cobra.Command{Use: "verify", Short: "Verify schema, document graph and original hashes after recovery", RunE: withStore(func(ctx context.Context, s *syncserver.Store) error {
		objects, err := objectStore()
		if err != nil {
			return err
		}
		defer objects.Close()
		report, err := s.Verify(ctx, objects)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(report)
	})})
	cmd.AddCommand(&cobra.Command{Use: "import-objects", Short: "Restore a tar stream into an EMPTY object directory", RunE: func(cmd *cobra.Command, _ []string) error {
		dir := os.Getenv("NOMI_SYNC_OBJECT_DIR")
		if dir == "" {
			return errors.New("NOMI_SYNC_OBJECT_DIR required")
		}
		entries, err := os.ReadDir(dir)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if len(entries) > 0 {
			return errors.New("restore requires an empty object directory")
		}
		objects, err := objectStore()
		if err != nil {
			return err
		}
		defer objects.Close()
		return syncserver.ImportObjects(cmd.Context(), objects, os.Stdin)
	}})
	var apply bool
	maintain := &cobra.Command{Use: "maintain", Short: "Report retained-history and log cleanup; objects are never deleted", RunE: withStore(func(ctx context.Context, s *syncserver.Store) error {
		if err := s.CheckSchema(ctx); err != nil {
			return err
		}
		report, err := s.Maintain(ctx, time.Now().UTC(), apply)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(report)
	})}
	maintain.Flags().BoolVar(&apply, "apply", false, "Prune history/log candidates (default dry-run)")
	cmd.AddCommand(maintain)
	var email string
	var stdin bool
	provision := &cobra.Command{Use: "create-user", Short: "Provision a private user (password from stdin)", RunE: withStore(func(ctx context.Context, s *syncserver.Store) error {
		if !stdin {
			return errors.New("use --password-stdin; do not put passwords in command arguments")
		}
		b, err := io.ReadAll(io.LimitReader(os.Stdin, 1024))
		if err != nil {
			return err
		}
		u, err := s.Provision(ctx, email, strings.TrimSuffix(strings.TrimSuffix(string(b), "\n"), "\r"))
		if err != nil {
			return errors.New("cannot create user: check email, password length or duplicate account")
		}
		fmt.Println("created", u.ID)
		return nil
	})}
	provision.Flags().StringVar(&email, "email", "", "Account email")
	provision.Flags().BoolVar(&stdin, "password-stdin", false, "Read password from stdin")
	cmd.AddCommand(provision)
	var addr string
	serve := &cobra.Command{Use: "serve", Short: "Serve the authenticated sync API", RunE: withStore(func(ctx context.Context, s *syncserver.Store) error {
		if err := s.CheckSchema(ctx); err != nil {
			return err
		}
		objectsDir := os.Getenv("NOMI_SYNC_OBJECT_DIR")
		if objectsDir == "" {
			return errors.New("NOMI_SYNC_OBJECT_DIR is required (persistent directory)")
		}
		objects, err := syncserver.NewDiskObjects(objectsDir)
		if err != nil {
			return err
		}
		defer objects.Close()
		srv := &http.Server{Addr: addr, Handler: (&syncserver.Server{Store: s, Objects: objects}).Handler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 16 << 10}
		ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
		defer stop()
		go func() {
			// Run once at startup and then daily; only aggregate counts are logged.
			clean := func() {
				if err := s.PurgeErasedSpaces(ctx, objects); err != nil {
					fmt.Fprintln(os.Stderr, "object erasure retry failed")
				}
				report, err := s.Maintain(ctx, time.Now().UTC(), true)
				if err != nil {
					fmt.Fprintln(os.Stderr, "sync maintenance failed")
					return
				}
				if report.History+report.Changes > 0 {
					_ = json.NewEncoder(os.Stdout).Encode(report)
				}
			}
			clean()
			ticker := time.NewTicker(24 * time.Hour)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					clean()
				}
			}
		}()
		done := make(chan error, 1)
		go func() { done <- srv.ListenAndServe() }()
		fmt.Println("Nomi sync listening on", addr)
		select {
		case err := <-done:
			return err
		case <-ctx.Done():
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			return srv.Shutdown(shutdown)
		}
	})}
	serve.Flags().StringVar(&addr, "addr", "127.0.0.1:8089", "Listen address; use HTTPS reverse proxy for remote access")
	cmd.AddCommand(serve)
	return cmd
}
