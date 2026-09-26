# Agent Dashboard

Mission control for TanStack AI agents — a TanStack Start app that watches live
agent sessions, approves tool calls mid-run, and tracks spend, all as a live
projection of the [AG-UI](../../docs/harness/ag-ui.md) event stream.

It embeds a deterministic **support-triage** agent, so it runs with **no API
key**: the agent looks up a ticket (an auto tool), drafts a customer reply (an
approval-gated tool that pauses the run), and sends it once you approve.

```bash
pnpm --filter agent-dashboard dev   # http://localhost:3002
```

## What it exercises

- **TanStack Start** — app shell + routing: hosts → sessions → session detail
  (`src/routes`), and server API routes that host the agent (`src/routes/api.*`).
- **`@tanstack/ai-harness/ag-ui`** — the session view consumes the AG-UI SSE
  stream with a bare `@ag-ui/client` `HttpAgent` (`src/lib/session-controller.ts`);
  no bespoke protocol code.
- **TanStack DB** — run state (messages, tool calls, approvals, spend) lives in
  `localOnly` collections written from the stream and read with `useLiveQuery`
  (`src/db/collections.ts`). The UI is a projection of the stream, not a poller.
- **TanStack Query** — server state: host/session/run lists and agent config.

## Control plane

- **History** (`/history`) — past runs backed by `HarnessPersistence`
  (`runs.listByThread`). Opening a session replays it from stored events
  (`/api/replay`), so a session you didn't run in this tab rehydrates from the
  persisted feed.
- **Spend** (`/spend`) — per-session token rollups (a live query over the
  `spend` collection) with per-session budgets and over-budget alerts.
- **Config** (`/config`) — a form generated from the agent's typed
  `ConfigOption` schemas; edits write through the harness protocol
  (`op: 'config'`). Endpoints are versioned with `HARNESS_PROTOCOL_VERSION`.

## The approval queue

When a run pauses on an approval, an approval card appears. It resolves the
interrupt through **both** paths the interrupt supports:

- **Approve** → the AG-UI resume flow (`runAgent({ resume })` over `/api/agent`),
  so the continuation streams back into the view.
- **Deny** → the harness-native control endpoint (`/api/harness/control`).
- **Edit** → approve with edited tool arguments.

## Server wiring

- `POST /api/agent` — the AG-UI run stream (`createAgUiHandler`, spend ticks on).
- `GET|POST /api/harness/*` — the harness control tier (`createHarnessHandler`):
  `snapshot`, `events`, `control`.
- `GET /api/hosts`, `GET /api/sessions` — host and session lists.
- `GET|POST /api/config` — read/write agent config (versioned).
- `GET /api/runs` — run history; `GET /api/replay` — a session's stored events.

## Test

```bash
pnpm --filter agent-dashboard test:e2e     # Playwright: stream + approve mid-run
```

Generated with Claude Code.
