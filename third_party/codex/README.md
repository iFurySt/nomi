# Codex runtime notices

AIFi bundles the unmodified `@openai/codex` 0.160.0 platform executable and its
runtime helpers as a separate process. npm package integrity is pinned in the
lockfile. `scripts/bundle-codex.mjs` copies the native files and these notices.

- Source: https://github.com/openai/codex/tree/rust-v0.160.0
- Upstream LICENSE and NOTICE: copied verbatim from that tag.
- Protocol: `codex app-server generate-ts --experimental` from the same version.

A runtime upgrade requires reviewing the protocol/event compatibility matrix and
rerunning real-process, host and UI tests. No Codex App proprietary assets are
bundled. The AIFi application and Codex executable retain their own licenses.
