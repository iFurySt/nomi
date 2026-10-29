# Nomi 本地数据 CLI

从 AIFi 迁入的桌面依赖，当前保留金融研究、SQLite、MCP 与虚拟 Arena。它与 `apps/server` 的家庭资料 HTTP 服务独立。整体定位和运行边界见 [桌面说明](../../docs/DESKTOP.md)。本文件下方为迁入 CLI 的现有命令参考。

# Local Data CLI

The first live collector imports Nasdaq Trader's official symbol-directory files
into SQLite. It needs no provider key. Research collectors also support Massive prices/profiles/actions,
SEC filings/facts/insiders and optional FMP activity datasets. The app-owned service
manages their independent scheduling/settings through private stdio.

Requires Go 1.26.1+ (module version), alongside the existing Node/pnpm toolchain.
Cobra and the CGO-free modernc SQLite driver are pinned in go.mod/go.sum.

From the repository root:

```sh
make check-go                     # vet, race tests, pure-Go build -> bin/nomi
./bin/nomi data directory sync
./bin/nomi data directory status
./bin/nomi data directory list --query AAPL
./bin/nomi data directory list --query Microsoft --limit 20 --offset 0
./bin/nomi data directory list --scope all --limit 200
```

Without a build, run `go run ./cmd/nomi data directory sync` inside apps/cli.
Every command prints JSON; failures print an error to stderr and exit nonzero.
`list` and `status` make no network requests. An empty store reports no snapshot.

## Storage And Configuration

