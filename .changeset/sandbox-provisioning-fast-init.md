---
'@tanstack/ai-sandbox': minor
'@tanstack/ai-claude-code': minor
'@tanstack/ai-codex': minor
'@tanstack/ai-gemini-cli': minor
'@tanstack/ai-opencode': minor
'@tanstack/ai-sandbox-docker': patch
---

Declarative sandbox provisioning + faster headless init.

- **`createSecrets`**: type-safe secret references; underlying values are stored
  in a non-enumerable symbol-keyed registry and never written to snapshots, the
  sandbox store, or the event log. Use `secret: secrets.GH` in `gitSkill` for
  private-repo auth and `bearer(secrets.GH)` in MCP header values.
- **Declarative `skills` / `plugins` / `instructions`**: `agentSkill`,
  `gitSkill` (private-repo clone with `secret`), `mcpSkill` (MCP server with
  resolved header values), and `fileSkill` are projected per harness into each
  CLI's native format (Claude Code `.mcp.json`, Codex `.codex/config.toml`,
  Gemini CLI settings JSON, OpenCode `opencode.json`). `instructions` is written
  as a canonical `AGENTS.md` at the workspace root; `CLAUDE.md` and `GEMINI.md`
  are symlinked (copy fallback). Concepts a CLI lacks emit a warning and are
  skipped rather than throwing.
- **Shallow clone by default**: `githubRepo`/`gitSource` default to
  `--depth 1 --single-branch`. Pass `depth: number` for a specific history
  depth or `depth: 'full'` to disable the flag.
- **Serial/parallel `setup` callback**: `setup` accepts a plain `Array<string>`
  (all serial) or a `({ serial, parallel }) => void` callback that records
  groups run over a persistent shell — the shell's cwd and env carry over
  between serial steps; `parallel([...])` launches commands concurrently
  using the shell's forked state.
- **Default snapshot-after-setup**: when the provider supports snapshots,
  bootstrap takes one automatically after `setup` completes. Add
  `lifecycle.snapshotMaxAge` (e.g. `'24h'`) to re-create the sandbox when the
  snapshot is older than the TTL.
- **`@tanstack/ai-sandbox-docker` fix**: a spawned process's demuxed
  stdout/stderr now end on the exec stream's `close`/`error` (not only `end`),
  so disposing a long-lived process (e.g. the bootstrap shell) no longer hangs
  after `kill()`.
