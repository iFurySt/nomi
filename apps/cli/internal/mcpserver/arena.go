package mcpserver

import (
	"context"
	"encoding/json"
	"errors"
	"slices"

	"github.com/ifuryst/nomi/apps/cli/internal/arena"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var ArenaTools = []string{"arena_get_portfolio_state", "arena_preview_rebalance", "arena_submit_decision", "arena_list_orders", "arena_get_performance"}

type ArenaInput struct {
	Targets    []arena.Target `json:"targets,omitempty"`
	Action     string         `json:"action,omitempty"`
	ProposalID string         `json:"proposalId,omitempty"`
	Thesis     string         `json:"thesis,omitempty"`
	Evidence   []string       `json:"evidence,omitempty"`
	Offset     int            `json:"offset,omitempty"`
	Limit      int            `json:"limit,omitempty"`
}

func ArenaSchema(name string) map[string]any {
	p := map[string]any{}
	required := []string{}
	if name == "arena_preview_rebalance" {
		p["targets"] = map[string]any{"type": "array", "maxItems": 12, "items": map[string]any{"type": "object", "properties": map[string]any{"symbol": map[string]any{"type": "string", "maxLength": 8}, "weightBps": map[string]any{"type": "integer", "minimum": 0, "maximum": 10000}}, "required": []string{"symbol", "weightBps"}, "additionalProperties": false}}
		required = append(required, "targets")
	}
	if name == "arena_submit_decision" {
		p["action"] = map[string]any{"type": "string", "enum": []string{"hold", "rebalance"}}
		p["proposalId"] = map[string]any{"type": "string", "maxLength": 40}
		p["thesis"] = map[string]any{"type": "string", "minLength": 8, "maxLength": 2000, "description": "Short public investment thesis and risks, not private reasoning"}
		p["evidence"] = map[string]any{"type": "array", "maxItems": 10, "items": map[string]any{"type": "string", "maxLength": 300}}
		required = []string{"action", "thesis"}
	}
	if name == "arena_list_orders" || name == "arena_get_performance" {
		p["offset"] = map[string]any{"type": "integer", "minimum": 0, "maximum": 10000}
		p["limit"] = map[string]any{"type": "integer", "minimum": 1, "maximum": 50}
	}
	return map[string]any{"type": "object", "properties": p, "required": required, "additionalProperties": false}
}

var arenaDescriptions = map[string]string{
	"arena_get_portfolio_state": "Read your bound virtual stock account, current SYNTHETIC quotes, positions, rules and latest decision. Start here. Real company research is context only; these fictional prices are not live market prices. You cannot change the clock or top up capital.",
	"arena_preview_rebalance":   "Validate long-only target portfolio weights (integer basis points, sum <=10000; remainder cash). Omitted symbols target zero. Persist a preview ID required for submission. Estimates use current synthetic quotes; actual fills occur at the NEXT simulated step with spread, fees and a reserve. Does not trade.",
	"arena_submit_decision":     "Commit exactly one virtual decision per bound session: hold or rebalance with the current preview ID. Include a short public thesis/risks and optional returned evidence IDs/public HTTPS links without queries. Identical retries are safe. Receipt is an accepted intent, NOT a fill: coordinator settles once at the next simulated step, even if the model then disconnects. No real money or brokerage.",
	"arena_list_orders":         "Read paginated virtual fills (newest first) for this account. No real orders. limit defaults 20, max50.",
	"arena_get_performance":     "Read virtual NAV, P&L, fees, drawdown and paginated NAV/benchmark marks (newest first). Equal-weight synthetic benchmark excludes transaction costs. This is a functional simulation, not a historical backtest or profitability estimate.",
}

func AddArena(server *mcp.Server, s *arena.Service, episodeID, runID string) {
	no := false
	for _, name := range ArenaTools {
		read := name != "arena_preview_rebalance" && name != "arena_submit_decision"
		mcp.AddTool(server, &mcp.Tool{Name: name, Description: arenaDescriptions[name], InputSchema: ArenaSchema(name), Annotations: &mcp.ToolAnnotations{ReadOnlyHint: read, IdempotentHint: true, DestructiveHint: &no, OpenWorldHint: &no}}, func(ctx context.Context, _ *mcp.CallToolRequest, in ArenaInput) (*mcp.CallToolResult, map[string]any, error) {
			out, err := CallArena(ctx, s, episodeID, runID, name, in)
			return nil, out, err
		})
	}
}
func CallArena(ctx context.Context, s *arena.Service, episodeID, runID, name string, in ArenaInput) (map[string]any, error) {
	e, err := s.Repo.Load(ctx, episodeID)
	if err != nil {
		return nil, err
	}
	if e.Run == nil || e.Run.ID != runID {
		return nil, errors.New("RUN_MISMATCH: Server is scoped to another session")
	}
	out := map[string]any{}
	switch name {
	case "arena_get_portfolio_state":
		out = e.Snapshot()
		out["sessionStatus"] = e.Run.Status
		if n := len(e.Decisions); n > 0 {
			d := e.Decisions[n-1]
			out["lastDecision"] = map[string]any{"day": d.Day, "action": d.Action, "thesis": d.Thesis, "status": d.Status}
		}
	case "arena_preview_rebalance":
		e, err = s.Preview(ctx, episodeID, runID, in.Targets)
		if err == nil {
			out = e.PreviewProjection()
		}
	case "arena_submit_decision":
		e, err = s.Submit(ctx, episodeID, runID, arena.Submission{Action: in.Action, ProposalID: in.ProposalID, Thesis: in.Thesis, Evidence: in.Evidence})
		if err == nil {
			out = map[string]any{"decisionId": e.Run.Intent.ID, "status": e.Run.Status, "action": e.Run.Intent.Action, "settlement": "coordinator settles exactly once at next simulated step"}
		}
	case "arena_list_orders", "arena_get_performance":
		if in.Offset < 0 || in.Offset > 10000 || in.Limit < 0 || in.Limit > 50 {
			return nil, errors.New("INVALID_PAGE: offset 0..10000, limit 1..50")
		}
		limit := in.Limit
		if limit == 0 {
			limit = 20
		}
		if name == "arena_list_orders" {
			rows := slices.Clone(e.Fills)
			slices.Reverse(rows)
			start := min(in.Offset, len(rows))
			end := min(start+limit, len(rows))
			out = map[string]any{"fills": rows[start:end], "total": len(rows), "nextOffset": end, "hasMore": end < len(rows)}
		} else {
			rows := slices.Clone(e.Marks)
			slices.Reverse(rows)
			start := min(in.Offset, len(rows))
			end := min(start+limit, len(rows))
			out = e.Performance()
			out["marks"] = rows[start:end]
			out["nextOffset"] = end
			out["hasMore"] = end < len(rows)
		}
	default:
		return nil, errors.New("UNKNOWN_TOOL: Invalid arena tool")
	}
	if err != nil {
		return nil, err
	}
	b, err := json.Marshal(out)
	if err != nil || len(b)*3+512 > 48*1024 {
		return nil, errors.New("RESPONSE_BUDGET_EXCEEDED: Reduce limit")
	}
	return out, nil
}