`--data-dir /absolute/path` overrides `NOMI_DATA_DIR`. Otherwise the default is
`os.UserConfigDir()/nomi/data` (the OS user's configuration directory).
The store is `nomi.sqlite`, with SQLite WAL/SHM sidecars. New directories use
0700 and the DB 0600 where the OS supports Unix modes. Directory collection needs no credentials. Optional research credentials are encrypted
at rest by the app host; Go decrypts them only inside collector memory. Stores/source responses must stay outside tracked repository files.

The directory schema stores immutable source bytes/hashes, directory snapshots,
source metadata, listing IDs, per-snapshot memberships/aliases, and sync runs.
These two small directory blobs are stored directly in SQLite; larger future
price/filing payloads may use the pipeline's separate compressed blob store.

## Data Semantics

Both official files are downloaded and validated before the head snapshot can
change. All rows and original fields/symbol conventions are retained. Default
`candidates` excludes test issues and ETFs, but is not a verified common-stock
universe. Remaining `securityType` is `unknown`; no name heuristic invents type,
CIK, FIGI, company identity, exchange MIC, or historical alias continuity.
Use `--scope all` to inspect ETFs/test rows as well.

Listing IDs persist for a source/symbol/exchange key. Membership history preserves
absence/reappearance; absence does not prove delisting, and ticker reuse/renames
need later enrichment. Original ACT/CQS/NASDAQ aliases remain distinct.
The provider creation marker is a raw, timezone-unspecified string; `fetchedAt`
is an actual UTC timestamp. Repeated identical source hashes reuse the snapshot;
recent sync runs record successful checks even if source content did not change.

## App-Owned Scheduler

`nomi service` runs the private stdio scheduler used by local app hosts. Startup
checks due work; default automatic frequency is 24 hours, adjustable 1–720 hours.
Settings, revision conflicts, requests and sync outcomes persist in SQLite v4;
v1 directory data is migrated in place. A disabled source also prevents CLI sync.
`--offline` keeps settings/cache available without network collection.

Manual work can run with automation paused. The worker checks every 30 seconds,
reacts to configuration changes, and catches up after wake. Failed overdue work
backs off 15/30/60 minutes. Stdin EOF/cancellation ends the process and preserves
unfinished manual requests. There is no always-on OS background service.

See [service contracts](https://github.com/iFurySt/aifi/blob/main/docs/design-docs/app-data-service.md).

## Failure And Concurrency

- At most two sequential source requests per sync, 30 seconds per HTTP request,
  8 MiB per file, and a two-minute overall sync context. No retry storm or polling.
- HTTPS redirects are restricted to the official Nasdaq Trader hosts.
- Reject malformed headers/rows/flags/creation trailers, duplicates, HTML errors,
  oversized/truncated downloads, older source generations, and directory shrink
  greater than 50%. An alphabetic new exchange code is retained without guessing
  its meaning. The current legacy otherlisted trailer is supported.
- Snapshot/source/membership/head writes are one SQLite transaction; failure or
  cancellation retains the last good head. Raw bytes are revalidated before write.
- A persisted three-minute sync lease prevents concurrent collectors. After crash,
  another manual sync can reclaim an expired lease; stale owners cannot commit.
  Failed/interrupted outcomes remain visible in status. WAL, foreign keys,
  a five-second busy timeout, and one connection per store keep writes explicit.

Retention/backup/compaction commands remain follow-ups. Research collection uses
separate durable jobs, dataset intervals and per-provider quotas. Remote access
and account entitlements are checked when the configured collector runs. Existing UI Reset does not delete this DB.

Design/source selection: [directory sources](https://github.com/iFurySt/aifi/blob/main/docs/references/stock-directory-sources.md),
[pipeline](https://github.com/iFurySt/aifi/blob/main/docs/design-docs/us-stock-data-pipeline.md), and
[broader data plan](https://github.com/iFurySt/aifi/blob/main/docs/exec-plans/active/us-stock-data-foundation.md).

## Index Collection Reads

`directory.list` private RPC accepts optional `collection`: `all-us`, `sp500`,
`nasdaq100`, or `watchlist`. Only watchlist accepts `symbols` (at most 50).
Search/count/paging apply inside that scope; `directory.get` remains global.
SQLite v3 retains reviewed index snapshots/source hashes and unresolved symbols.
There is no membership-write RPC for built-ins. Existing directory/settings and
credential records are preserved by migration.

The bundled seed currently contains 503 S&P securities (datasets PDDL dataset,
observed 2026-10-15) and 101 Nasdaq-100 securities (Nasdaq response dated
2026-10-14). These are security counts, not hardcoded group sizes. Refresh the
reviewed seed with `python3 scripts/update-stock-index-seeds.py`, inspect the diff
and source dates, run CI, and commit. Automatic index downloading/scheduling is
not part of this slice; offline/restart reads never depend on GitHub or Nasdaq.
See [sources and provenance](https://github.com/iFurySt/aifi/blob/main/docs/references/stock-index-sources.md).

## Whole-directory research

```sh
./bin/nomi data research status
./bin/nomi data research read AAPL
./bin/nomi data research sync
./bin/nomi data research sync --symbols ADBE,BABA  # bounded repair, at most 50
```

`read`/`status` are SQLite-only. `sync` reconciles every current non-test/non-ETF
candidate, queues work durably and exits; the app-owned service executes it.
No command accepts an API key in its arguments. Configure keys in Settings →
API keys and SEC identification in Data sources. Research settings/status/read
use explicit private RPC methods; no raw SQL, provider URL or plaintext secret
retrieval is exposed to the renderer.

Market jobs fetch raw OHLCV for all US tickers by date, initially up to 730
calendar days, with newest sessions and AAPL/MSFT/NVDA enrichment prioritized.
Company-profile and optional enrichment jobs cover the whole directory;
SEC issuer jobs share a CIK. Splits/dividends use a shared market-wide snapshot
and indexed per-symbol SQLite rows, rather than daily requests per stock.
Immutable SEC accession XML is reused after its first successful collection. Unknown
SEC mappings and unavailable vendor instruments are not fabricated. Prices for
non-company instruments may exist even when SEC financials do not.

Each provider has one worker and a durable shared minute/day budget. Jobs have
15-minute fenced leases, 10-minute execution limits, exponential retry and shared
429 cooldown. Authentication blocks pause a provider; endpoint access blocks
pause its dataset. Saving credentials/contact resets blocked work. Dataset disable
and automatic pause are checked before subsequent requests. Manual sync can run
with automation paused, while disabled datasets remain disabled.

Validated source bytes are gzip-compressed inside SQLite alongside immutable
snapshots and head pointers. Raw daily bars upsert atomically with evidence.
Financial values preserve decimal strings, tags, units, actual periods and filing
identities. Normalized financial coverage is selected standard entity-wide facts
for seven years; custom/segmented statements remain outside this adapter.
SEC submissions retain the recent filing window; insider XML covers its latest
40 Form 4/4-A filings. FMP datasets are optional and disabled by default; their
endpoint entitlements may require paid plans. Institutional pages checkpoint
privately and resume within 24 hours; no partial holdings head is published.

Recent market sessions are rechecked on the configured interval; sessions older
than seven days have a default 30-day repair interval until settings are changed.
A conservative previous-New-York-date watermark avoids collecting an unfinished
session; weekends are skipped and empty holiday responses remain evidenced.
This is EOD collection, not an exchange-grade real-time market calendar.

## Coverage Audit And Repair

Use `python3 scripts/audit-stock-coverage.py --db /path/to/nomi.sqlite` from the
repository root for a read-only coverage/error summary. It uses Python 3's
standard library, never reads credentials and never calls a provider. Stored
snapshot counts do not guarantee complete fields or current quotes.

Targeted `research sync --symbols` validates all symbols before queuing enabled,
configured-source jobs, including mapped SEC issuers. It preserves blocked
entitlements, active leases and retired history. Manual repairs lead background
work; protected index membership prioritizes company/issuer initial collection
before the alphabetical universe. Whole-directory work continues under existing
provider budgets; a queue is not a claim of complete collection. See the
[audit](https://github.com/iFurySt/aifi/blob/main/docs/references/stock-data-coverage-audit.md) for the observed gaps.

## Whole-directory backfill

```sh
./bin/nomi data research backfill                      # local record-level audit
./bin/nomi data research backfill --queue              # persist missing-only work
./bin/nomi data research backfill --run --sec-bulk     # independent collector
```

The standalone collector runs until interrupted and emits a JSON progress line
each minute. It can run while the app is closed; this is an explicit foreground
CLI operation, not an installed login service. Restart the same command to resume.
App and CLI workers cooperate through SQLite leases and shared provider budgets.
Daily limits and cooldowns wait for reset; they are never bypassed by this command.
Source switches, disabled datasets and stored credentials remain authoritative.

Backfill requests preserve successful snapshots, active leases, entitlement
blocks and per-company HTTP backoffs. Unattempted companies lead retries and
ordinary refreshes; current index membership prioritizes work within that pass.
This prevents periodic seed/index refreshes from indefinitely starving the rest
of the directory. The audit counts `withRecords`, `empty` and missing job states
separately. A nonempty observation still does not imply complete fields/history.
SEC counts expand shared CIK records to their mapped directory symbols; unmapped
securities remain visible rather than acquiring a guessed issuer.

`--sec-bulk` uses the [official nightly ZIPs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
for financial facts and recent submissions, using the configured SEC contact.
The two downloads are about 3 GB combined at the observed publication, each
bounded to 3 GiB; normalized evidence needs additional local storage. Private
`bulk-cache/` files use 0600 permissions and a per-archive process lock. Downloads
resume with validated HTTP byte ranges and server version validators; a changed
archive restarts safely. Slow downloads have a cancellable 12-hour request limit,
transient failures back off, and a complete ZIP is reused for 24 hours.
SQLite BUSY/LOCKED conflicts also back off and resume the missing-only import;
completed company writes are retained when app and standalone writers overlap.
Members are never extracted to filesystem paths. ZIP/ZIP64 directory metadata is checked
before allocating file headers: at most 1,250,000 entries and a 128 MiB central
directory, accommodating the official submissions archive's roughly 995,000
entries. Only exact CIK JSON members (max 32 MiB)
with matching body identity enter existing parsers and atomic fenced commits.
Missing/invalid members fall back to ordinary API collection, preserving good
data. The archive URL/member and source time remain in SQLite evidence.

### Enrichment throughput

Yahoo-selected profile/analyst failures can use a no-key Nasdaq backup under its
own configurable local budget (20/minute, 10,000/day). Good primary snapshots and
alternate source choices are preserved; source chips/audits show actual provenance.
Nasdaq targets do not imply individual analyst-grade coverage.

The 16-manager `thirteenf` source downloads complete reports once per accession,
then reuses validated symbol/CUSIP indexes and archived evidence across companies.
Seven-day source freshness survives restarts through durable staging. Missing
reports, options and ambiguous identities never become invented holdings/zeros.
The first shared-cache build remains budgeted and resumable. Standalone startup
retries transient SQLite contention from app writers; progress contention does
not terminate the collector. None of these counts guarantees complete source fields.

## Agent research queries and MCP

The research interface shares domain query services and repository ports across
CLI and MCP. Only the SQLite adapter knows the tables; changing storage does not
require changing an agent's tools. This is a separate read-only process from the
scheduler/control plane. It never creates/migrates a database, loads provider
credentials, fetches sources or exposes arbitrary SQL/files/URLs.

```sh
./bin/nomi query describe_data --request '{}'
./bin/nomi query search_instruments --request '{"query":"Apple","collection":"sp500"}'
./bin/nomi query get_company_overview --request '{"symbols":["AAPL"]}'
./bin/nomi query query_financials --request '{"symbols":["AAPL"],"metrics":["revenue","netIncome"],"period":"annual","periods":4}'
./bin/nomi query query_prices --request '{"symbols":["AAPL"],"limit":20,"basis":"split-adjusted"}'
./bin/nomi query query_disclosures --request '{"symbols":["AAPL"],"kind":"filings","limit":5}'
./bin/nomi query query_ownership --request '{"symbols":["AAPL"],"limit":5}'
# Use an ev: ID returned in evidence, not a path or URL:
./bin/nomi query read_evidence --request '{"evidenceId":"ev:<64 lowercase hex characters>"}'
./bin/nomi mcp serve --profile research
```

A standard MCP client's JSON configuration (replace both absolute paths):

```json
{
  "mcpServers": {
    "nomi": {
      "command": "/absolute/path/to/nomi",
      "args": ["--data-dir", "/absolute/path/to/data", "mcp", "serve", "--profile", "research"]
    }
  }
}
```

No API key, ChatGPT token or provider key belongs in this MCP configuration.
Collect datasets in Nomi first. If storage is missing or incompatible, initialization
and `describe_data` still work with a setup diagnostic; data tools return a typed
error. A running server recovers when a compatible store becomes available.
Stdout is newline-delimited MCP traffic only. `nomi://research/catalog` is an
optional resource; every essential operation is also available as a tool.

The eight tools are `describe_data`, `search_instruments`,
`get_company_overview`, `query_financials`, `query_prices`, `query_disclosures`,
`query_ownership`, and `read_evidence`. Discovery reports metrics and coverage.
Disclosures support `filings`, `earnings`, `insiders`, `politicians`, `analyst`,
and `actions`. Filters are tool-specific; unknown/irrelevant fields are rejected.
Start/end dates filter the source event/report date, not when an investor could
have known the information. The structured output envelope is `nomi.research.v1`.

- Default 20 / maximum 50 aggregate rows; maximum 5 exact symbols, 12 metrics,
  and 4 default / 8 maximum financial periods per metric. Symbol order is normalized;
  results page across that ordered union, with dataset-specific date ordering.
- Financials retain distinct source tags, filing revisions, original values and
  units. SEC annual durations must span 300–400 days; quarters must span 60–120
  days. Instant observations are allowed. No implicit TTM, currency conversion,
  amendment reconciliation, arbitrary screening or derived recommendations.
- Prices are daily OHLCV with an explicit basis; absent bars are not filled.
  Filings/earnings are source records, not guaranteed full documents/transcripts.
  Ownership preserves sample/report dates, reported absence and original basis;
  missing holdings are unknown rather than zero. Optional source fields can be absent.
- Responses carry a `viewId`, `coverage`, `evidence`, `warnings` and optional
  `nextCursor`. Continue using exactly the same arguments/limit plus the cursor.
  The cursor binds filters and the current source generation; updates return
  `STALE_VIEW` and require restarting. V1 does not retain an old mutable-price view
  for replay. Cursors are continuation hints, not authorization capabilities.
- Maximum 16 KiB structured output / 48 KiB full MCP result including its JSON-text
  compatibility copy; oversized pages return fewer rows and a continuation.
  Evidence returns at most a 4,000-byte archived prefix, explicitly untrusted and
  potentially incomplete. Public source links omit query strings/fragments.
- At most 4 concurrent calls; each application read has a 3-second deadline,
  SQLite lock waits are capped at 250 ms, and inbound stdio frames at 64 KiB.
- Historical knowledge cutoffs (`asOf`) return `POINT_IN_TIME_UNAVAILABLE`.
  Current datasets do not certify point-in-time history, market-wide coverage,
  normalized valuation or full provider freshness.

Desktop Chat registers this same bundled Go binary with Codex app-server and no
extra login. MCP gets no OAuth/API-token environment variables. The former dynamic
directory tool is replaced; the independent hosted web-search adapter remains.
Existing conversations re-seed their visible message history once when upgrading
the tool catalog, then resume the new runtime thread normally. This preserves
visible text rather than claiming the old internal tool state was migrated.

Verification:

```sh
make check-go                  # includes all 8 tools, CLI/MCP parity and real stdio SDK client
pnpm build
pnpm smoke:mcp                 # real bundled Codex → real MCP child; isolated synthetic model
pnpm smoke:navigation          # Arena placement/dashboard and native/narrow layouts
pnpm profile:mcp /absolute/path/to/data AAPL  # opt-in, read-only real data; 30 samples/tool
```

The actual authorized ChatGPT model is a separate opt-in integration check, not a
credential-dependent CI test. Implementation and measured results are recorded in
[the design](https://github.com/iFurySt/aifi/blob/main/docs/design-docs/agent-data-mcp-and-arena.md).

## Virtual stock Arena

The desktop Arena now creates a $10,000 synthetic-stock account and runs actual
authorized ChatGPT decisions via Codex. Go owns `internal/arena` and a separate
`arena.sqlite` ledger, preserving the v5 read-only research boundary.
`mcp serve --profile arena --episode ID --run ID` requires a previously begun
host-owned session and adds `arena_get_portfolio_state`,
`arena_preview_rebalance`, `arena_submit_decision`, `arena_list_orders`, and
`arena_get_performance` to the eight research tools. No model clock/reset/funding
tools exist. Submit accepts an idempotent intent; only the coordinator settles
at the next simulated market step. No brokerage or real-market prices.

See [the Arena contract](https://github.com/iFurySt/aifi/blob/main/docs/design-docs/arena-stock-pilot.md) for execution,
recovery and safety limits. `make check-go` covers all five tools over real SDK
stdio and ledger conservation/restart; `pnpm smoke:arena` checks the renderer.
