# Agent Dashboard

Mission control for TanStack AI agents — a TanStack Start app that watches live
agent sessions, approves tool calls mid-run, and tracks spend, all as a live
projection of the [harness](../../docs/harness/connect.md) event feed.

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
- **`createHarnessHandler`** — each harness is served at `/api/harness/*`. The
  session view reads `snapshot` and `transcript` to hydrate, then follows
  `events?from=` over SSE (`src/lib/session-controller.ts`). Every action
  (steer, cancel, answer, resolve, configure, fork, rename) is a harness input.
- **TanStack DB** — run state (messages, tool calls, approvals, spend) lives in
  `localOnly` collections written from the stream and read with `useLiveQuery`
  (`src/db/collections.ts`). The UI is a projection of the stream, not a poller.
- **TanStack Query** — server state: host/session/run lists and agent config.
- **Composing teams (product UI)** — the home page is an **agents table**; each
  row's **Add to team** starts a new team with that agent or drops it into an
  existing one. On a team, **Add agent** adds any available agent, and each
  roster agent has a **Run a tool** (wrench) button to run one of its public tools with
  JSON parameters. Agents carry **default subscriptions** by harness (what they
  react to), so a hand-composed team behaves like a seeded one.
- **Styling** — Tailwind v4 with the TanStack AI design tokens (colors, type,
  radii) in `src/styles.css`. Dark is the default; the rail's theme toggle
  switches to light. Icons are Phosphor (`@phosphor-icons/react`).
- **TanStack DevTools** — the demo-only scaffolding (the seeded-team launchers,
  the triage demo, automations, pod memory) lives in a custom **Demo Controls**
  panel, kept out of the product UI so it's clear what's scaffolding vs. the real
  experience. The panel renders from the devtools root (outside the route tree)
  and drives the app purely by reading the same live TanStack DB state the UI
  does — so it doubles as a state-management stress test.

## Reddit pod (real service, real AI)

The **+ React-news demo** team is the first pod wired to a _real_ external
service and a _real_ LLM — the graduation from the scripted demo agents:

- **`reddit/fetcher`** — a procedural agent (no LLM) carrying one real tool,
  `reddit.search_react_news`, which reads Reddit's public **RSS (Atom)** feed
  (read-only, no auth, no key). Run it from the roster's **Run a tool** button, a
  30-min schedule, or the Demo Controls panel.
- **`sentiment/react`** — a **real LLM** agent (Anthropic). Its harness default
  subscription is the fetcher's tool _result_
  (`{ event: 'tool_result', tool: 'reddit.search_react_news', action: 'trigger' }`),
  so whether you spin up the seeded demo or compose the team by hand, a news
  batch triggers it automatically — nobody runs it — and it posts a sentiment
  digest, persisting standout signals to pod memory.

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

- **History** (`/history`) — the host session index (`host.sessions`). It
  refreshes from `GET /api/harness/host-events`. Opening a session replays its
  stored feed, so a session you didn't run in this tab rehydrates.
- **Spend** (`/spend`) — per-session usage from `session.usage()`, priced with
  `modelCost` from `@tanstack/ai-models`. Set a budget and `/api/run` rejects
  new prompts for that session once it is over.
- **Session tools** — on a session page: rename, fork from the last message,
  reset the context, pick the model (for harnesses that expose it), cancel a
  queued input, and open child sessions.
- **Config** (`/config`) — a form generated from the agent's typed
  `ConfigOption` schemas; edits write through the harness protocol
  (`op: 'config'`). Endpoints are versioned with `HARNESS_PROTOCOL_VERSION`.

## The approval queue

When a run pauses on an approval, an approval card appears. Each button sends a
`resolve` input to `/api/harness/control`, and the continuation streams back
on the event feed:

- **Approve** resolves the interrupt.
- **Deny** cancels it.
- **Edit** approves with edited tool arguments.

A `permissions()` question shows its answers (`once`, `always`, `reject`) as
buttons.

## Operate a live run

Open a team and start a run. The team page gives you these controls:

