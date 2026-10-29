package command

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"github.com/ifuryst/nomi/apps/cli/internal/arena"
	arenasqlite "github.com/ifuryst/nomi/apps/cli/internal/arena/sqlite"
	"github.com/ifuryst/nomi/apps/cli/internal/mcpserver"
	"github.com/ifuryst/nomi/apps/cli/internal/query"
	querysqlite "github.com/ifuryst/nomi/apps/cli/internal/query/sqlite"
	"github.com/spf13/cobra"
)

// lazyReader recovers after a collector creates a missing database, without ever
// initializing it itself. It is separate from the migrating writer's lifecycle.
type lazyReader struct {
	mu     sync.Mutex
	dir    string
	reader *querysqlite.Reader
}

func (r *lazyReader) read(ctx context.Context, tool string, in query.Input, offset, limit int) (query.Page, error) {
	r.mu.Lock()
	var openErr error
	if r.reader == nil {
		r.reader, openErr = querysqlite.Open(ctx, r.dir)
	}
	reader := r.reader
	r.mu.Unlock()
	if reader == nil {
		if ctx.Err() != nil {
			return query.Page{}, query.StoreError(ctx.Err())
		}
		if tool == "describe_data" {
			rows := query.Catalog()
			rows[0]["storeState"] = "unavailable"
			var typed *query.Error
			if errors.As(openErr, &typed) {
				rows[0]["setupCode"] = typed.Code
			}
			return query.Page{ViewID: strings.Repeat("0", 64), Rows: rows, Warnings: []string{"Open Nomi and collect datasets; MCP never creates or migrates storage"}}, nil
		}
		return query.Page{}, openErr
	}
	return query.Read(ctx, reader, tool, in, offset, limit)
}
func (r *lazyReader) close() {
	if r.reader != nil {
		r.reader.Close()
	}
}
func researchReader(dir string) (*lazyReader, error) {
	if dir == "" {
		base, e := os.UserConfigDir()
		if e != nil {
			return nil, e
		}
		dir = filepath.Join(base, "nomi", "data")
	}
	return &lazyReader{dir: dir}, nil
}
func newQueryCommand(dataDir *string) *cobra.Command {
	var raw string
	cmd := &cobra.Command{Use: "query TOOL", Short: "Read bounded local research as JSON (same contract as MCP)", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		if len(raw) > 65536 {
			return query.Fail("INVALID_QUERY", "Request exceeds 64 KiB")
		}
		var fields map[string]json.RawMessage
		if json.Unmarshal([]byte(raw), &fields) != nil || fields == nil {
			return query.Fail("INVALID_QUERY", "Expected a request object")
		}
		for key := range fields {
			if !slices.Contains(query.Fields(args[0]), key) {
				return query.Fail("INVALID_QUERY", "Unsupported field "+key)
			}
		}
		var in query.Input
		decoder := json.NewDecoder(io.LimitReader(strings.NewReader(raw), 65537))
		decoder.DisallowUnknownFields()
		if e := decoder.Decode(&in); e != nil {
			return query.Fail("INVALID_QUERY", "Invalid request JSON")
		}
		if e := decoder.Decode(new(any)); e != io.EOF {
			return query.Fail("INVALID_QUERY", "Expected one request object")
		}
		r, e := researchReader(*dataDir)
		if e != nil {
			return e
		}
		defer r.close()
		out, e := (&query.Service{Repo: r}).Call(cmd.Context(), args[0], in)
		if e != nil {
			return e
		}
		return json.NewEncoder(cmd.OutOrStdout()).Encode(out)
	}}
	cmd.Flags().StringVar(&raw, "request", "{}", "Tool arguments as a JSON object")
	return cmd
}
func newMCPCommand(dataDir *string) *cobra.Command {
	var profile, episodeID, runID string
	root := &cobra.Command{Use: "mcp", Short: "Standard Model Context Protocol server"}
	serve := &cobra.Command{Use: "serve", Short: "Serve bounded local research over stdio", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		if profile != "research" && profile != "arena" {
			return query.Fail("INVALID_QUERY", "Use research or arena profile")
		}
		r, e := researchReader(*dataDir)
		if e != nil {
			return e
		}
		defer r.close()
		server := mcpserver.New(&query.Service{Repo: r})
		if profile == "arena" {
			if episodeID == "" || runID == "" {
				return errors.New("Arena requires bound --episode and --run")
			}
			ledger, err := arenasqlite.Open(cmd.Context(), r.dir)
			if err != nil {
				return err
			}
			defer ledger.Close()
			state, err := ledger.Load(cmd.Context(), episodeID)
			if err != nil {
				return err
			}
			if state.Run == nil || state.Run.ID != runID {
				return errors.New("RUN_MISMATCH: Session scope invalid")
			}
			mcpserver.AddArena(server, &arena.Service{Repo: ledger}, episodeID, runID)
		}
		return mcpserver.ServeServer(cmd.Context(), server, cmd.InOrStdin(), cmd.OutOrStdout())
	}}
	serve.Flags().StringVar(&profile, "profile", "research", "Capability profile (research or arena)")
	serve.Flags().StringVar(&episodeID, "episode", "", "Bound arena episode ID")
	serve.Flags().StringVar(&runID, "run", "", "Bound arena session ID")
	root.AddCommand(serve)
	return root
}

func (r *lazyReader) Describe(ctx context.Context, in query.Input, offset, limit int) (query.Page, error) {
	return r.read(ctx, "describe_data", in, offset, limit)
}

func (r *lazyReader) SearchInstruments(ctx context.Context, in query.Input, offset, limit int) (query.Page, error) {
	return r.read(ctx, "search_instruments", in, offset, limit)
}

func (r *lazyReader) CompanyOverview(ctx context.Context, in query.Input, offset, limit int) (query.Page, error) {
	return r.read(ctx, "get_company_overview", in, offset, limit)
}

func (r *lazyReader) Financials(ctx context.Context, in query.Input, offset, limit int) (query.Page, error) {
	return r.read(ctx, "query_financials", in, offset, limit)
}

func (r *lazyReader) Prices(ctx context.Context, in query.Input, offset, limit int) (query.Page, error) {
	return r.read(ctx, "query_prices", in, offset, limit)
}

func (r *lazyReader) Disclosures(ctx context.Context, in query.Input, offset, limit int) (query.Page, error) {
	return r.read(ctx, "query_disclosures", in, offset, limit)
}

func (r *lazyReader) Ownership(ctx context.Context, in query.Input, offset, limit int) (query.Page, error) {
	return r.read(ctx, "query_ownership", in, offset, limit)
}

func (r *lazyReader) Evidence(ctx context.Context, in query.Input, offset, limit int) (query.Page, error) {
	return r.read(ctx, "read_evidence", in, offset, limit)
}
