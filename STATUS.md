# Agent Dashboard — build status

Spec: `~/Downloads/agent-dashboard-spec.md`. This branch implements all four
phases. Everything below is committed and verified; nothing is pushed.

## Where this lives

- **Worktree**: `~/projects/tanstack/ai-workingtrees/ai-dashboard-work`
- **Branch**: `feat/agent-dashboard`
- **Base**: `origin/feat/harness-p8-code-mode` (top of the harness PR stack
  #1509→#1524, head `50ab70e3e`) — the real `TanStack/ai` monorepo, **not** the
  standalone `tanstack-agent-dashboard` POC.
- **Do not touch** the stacked `feat/harness-p*` branches or the relay in
  `packages/ai-dashboard` (spec §6).

## Commits (atop the base)

| Commit | What |
|--------|------|
| `7da107f` | `feat(ai-harness)`: the `@tanstack/ai-harness/ag-ui` bridge subpath |
| `d6c538a` | `fix(ai-harness)`: coalesce multi-turn operations + conform usage for strict AG-UI clients |
| `78a5ba8` | `feat(examples/agent-dashboard)`: live session view + approval queue (Phase 2) |
| `d28d9de` | `feat(examples/agent-dashboard)`: control plane — history, spend, config (Phase 3) |
| `0940975` | `feat(examples/agent-dashboard)`: meta-chat over live agent state (Phase 4) |

## Phase status

- **Phase 1 — AG-UI bridge** ✅ `packages/ai-harness/src/ag-ui.ts`
  - `sessionEventsToAgUi()` (normalizer), `operationToAgUiRun()` (coalesces one
    harness operation → one valid AG-UI run), `createAgUiHandler()` (SSE via
    `@ag-ui/encoder`). Consumable by a bare `@ag-ui/client` `HttpAgent`.
  - Interrupts stay as `RUN_FINISHED.outcome`, usage → `metadata.tanstack.usage`
    (+ conformed to `SpecTokenUsage[]`), subagent attribution preserved, optional
    `tanstack.spend` ticks.
  - 22 unit tests (`tests/ag-ui.test.ts`), changeset, `docs/harness/ag-ui.md`
    (kiira passes, registered in `docs/config.json`). AG-UI pinned at `1.0.0`.
- **Phase 2 — Dashboard shell + live session view** ✅ `examples/agent-dashboard`
  - TanStack Start; routes hosts → sessions → session detail.
  - Session view consumes AG-UI SSE via `@ag-ui/client`, projected into TanStack
    DB `localOnly` collections read with `useLiveQuery` (no polling).
  - Approval queue: approve → AG-UI resume, deny → harness control tier, edit →
    edited tool args.
- **Phase 3 — Control plane** ✅
  - History (`/history`, `runs.listByThread`) + session replay (`/api/replay`).
  - Spend (`/spend`): per-session token rollups (live query) + budgets/alerts.
  - Config (`/config`): form from `ConfigOption` schemas → writes via the harness
    protocol (`op: 'config'`). Endpoints stamped `HARNESS_PROTOCOL_VERSION`.
- **Phase 4 — Meta-chat** ✅ `/chat`, harness `dashboard/meta`
  - Tools over live state: `list_agents`, `list_sessions`, `query_runs`,
    `get_agent_config`, `set_agent_config`, `summarize_session`.
  - Runs on the same host (harness registry); its tool calls are visible inline
    and its runs appear in History like any other agent.

## Run it

```bash
# from the worktree root
pnpm install
pnpm --filter @tanstack/ai-harness build     # dashboard imports the built dist

pnpm --filter agent-dashboard dev            # http://localhost:3002 (no API key needed)
pnpm --filter agent-dashboard test:e2e       # Playwright
```

Demo: Hosts → **New triage session** → **Start triage demo** → approve the
drafted reply mid-run. Then try **Meta-chat**, **History**, **Spend**, **Config**.

## Verification

- `@tanstack/ai-harness`: **176 unit tests pass**; `tsc` / `oxlint` /
  `publint --strict` clean.
- `examples/agent-dashboard`: **5 Playwright e2e pass** (approval mid-run, config
  read/write, spend, history + replay, meta-chat); `tsc --noEmit` clean.
- Base verified before starting: `pnpm build:all` (73/73), example agent runs and
  emits AG-UI ndjson, `--serve` + relay boot.

## Deliberate decisions / open questions (spec §8 — flagged for @AlemTuzlak)

- **Chart**: spend uses an SSR-safe SVG bar chart, **not** `@tanstack/react-charts`.
  Its 0.18 auto-sizing loops a ResizeObserver and freezes the main thread (the
  POC hit this too and switched to visx).
- **Location**: `examples/agent-dashboard` (no `apps/` dir in the repo).
- **Auth**: local single-user (`authorize` returns a fixed principal). Multi-user
  auth beyond pairing/host-token is a follow-up.
- **Spend**: tokens-first with per-session budgets as data; no canonical price
  table yet (cost is a pluggable follow-up).

## Known cosmetic issue

- `@ag-ui/client` logs a warning stripping a nonstandard `/toolName` field the
  harness core adds to `TOOL_CALL_START`. Warning only — the run is unaffected.

## Not done

- Not pushed to any remote (no push was requested).
- Deferred per spec §5: agent versioning, evals/red-teaming, prompt playground,
  multi-host aggregation beyond the relay.