1. Select **Trace** to see run, model, tool, and approval spans in a live waterfall.
2. Select **approve** or **deny** on an approval span to continue the run.
3. Send a message during a run to steer it.
4. Select **Stop** to cancel the run.
5. Answer an agent question with its question card.

The **Spend** page shows token use and estimated dollar cost. Scripted demo
agents cost `$0.00`. The `sentiment/react` agent is priced from the model
it ran on, using `@tanstack/ai-models`.

## Manage automations

Use the **Automations** section on a team page to run work on a schedule or from
a webhook.

1. Select an agent and one of its public tools.
2. Add an interval or a five-field cron schedule.
3. Use the schedule list to see the next three runs, pause the schedule, or delete it.
4. Add a webhook and copy its endpoint.
5. Use the delivery list to inspect a result or retry the payload.

## Manage the dashboard through MCP

Each harness has its own MCP server (`createHarnessMcpServer`) at
`/api/mcp/<harness>`. It has `chat`, `steer`, `cancel`, `approve`, `reject`,
`answer`, `status`, and one `tool_<name>` for each exposed tool:

```bash
claude mcp add --transport http triage http://localhost:3002/api/mcp/support/triage
```

The dashboard's own tools are at `/api/mcp`: list teams, send a message to a
team, run a public tool, and control schedules.

```bash
claude mcp add --transport http dashboard http://localhost:3002/api/mcp
```

This local demo does not require authentication. Add an authentication gate
before you expose the endpoint outside localhost.

## Meta-chat (the demo)

`/chat` is the dashboard's **own** agent (`dashboard/meta`), a tool-using chat
over live dashboard state. It runs on the same host as every other agent, so its
runs and tool calls show up in History and the trace view — the dashboard
dogfooding itself. Its tools: `list_agents`, `list_sessions`, `query_runs`,
`get_agent_config`, `set_agent_config`, `summarize_session`.

Demo script:

1. Open `/chat`.
2. Ask **"List the agents on this host"** — it calls `list_agents` (visible
   inline) and answers with the agents registered on the host.
3. Run a triage session (open the **Demo Controls** devtools panel → **+ New
   team** → **Start triage demo**).
4. Back in `/chat`, ask **"How many runs so far?"** and **"Summarize the latest
   session"** — it queries live run history and the session snapshot.
5. Open **History** — the meta-chat's own runs are listed alongside the agents',
   and each replays.

## Server wiring

- `GET|POST /api/harness/*` — `createHarnessHandler`, one per harness (pick it
  with `?harness=`, or it is read from the session index): `run`, `events`,
  `control`, `snapshot`, `transcript`, `describe`, `sessions`, `host-events`.
- `POST /api/run` — start a turn (checks the session budget first).
- `GET|POST /api/spend` — session usage and budgets.
- `GET /api/hosts`, `GET /api/sessions`, `GET /api/runs` — lists.
- `GET|POST /api/config` — read/write agent config (versioned).
- `/api/mcp`, `/api/mcp/<harness>` — MCP (see above).

## State

Server state is durable, so you can close the tab, restart the server, and find
each team where you left it. It lives in one JSON file (`.data/state.json`,
gitignored; override with `DASHBOARD_STATE_FILE`), written through on every
mutation (`src/server/store.ts`). Persisted: every harness store except
credentials (sessions index, transcripts, runs, events, interrupts, inputs,
leases, config) plus the dashboard's side tables (schedules, webhooks,
budgets, relay tokens). On boot the server calls `host.resumePending()`, so a
turn cut off by a restart continues. It's a single-process file store — a
multi-node dashboard would swap in a real database behind the same seam.

## Remote relay

Set `DASHBOARD_RELAY_URL` to connect each harness to a
[`@tanstack/ai-dashboard`](../../packages/ai-dashboard) relay:

```bash
node packages/ai-dashboard/bin/dashboard.mjs --port 8797
DASHBOARD_RELAY_URL=http://127.0.0.1:8797 pnpm --filter agent-dashboard dev
```

The server logs a pairing code for each harness. Approve it in the relay. The
token is saved, so the next start connects with no code.

## Test

```bash
pnpm --filter agent-dashboard test:e2e     # Playwright: stream + approve mid-run
```

Generated with Claude Code.
