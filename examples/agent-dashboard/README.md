# Agent Dashboard

Mission control for TanStack AI agents — a TanStack Start app that watches live
agent sessions, approves tool calls mid-run, and tracks spend, all as a live
projection of the [AG-UI](../../docs/harness/ag-ui.md) event stream.

It embeds a deterministic **support-triage** agent, so it runs with **no API
key**: the agent looks up a ticket (an auto tool), drafts a customer reply (an
approval-gated tool that pauses the run), and sends it once you approve. (One
team is the exception — the **Reddit pod** uses a real service and a real LLM;
see below.)

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
- **TanStack DevTools** — the demo-only controls (start the triage demo, add
  members, automations, pod memory) live in a custom **Demo Controls** panel,
  kept out of the product UI so it's clear what's scaffolding vs. the real
  experience. The panel renders from the devtools root (outside the route tree)
  and drives the app purely by reading the same live TanStack DB state the UI
  does — so it doubles as a state-management stress test.

## Reddit pod (real service, real AI)

The **+ React-news demo** team is the first pod wired to a _real_ external
service and a _real_ LLM — the graduation from the scripted demo agents:

- **`reddit/fetcher`** — a procedural agent (no LLM) carrying one real tool,
  `reddit.search_react_news`, which reads Reddit's public **RSS (Atom)** feed
  (read-only, no auth, no key). Run it from the Demo Controls panel, or put it
  on a 30-min schedule.
- **`sentiment/react`** — a **real LLM** agent (Anthropic). It's subscribed to
  the fetcher's tool _result_
  (`{ event: 'tool_result', tool: 'reddit.search_react_news', action: 'trigger' }`),
  so when a news batch lands it's triggered automatically — nobody runs it — and
  posts a sentiment digest, persisting standout signals to pod memory.

The loop is **timer → tool result → subscription → LLM digest**. The trigger
path spends zero tokens; the only cost is the digest itself. Chat messages don't
match the `tool_result` subscription, so the loop doesn't feed itself (a Phase 4
scoping case study — verified by letting it run several cycles).

### The one manual step: an API key

`sentiment/react` needs a real provider. Set `ANTHROPIC_API_KEY` before starting
the dev server to get a live digest:

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter agent-dashboard dev
```

Without a key the agent posts a "set the key" message instead of a digest — the
rest of the dashboard still runs key-free. The e2e suite uses a deterministic
double and a recorded Reddit fixture, so it needs neither a key nor the network.

> **Why RSS, not `.json`:** Reddit's public JSON (`/r/x/new.json`) returns `403`
> for many datacenter/VPN egress IPs regardless of `User-Agent`, while the Atom
> feed (`/r/x/new.rss`) is served — so the tool reads RSS. RSS carries title,
> link, author, timestamp and body (enough for a digest) but not score/comment
> counts. Reddit still rate-limits bursts (a rapid retry can `429`); the 30-min
> schedule stays well clear. The e2e suite uses the recorded fixture, so it
> needs neither network nor key.

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

## Meta-chat (the demo)

`/chat` is the dashboard's **own** agent (`dashboard/meta`), a tool-using chat
over live dashboard state. It runs on the same host as every other agent, so its
runs and tool calls show up in History and the trace view — the dashboard
dogfooding itself. Its tools: `list_agents`, `list_sessions`, `query_runs`,
`get_agent_config`, `set_agent_config`, `summarize_session`.

Demo script:

1. Open `/chat`.
2. Ask **"List the agents on this host"** — it calls `list_agents` (visible
   inline) and answers "This host runs 2 agents: support/triage, dashboard/meta."
3. Run a triage session (Hosts → New team → open the **Demo Controls**
   devtools panel → Start triage demo).
4. Back in `/chat`, ask **"How many runs so far?"** and **"Summarize the latest
   session"** — it queries live run history and the session snapshot.
5. Open **History** — the meta-chat's own runs are listed alongside the agents',
   and each replays.

## Server wiring

- `POST /api/agent` — the AG-UI run stream (`createAgUiHandler`, spend ticks on).
- `GET|POST /api/harness/*` — the harness control tier (`createHarnessHandler`):
  `snapshot`, `events`, `control`.
- `GET /api/hosts`, `GET /api/sessions` — host and session lists.
- `GET|POST /api/config` — read/write agent config (versioned).
- `GET /api/runs` — run history; `GET /api/replay` — a session's stored events.
- `POST /api/meta` — the meta-chat's AG-UI run stream.

## State

Server state is durable, so you can close the tab, restart the server, and find
each team where you left it. It lives in one JSON file (`.data/state.json`,
gitignored; override with `DASHBOARD_STATE_FILE`), written through on every
mutation and replayed on boot (`src/server/store.ts`). Persisted: chat run state
(messages, runs, interrupts, agent config) plus the dashboard's side tables
(threads, pod memory, schedules, webhooks). Not persisted: the in-flight
injection queue and the dev offline toggle. It's a single-process file store — a
multi-node dashboard would swap in a real database behind the same seam.

## Test

```bash
pnpm --filter agent-dashboard test:e2e     # Playwright: stream + approve mid-run
```

Generated with Claude Code.
