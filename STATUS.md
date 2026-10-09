# Agent Dashboard — status + feature inventory

Spec: `~/Downloads/agent-dashboard-spec.md` (original four phases), then the
**teams reframe** (`~/Downloads/pods-design-doc.md` + `pods-implementation-plan.md`),
then the **Reddit pod** (`~/Downloads/teams-reddit-pod.md`).

> **Latest work: weekend sprint** — live trace waterfall, steer/stop/ask-user,
> cron schedules with upcoming runs, webhook delivery management, dollar spend,
> and an MCP endpoint that lets external agents manage the dashboard. The branch
> was merged with `origin/main` on 2026-10-02 (`c1d0169d6`), no conflicts.

## Where this lives

- **Worktree**: `~/projects/tanstack/ai-workingtrees/ai-dashboard-work`
- **Branch**: `feat/agent-dashboard`, pushed to `origin/feat/agent-dashboard`,
  open as [PR #1560](https://github.com/TanStack/ai/pull/1560).
- **Base**: up to date with `origin/main` (merged 2026-10-02). The harness work
  it builds on (`@tanstack/ai-harness` session view, out-of-band tools,
  `@tanstack/ai-dashboard`) is **branch-only** — none of it is on `main`.
- **Do not touch** the relay in `packages/ai-dashboard` (spec §6).

---

## Feature inventory (for competitive analysis)

There are **two dashboards** on this branch. Compare them separately — they
target different buyers.

| Product                      | Where                      | What it is                                                                                                                              |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent Dashboard**          | `examples/agent-dashboard` | Mission control for teams of agents: live channels, approvals, automations, pod memory, spend, config, meta-chat. A TanStack Start app. |
| **`@tanstack/ai-dashboard`** | `packages/ai-dashboard`    | A small self-hosted remote control for one or more harness hosts. Zero dependencies, `npx`-runnable, installs as a phone PWA.           |

Status legend: ✅ shipped · 🟡 partial / demo-grade · 🧪 simulated · ❌ not built

### A. Agent Dashboard (`examples/agent-dashboard`)

#### A1. Live observability

| Feature                            | Status | Notes                                                                                                                                                    |
| ---------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live session stream                | ✅     | `createHarnessHandler` per harness: `snapshot` + `transcript` hydrate, then `events?from=` over SSE. Projected into TanStack DB collections. No polling. |
| Message rendering                  | ✅     | Assistant text renders as markdown (GFM tables) via `react-markdown` + `remark-gfm`. User text stays plain.                                              |
| Tool-call cards                    | ✅     | Name, status (running/done), args and result as collapsible JSON trees. Plain-text results stay text. Oversize results show "(result truncated)".        |
| Injected-call badge                | ✅     | Tool calls started by a timer, run-now, or webhook get a violet border and a `⏵ timer/manual/webhook` badge.                                             |
| Subagent attribution               | ✅     | Messages from a child agent carry a `subagent` badge (`subagentRunId` preserved on the event feed).                                                      |
| Per-agent attribution in teams     | ✅     | Author tag on every message and tool card once a channel has ≥2 members.                                                                                 |
| Channel status pill                | ✅     | Aggregates members: `running` / `requires action` / `idle`.                                                                                              |
| Live token counter per channel     | ✅     | Sum of `spend` rows for the channel, in the header.                                                                                                      |
| Memory-attached badge              | ✅     | "🧠 N memory entries attached" on the channel header after a run.                                                                                        |
| Long trigger prompts collapse      | ✅     | Injected subscription prompts clamp to 3 lines with Show more / Show less. Internal `[channel:<id>]` routing tags are stripped.                          |
| Session detail view                | ✅     | `/sessions/$threadId`: one thread's stream, kept for back-compat with the pre-teams model.                                                               |
| Timeline survives a server restart | ✅     | The persisted event feed replays from cursor 0. An empty feed falls back to the transcript, routed to the right channel.                                 |
| Resolved approvals stay resolved   | ✅     | Pending approvals and questions come from the snapshot, so reloading never re-raises an approved interrupt.                                              |
| Compaction / sign-in / retry cards | ✅     | System cards for `compaction:*`, `harness.auth_required` (with a sign-in link), `harness.turn.retry`, and run errors.                                    |
| Trace waterfall per run            | ✅     | Live run, text, tool, and approval spans. Pending approvals can be resolved in the trace.                                                                |
| OpenTelemetry export               | ❌     | No OTLP export or cross-service trace correlation.                                                                                                       |
| Search / filter across sessions    | ❌     |                                                                                                                                                          |

#### A2. Human-in-the-loop

| Feature                                | Status | Notes                                                                                        |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| Approval queue (mid-run)               | ✅     | Run pauses on an approval-gated tool (`needsApproval`). Card shows tool name, message, args. |
| Approve                                | ✅     | A `resolve` input on `/api/harness/control`; the continuation streams back on the feed.      |
| Deny                                   | ✅     | A `resolve` input with `cancelled: true`.                                                    |
| Permission answers                     | ✅     | `permissions()` questions show `once` / `always` / `reject` buttons.                         |
| Fork / rename / reset / model picker   | ✅     | Session tools bar. Model picker for harnesses that expose `settings: ['model']`.             |
| Input queue                            | ✅     | Queued inputs from the snapshot, each with cancel (`cancelInput`).                           |
| Child sessions                         | ✅     | Lists `sessions?parentThreadId=` on a session page.                                          |
| Edit, then approve                     | ✅     | Edit tool args as JSON, then approve the edited call.                                        |
| Chat with an agent                     | ✅     | Message box sends to the channel's primary agent. Memory is attached to every run.           |
| Run a member on demand                 | ✅     | Roster `▶ run` sends a generic nudge to any agent.                                           |
| Plugin questions (ask-user)            | ✅     | Question cards support Boolean and free-text answers.                                        |
| Steer / stop a running agent           | ✅     | Running sessions turn the message box into Steer and expose a Stop button.                   |
| Broadcast to all members               | ❌     | Human input targets one primary agent.                                                       |
| Approval policies / auto-approve rules | 🟡     | Only a per-agent config flag ("Skip approval for low-risk replies", demo only).              |

#### A3. Multi-agent teams ("pods")

| Feature                              | Status | Notes                                                                                                                          |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Agents catalog                       | ✅     | Home page is a table of every registered agent (name, description) with **Add to team ▾** (new team or an existing one).       |
| Teams list                           | ✅     | Home page lists teams; `/teams/$teamId` opens one.                                                                             |
| Progressive disclosure               | ✅     | One agent looks like a plain chat. A second member reveals the roster and attribution.                                         |
| ＋ Add agent                         | ✅     | Add any available agent to a team's main channel.                                                                              |
| Shared channel (multiplexed streams) | ✅     | N member threads merge into one timeline with no id collisions.                                                                |
| Dynamic channels                     | ✅     | Agents open per-topic channels (e.g. `#pr-123`) via `pod.channel_create`. Channel sidebar + "📢 channel created" system cards. |
| Direct messages                      | ✅     | **New DM** with any agent creates a working 1:1 channel.                                                                       |
| Roster with live status dots         | ✅     | Per-member running / requires-action / idle.                                                                                   |
| Operator role                        | ✅     | A member can be an `operator` (e.g. the meta agent) instead of an `agent`.                                                     |
| Event subscriptions                  | ✅     | `channel_created` (join + trigger) and `tool_result` (trigger on another agent's tool output).                                 |
| Default subscriptions by harness     | ✅     | Hand-composed teams react like seeded ones with no wiring. Roster toggle: 🔔 subscribed / 🔕 subscribe.                        |
| Agent-to-agent messaging             | ✅     | `pod.message_post`, routed by channel id.                                                                                      |
| Loop / bounce protection             | 🟡     | Chat messages don't match `tool_result` subscriptions and replays don't re-dispatch. No general cycle detector.                |
| Mixed harnesses in one team          | ✅     | Server learns each thread's harness, so watcher + reviewer + meta can share a team.                                            |
| Team-level permission boundary       | ❌     | Design doc concept only; no enforcement.                                                                                       |

#### A4. Memory

| Feature                       | Status | Notes                                                                                                                       |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Pod memory store              | ✅     | Server-side, keyed per agent thread. Persisted to disk.                                                                     |
| Agents write memory           | ✅     | `pod.memory_write` (in-band or out-of-band) or the provider-safe `remember` tool.                                           |
| Automatic memory injection    | ✅     | Every run (chat, subscription, prompt-mode webhook) gets the thread's memory as a `systemPreamble`. Zero agent-author code. |
| Memory panel on the team page | ✅     | One panel per agent. Key on top, value below (clamped to 3 lines). Add, delete (🗑); re-adding a key updates it.             |
| Learn-from-correction loop    | ✅     | Demoed end to end: human corrects the reviewer → memory written → next PR reviewed correctly.                               |
| Shared team memory            | ❌     | Memory is per agent, not per team.                                                                                          |
| Vector / semantic memory      | ❌     | Key-value only.                                                                                                             |

#### A5. Automations (deterministic, zero-token triggers)

| Feature                     | Status | Notes                                                                                                                                                      |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Out-of-band tool invocation | ✅     | `{ op: 'tool' }` runs one registered tool with no model turn. Result streams into the channel and persists for replay.                                     |
| Tool exposure               | ✅     | Only tools in `expose.tools` can run from a client. Others get `not_exposed`. Each harness MCP server adds `tool_<name>` for them.                         |
| Run-now                     | ✅     | Product UI: roster **🔧 tools** → RunToolDialog (pick a public tool, JSON params). Also in the Demo Controls panel.                                        |
| Schedules                   | ✅     | Server-owned clock (1 s scheduler). `everySeconds` or 5-field cron. Pause / resume / delete. Idempotent jobs.                                              |
| Webhooks                    | ✅     | Tokenized ingress `POST /api/webhooks/:token`. Two modes: `tool` (run a tool) or `prompt` (start a model run, memory attached).                            |
| Result size cap             | ✅     | 64 KB per injected result.                                                                                                                                 |
| Remote relay                | ✅     | `DASHBOARD_RELAY_URL` connects each harness to `@tanstack/ai-dashboard` with `connectDashboard`. Pairing tokens persist. The relay owns the offline queue. |
| Per-field tool param forms  | ❌     | JSON only; `/api/tools` doesn't expose input schemas.                                                                                                      |
| Schedule UI for cron        | ✅     | Product UI supports intervals and five-field cron, three upcoming runs, last run, pause/resume, and delete.                                                |
| Webhook delivery management | ✅     | Product UI shows endpoint URLs and the latest 20 delivery attempts, with retry and delete.                                                                 |

#### A6. Control plane

| Feature                     | Status | Notes                                                                                                                                                      |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run history                 | ✅     | `/history`, the host session index (`host.sessions`), live through `host-events`. Includes the meta agent's own runs.                                      |
| Session replay              | ✅     | Rehydrates any stored session from its persisted feed (`events?from=0`), or from the transcript.                                                           |
| Spend tracking              | ✅     | `/spend`: per-session tokens from `session.usage()`, live. SSR-safe SVG bar chart with budget reference lines.                                             |
| Budgets + alerts            | 🟡     | Per-session token budget (default 2,000), persisted. Once a budget is set, `/api/run` rejects new prompts over it. Schedules and webhooks are not checked. |
| Cost in dollars             | ✅     | `modelCost` from `@tanstack/ai-models` per model, including cached tokens. A provider-reported cost wins. Scripted agents show `$0.00`.                    |
| Agent config                | ✅     | `/config`: form generated from typed `ConfigOption` schemas; writes through the harness protocol (`op: 'config'`).                                         |
| Protocol versioning         | ✅     | Endpoints stamped with `HARNESS_PROTOCOL_VERSION`.                                                                                                         |
| Agent versioning / rollback | ❌     | Deferred (spec §5).                                                                                                                                        |
| Evals / red-teaming         | ❌     | Deferred (spec §5).                                                                                                                                        |
| Prompt playground           | ❌     | Deferred (spec §5).                                                                                                                                        |

#### A7. Meta-chat (the dashboard's own agent)

| Feature              | Status | Notes                                                                                                      |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Chat over live state | ✅     | `/chat`, harness `dashboard/meta`. Also usable as an operator inside any team.                             |
| Tools                | ✅     | `list_agents`, `list_sessions`, `query_runs`, `get_agent_config`, `set_agent_config`, `summarize_session`. |
| Dogfooding           | ✅     | Its tool calls render inline; its runs appear in History like any other agent.                             |
| Real LLM             | 🟡     | Scripted keyword router in the example (no API key needed). Swap in a real adapter for production.         |

#### A8. Persistence, deployment, security

| Feature                    | Status | Notes                                                                                                                                                                 |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable state              | ✅     | One JSON file (`.data/state.json`, override `DASHBOARD_STATE_FILE`). Atomic, debounced write-through; replayed on boot.                                               |
| What persists              | ✅     | Every harness store but credentials (session index, transcripts, events, inputs, leases), plus schedules, webhooks, budgets, relay tokens. `resumePending()` at boot. |
| What doesn't               | —      | Credentials.                                                                                                                                                          |
| Multi-node / real database | ❌     | Single process, single file. A DB can swap in behind the same seam.                                                                                                   |
| Auth                       | 🟡     | Local single user (`authorize` returns a fixed principal). No multi-user, RBAC, or SSO.                                                                               |
| Audit trail                | 🟡     | Every action is a message or tool call in the stream (`pod.memory_write` cards stay visible). No dedicated audit log view.                                            |

#### A9. Developer experience

| Feature                      | Status | Notes                                                                                              |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Runs with no API key         | ✅     | Scripted demo agents. Only the Reddit sentiment agent needs `ANTHROPIC_API_KEY`.                   |
| Demo Controls devtools panel | ✅     | Custom TanStack DevTools plugin: seeded-team launchers, triage demo, automations, PR webhook.      |
| Hermetic e2e                 | ✅     | `VITE_E2E` swaps in deterministic doubles + a recorded Reddit fixture. No key, no network.         |
| TanStack stack showcase      | ✅     | Start (routes + server API), DB (`localOnly` collections), Query (server state), DevTools, Router. |

#### A10. Bundled demo agents

| Agent             | Kind                        | What it shows                                                                                    |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `support/triage`  | Scripted                    | Auto tool (`lookup_ticket`) → approval-gated tool (`send_reply`) → resume. Public `fetch_stats`. |
| `ops/pr-watcher`  | Scripted                    | Webhook → `github.check_pr` → opens a `#pr-…` channel → posts to it.                             |
| `security/review` | Scripted                    | Subscribes to `channel_created`, reviews, learns from human correction via pod memory.           |
| `reddit/fetcher`  | Procedural (no LLM)         | Real external I/O: reads Reddit's public RSS. Run-now / schedule / webhook target.               |
| `sentiment/react` | Real LLM (Claude Haiku 4.5) | Triggered by the fetcher's `tool_result`. Posts a markdown sentiment digest, writes memory.      |
| `dashboard/meta`  | Scripted                    | The meta-chat operator.                                                                          |

### B. `@tanstack/ai-dashboard` (self-hosted remote control)

| Feature                                   | Status | Notes                                                                                                                                           |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| One-command self-host                     | ✅     | `npx @tanstack/ai-dashboard --port 8790` or `startDashboard()`. Plain `node:http`, no new dependencies.                                         |
| Owner sign-in                             | ✅     | Prints a sign-in link with an owner token. `DASHBOARD_OWNER_TOKEN` keeps it stable across restarts.                                             |
| Outbound-only hosts                       | ✅     | Agents dial out with `connectDashboard()`; they need no open port.                                                                              |
| Pairing                                   | ✅     | One-time code shown by the host; the owner approves it in the UI; host gets a revocable host token.                                             |
| Host revocation                           | ✅     | `POST /api/hosts/revoke`.                                                                                                                       |
| Relay transport                           | ✅     | SSE + POST. Events batched so a streaming answer is a few requests, not one per token.                                                          |
| Event cache                               | ✅     | Recent events per session (default 2,000) so a late viewer catches up.                                                                          |
| Offline input queue                       | ✅     | Inputs for an offline host wait (default 10 min TTL) and are delivered on reconnect. Real, not simulated.                                       |
| Hosts + sessions list                     | ✅     | Multiple hosts, each with its sessions.                                                                                                         |
| Live messages + tool calls                | ✅     |                                                                                                                                                 |
| Child-agent blocks                        | ✅     | Work from delegated coding agents (Claude Code, Codex via `codingAgents`) groups into one block per child, with tools, text, and failure state. |
| Approval cards                            | ✅     |                                                                                                                                                 |
| Plugin questions                          | ✅     | Yes/No or free-text answers.                                                                                                                    |
| Prompt / steer / stop                     | ✅     | Prompt when idle, steer while running, stop.                                                                                                    |
| Mobile PWA                                | ✅     | Web manifest + service worker; installs on a phone.                                                                                             |
| CLI integration                           | ✅     | `@tanstack/ai-harness-cli --dashboard <url>`.                                                                                                   |
| Persistence                               | ❌     | In-memory relay; restart drops hosts' cached events.                                                                                            |
| Teams, memory, automations, spend, config | ❌     | Those live only in the Agent Dashboard example.                                                                                                 |

### C. Platform pieces underneath (in `@tanstack/ai-harness`, branch-only)

These are what a competitor would need to match the dashboards, not UI.

- **Out-of-band tool op** `{ op: 'tool', name, args?, meta? }` + `expose.tools`.
  A model-less turn, so middleware, `permissions()`, and durable steps apply.
- **`systemPreamble`** on server-side `session.prompt()` (per-run context
  injection; clients cannot set it) + live
  `threadId`/`runId` in tool execution context.
- **`createSessionView`**: a live TanStack Store view of a session for any UI,
  with a pure reducer and `selectGoal`.
- **Remote reads**: `session.transcript()`, `session.describe()`, plugin state in
  snapshots; client `answer` / `command` / `setConfig` + connection state.
- **Goal plugin**: keeps working until a goal is met.
- **`codingAgents` plugin** (`ai-sandbox`): delegate to Claude Code, Codex, and
  other coding agents; child work shows in the CLI, ACP, and dashboard.
- **`agentMiddleware`** runs plugin middleware in every agent; `usage()` counts
  the model calls of every agent.

### D. External management

- **Dashboard MCP endpoint** ✅ `/api/mcp`: lists agents, sessions, runs, teams,
  and schedules; reads/writes config; sends/steers/stops messages; answers
  questions; resolves approvals; runs public tools; toggles schedules.
- The endpoint is unauthenticated because this is a local single-user demo.

### E. Not built (consolidated gap list)

- Cross-service trace correlation and OpenTelemetry export.
- Cross-session search and filtering.
- Cached-token pricing and budget **enforcement** (budgets only alert).
- Evals, red-teaming, prompt playground, agent versioning / rollback.
- Multi-user auth, RBAC, SSO, org / workspace model.
- Multi-node deployment and a real database.
- Broadcast to all team members; team-level permission boundary; shared team memory.
- Per-field tool-param forms.
- Polyglot tool face, bridging, install model, hibernation, pricing (pods design doc Phases 5–8).
- One dashboard: the two products don't share a UI yet.

---

## Commits (current hashes on this branch)

Hashes changed when the branch was rebuilt onto the harness stack; these are
the current ones.

| Commit      | What                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------- |
| `9409b06db` | `feat(ai-sandbox, ai-harness)`: `codingAgents` plugin; child agent work in CLI/ACP/dashboard |
| `06595208a` | `feat(ai-harness)`: goal plugin                                                              |
| `8b46a04b6` | `feat(ai-harness)`: `session.transcript()`, `session.describe()`, plugin state in snapshot   |
| `7364ac59f` | `feat(ai-harness)`: remote transcript/describe, client answer/command/setConfig              |
| `3bf4c0c81` | `feat(ai-harness)`: `createSessionView`                                                      |
| `83825af22` | `feat(ai, ai-harness)`: `agentMiddleware`                                                    |
| `47ee22f76` | `feat(ai-harness)`: `usage()` counts every agent's model calls                               |
| `61ce0041f` | `feat(ai-dashboard)`: self-hosted dashboard, `--dashboard`, runnable example                 |
| `d7da6b9a0` | `feat(ai-harness)`: the `@tanstack/ai-harness/ag-ui` bridge subpath                          |
| `c82a5ad45` | `fix(ai-harness)`: coalesce multi-turn operations for strict AG-UI clients                   |
| `de730ecd0` | `feat(examples/agent-dashboard)`: live session view + approval queue (Phase 2)               |
| `b6f39e7dc` | `feat(examples/agent-dashboard)`: control plane — history, spend, config (Phase 3)           |
| `74e45973a` | `feat(examples/agent-dashboard)`: meta-chat over live agent state (Phase 4)                  |
| `be6e9d050` | `feat(examples/agent-dashboard)`: teams reframe (Phase 1) + Alem protocol proposal           |
| `d410e788b` | `feat(ai-harness)`: out-of-band tool invocation + tool visibility                            |
| `2078d29ce` | `feat(examples/agent-dashboard)`: teams Phase 2 — tool registry + injection                  |
| `0eda69e1d` | `feat(ai-harness)`: `systemPreamble` on the prompt op + in-band tool thread id               |
| `fcc699b1f` | `feat(examples/agent-dashboard)`: teams Phase 3 — system tools, channels, pod memory         |
| `7cbb2402e` | `feat(examples/agent-dashboard)`: persist agent + team state on the server                   |
| `51cf847fa` | `fix(examples/agent-dashboard)`: resolved approval no longer resurfaces on reload            |
| `e8d40f36e` | `feat(examples/agent-dashboard)`: move demo controls into a devtools panel                   |
| `1036f8274` | `feat(examples/agent-dashboard)`: Reddit pod — real service + real LLM                       |
| `9b0fd5328` | `feat(examples/agent-dashboard)`: product team-composition UI + default subscriptions        |
| `830c514b9` | `fix(examples/agent-dashboard)`: DM membership + surface pod memory on the team page         |
| `69ba30134` | `feat(examples/agent-dashboard)`: collapsible JSON trees + markdown messages                 |
| `1c54522a6` | `ci`: apply automated fixes                                                                  |
| `97f51c0e8` | `feat(examples/agent-dashboard)`: rehydrate timeline from persisted messages + UI polish     |
| `c1d0169d6` | Merge `origin/main` (2026-10-02)                                                             |

---

## Build history (detail)

### Phase status

- **Phase 1 — AG-UI bridge** ✅ `packages/ai-harness/src/ag-ui.ts`
  - `sessionEventsToAgUi()` (normalizer), `operationToAgUiRun()` (coalesces one
    harness operation → one valid AG-UI run), `createAgUiHandler()` (SSE via
    `@ag-ui/encoder`). Consumable by a bare `@ag-ui/client` `HttpAgent`.
  - Interrupts stay as `RUN_FINISHED.outcome`, usage → `metadata.tanstack.usage`
    (+ conformed to `SpecTokenUsage[]`), subagent attribution preserved, optional
    `tanstack.spend` ticks.
  - 22 unit tests (`tests/ag-ui.test.ts`), changeset, `docs/harness/ag-ui.md`
    (registered in `docs/config.json`). AG-UI pinned at `1.0.0`.
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

### Teams reframe (Phase 1) ✅ `be6e9d050`

A product-model reframe on top of the four-phase build: `hosts → sessions`
becomes **teams → channels**. A team is a group of agents sharing a chat, a tool
registry, and a permission boundary (the design doc calls it a "pod"; the UI noun
is **"team"**). One agent looks like a plain chat; a **second member reveals the
team** — roster appears, per-agent attribution shows up, and both agents' AG-UI
streams merge into one channel. **Dashboard-local only — zero harness/relay
changes.**

- **Key trick:** each member owns its own thread, so `agentId == threadId`.
  Namespacing every projected row id by `agentId` is therefore per-thread, which
  lets the old threadId-keyed `/sessions/$threadId` and `/chat` routes keep
  working **unchanged** while the new `/teams/$teamId` route queries by
  `channelId` and gets the multiplex.
- `src/db/collections.ts` — `teams`/`channels`/`memberships` localOnly
  collections; `channelId`/`agentId` (+ raw `interruptId`) on the existing rows.
- `src/lib/session-controller.ts` — `project(ctx)` namespaces ids
  (`${agentId}:${raw}`) so N members share one channel with no collisions.
- **Part B — `PODS-PROTOCOL-PROPOSAL.md`** (worktree root, for @AlemTuzlak): the
  net-new harness surface Phases 2+ need. Proposal only.
- **Known cosmetic:** `/` runs a live query, so SSR falls back to client
  rendering (`useLiveQuery` has no `getServerSnapshot`).

### Teams Phase 2 — tool registry + injection ✅ `d410e788b`, `2078d29ce`

The dashboard invokes work **deterministically** — scheduled timers, run-now, and
webhooks — with the structured result streaming into the team channel and **zero
LLM tokens** on the trigger path. "The dashboard owns the clock."

- **Harness (additive):** `{ op: 'tool', name, args?, meta? }` runs one
  registered tool with no model turn, publishing `RUN_STARTED`/`TOOL_CALL_*`/
  `RUN_FINISHED` into the feed. `toolVisibility` on `defineHarness` (default
  private). **Rebuild the dist after harness edits** (the example imports the
  built package).
- **Architecture:** trigger via the control plane, observe via a **live feed
  tail** (`/api/tail`, replays then follows live). One `project()`/`ToolCard`
  path for interactive runs, injected tools, timers, and webhooks.
- **Server:** `server/scheduler.ts` (1s interval, lazy-boot),
  `server/injection.ts` (server-owned schedule + webhook registries; idempotent
  jobs; 64KB result cap), `server/cron.ts` (5-field cron + `everySeconds`).
- **Offline** hosts are **simulated** dashboard-side (the example embeds the host).
- **Deviation from doc §4.1:** schedules/webhooks are **server** state because
  the server owns the clock.

### Teams Phase 3 — system tools, channels, pod memory ✅ `0eda69e1d`, `fcc699b1f`

The design doc's **"the pod learns" loop**: a webhook opens a per-PR channel, a
subscribed security agent reviews it, the human corrects it, the correction is
persisted to **pod memory**, and the _next_ PR is handled better — every step a
message or a tool call in the stream, **no hidden state**.

- **Harness (additive):** the `prompt` op gains `systemPreamble?: string[]`;
  server-tool context always carries the live `threadId`/`runId`.
- **System tools (`pod.*`):** `pod.channel_create` / `pod.message_post` /
  `pod.memory_write` / `pod.memory_read` — callable in-band and out-of-band.
- **Memory delivery:** `/api/run` prepends the thread's pod memory as a
  `systemPreamble` on every run.
- **Dynamic channels + subscriptions:** `channels` gains `kind`/`topic`/
  `createdBy`; `channelMembers` (per-channel opt-in) vs the team roster.
- **Deviations (deliberate):** the watcher opens a review channel it does **not**
  join; pod memory is keyed by `threadId`; `pod.*` are excluded from run-now.

### Persistence ✅ `7cbb2402e`, `51cf847fa`

- **`src/server/store.ts`** — one JSON snapshot file, written through on every
  mutation (debounced, atomic tmp+rename) and replayed on boot.
- **Team roster** persisted as a server blob (`GET|POST /api/roster`), seeded on
  app load.
- **Approval replay fix** (`51cf847fa`): `/api/tail` sends a snapshot frame and
  flags history `replay: true`, so a resolved approval doesn't come back on reload.

### Demo controls — devtools panel ✅ `e8d40f36e`

Demo-only scaffolding lives in a custom **Demo Controls** TanStack DevTools
panel. It renders outside the route tree and re-derives state from the same live
TanStack DB collections (via a `uiState` row) — a state-management stress test.
`TanStackDevtools` sits inside `QueryClientProvider`; `VITE_E2E=1` opens it on load.

### Reddit pod — real service, real AI ✅ `1036f8274`

- **`reddit/fetcher`** (no LLM) — `reddit.search_react_news` reads Reddit's
  public **RSS (Atom)** feed. Parser unit-tested against a recorded fixture.
- **`sentiment/react`** — `anthropicText('claude-haiku-4-5')`, gated on
  `ANTHROPIC_API_KEY`. Real LLM only (no product mock); deterministic double
  under `VITE_E2E`.
- **`tool_result` subscription** — the fetcher's result triggers the sentiment
  agent with a capped (≤10-item) batch.
- **Live findings:** (1) real digest + memory writes work; (2) dotted `pod.*` tool
  names 400 on Anthropic/OpenAI (`^[a-zA-Z0-9_-]{1,128}$`) — worked around with a
  provider-safe `remember` tool; **follow-up:** sanitize names in the adapter or
  rename to `pod_*`; (3) Reddit `.json` is IP-blocked from some egress, so RSS.

### Product team-composition UI ✅ `9b0fd5328`, `830c514b9`

- Home is an agents table with **Add to team**; team page has **＋ Add agent**
  and per-agent **🔧 tools** (RunToolDialog, JSON params).
- `DEFAULT_SUBSCRIPTIONS` by harness so hand-composed teams react.
- Fixed: roster ▶ run sent a triage prompt to any agent; subscribe toggle set a
  hardcoded sub; DMs created with no members (Zod stripped `members`); pod
  memory only visible in the devtools panel.

### Rendering + rehydration ✅ `69ba30134`, `97f51c0e8`

- Tool args/results as collapsible JSON trees (native `<details>`, no new dep);
  assistant text as markdown (`react-markdown` + `remark-gfm`).
- Timeline rebuilt from persisted messages when the feed is empty; `project()`
  honors an event's `channelId`; long trigger prompts collapse; memory panel
  layout; shared `TrashIcon` for deletes.

## Run it

```bash
# from the worktree root
pnpm install
pnpm --filter @tanstack/ai-harness build     # dashboard imports the built dist

pnpm --filter agent-dashboard dev            # http://localhost:3002 (no API key needed)
pnpm --filter agent-dashboard test:e2e       # Playwright

npx @tanstack/ai-dashboard --port 8790       # the self-hosted remote control
```

Demo: on the home page, **Add to team** an agent. Open the **Demo Controls**
devtools panel (bottom-left) → **Start triage demo** → approve the drafted reply
mid-run → **＋ Add agent** to reveal the roster. In **Automations**, run
`fetch_stats` now, add a schedule, or send a test webhook. Then try **Meta-chat**, **History**, **Spend**, **Config**.

PR-watcher: **+ PR-watcher demo** → **Send PR webhook**. A `#pr-…` channel opens
and the security agent flags the PR; reply **"not a security problem — we're
intranet-only here"**, watch it write pod memory, then **Send PR webhook** again.

Reddit pod: **+ React-news demo** → **🔧 tools** → run
`reddit.search_react_news` (or schedule it). Set `ANTHROPIC_API_KEY` before
`dev` for a live digest.

## Verification

- `examples/agent-dashboard`: **21 Playwright e2e** (approval mid-run, config,
  spend, history + replay, meta-chat, teams, injection, PR-watcher loop, DM,
  memory panel, persistence + approval replay, Reddit pod, trace, controls,
  product automations, MCP, session tools); vitest for the RSS parser.
- `@tanstack/ai-dashboard`: **4 vitest** (relay, child-agent blocks).
- After aligning with #1555 (2026-10-09): `pnpm test:pr` (113 projects),
  dashboard e2e (21 passed), and `@tanstack/ai-e2e` (599 passed) all green.

## Deliberate decisions / open questions (flagged for @AlemTuzlak)

- **Chart**: SSR-safe SVG, **not** `@tanstack/react-charts` (0.18 auto-sizing
  loops a ResizeObserver and freezes the main thread).
- **Location**: `examples/agent-dashboard` (no `apps/` dir in the repo).
- **Auth**: local single-user. Multi-user auth beyond pairing/host-token is a follow-up.
- **Spend**: tokens from `session.usage()`, dollars from `@tanstack/ai-models`.
  Budgets are enforced only on the `/api/run` path, and only once set.
- **Wire protocol**: the dashboard uses the native harness routes, not AG-UI.
  `@ag-ui/client` `HttpAgent` cannot read #1555's `POST run` stream (it
  needs `RUN_STARTED` first).

## Known issues

- A tool turn can put an assistant tool call before any user message in the
  transcript.
- The e2e "spend dashboard shows live token usage" flaked twice in about six
  full runs (the answer click did not land). It passes alone and in repeat runs.
