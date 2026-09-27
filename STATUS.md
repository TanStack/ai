# Agent Dashboard — build status

Spec: `~/Downloads/agent-dashboard-spec.md` (original four phases), then the
**teams reframe** (`~/Downloads/pods-design-doc.md` + `pods-implementation-plan.md`).
Everything below is committed and verified; nothing is pushed.

> **Latest work: server-side persistence** (`66dd71b`) — the dashboard is now
> durable across a restart. See the "Persistence" section below. Teams Phase 3
> and everything under it still stand.

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
| `063245e` | `docs`: add STATUS.md summarizing the agent-dashboard build |
| `9ec1ece` | `feat(examples/agent-dashboard)`: teams reframe (Phase 1) + Alem protocol proposal |
| `9b1db82` | `feat(ai-harness)`: out-of-band tool invocation (`{ op: 'tool' }`) + tool visibility |
| `720660d` | `feat(examples/agent-dashboard)`: teams Phase 2 — tool registry + injection |
| `04639fd` | `feat(ai-harness)`: `systemPreamble` on the prompt op + in-band tool thread id |
| `4101e64` | `feat(examples/agent-dashboard)`: teams Phase 3 — system tools, channels, pod memory |
| `66dd71b` | `feat(examples/agent-dashboard)`: persist agent + team state on the server |

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

## Teams reframe (Phase 1) ✅ `9ec1ece`

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
  (`${agentId}:${raw}`) so N members share one channel with no collisions;
  `joinChannel`/`subscribeMember`, `createTeam`/`addAgentToChannel`,
  `hydrateMember`; back-compat thread-keyed wrappers; interrupt ids de-namespaced
  for resume/control.
- `src/components/channel-view.tsx` + `member-list.tsx`; route
  `src/routes/teams.$teamId.tsx`. Team chrome renders only at ≥2 members.
- `index.tsx` Teams section + "New team"; `__root.tsx` nav Hosts→Teams. Meta is a
  **cross-team operator** — renders inside a channel, keeps its global tools.
- **Part B — `PODS-PROTOCOL-PROPOSAL.md`** (worktree root, for @AlemTuzlak): the
  net-new harness surface Phases 2+ need — out-of-band tool op, injection vs the
  relay's private offline queue (`server.ts:160`, a real conflict flagged), and
  per-event causal metadata. Proposal only; no harness code changed.
- **Verified:** `tsc` + `oxlint` clean; **6 Playwright e2e pass** (the 5 existing,
  unchanged, + new `e2e/team.spec.ts`: second agent reveals the team, both share
  one channel).
- **Known cosmetic:** `/` now runs a live query, so SSR falls back to client
  rendering (`useLiveQuery` has no `getServerSnapshot`) — same class as the other
  live-query routes; page works, tests green.
- **Deferred:** system tools + channels + memory (Phase 3), bounce protection
  (Phase 4), polyglot tool face (Phase 5), bridging (Phase 6), install model
  (Phase 7), hibernation/policy/pricing/versioning (Phase 8).

## Teams Phase 2 — tool registry + injection ✅ `9b1db82`, `720660d`

The dashboard invokes work **deterministically** — scheduled timers, run-now, and
webhooks — with the structured result streaming into the team channel and **zero
LLM tokens** on the trigger path. "The dashboard owns the clock," made concrete.

Note the constraint change from Phase 1: the Alem review is now a **heads-up, not
a gate**, so provisional harness changes ship on `feat/agent-dashboard` (the
`7da107f` AG-UI-bridge precedent).

- **Harness (`9b1db82`, additive):** a new `{ op: 'tool', name, args?, meta? }`
  input runs one registered tool with no model turn — `session.tool()` /
  `executeTool()` modeled on the `command` op. It publishes
  `RUN_STARTED`/`TOOL_CALL_*`/`RUN_FINISHED` into the feed, so injected results
  ride the existing projection path and persist for replay. Tool **visibility**
  (`toolVisibility` on `defineHarness`, default private) — only `public` tools may
  run out-of-band; unknown/private are rejected. 180 harness tests pass. **Rebuild
  the dist after harness edits** (the example imports the built package).
- **Architecture:** trigger via the control plane, observe via a **live feed
  tail** (`/api/tail`, replays then follows live). `channel-view` opens one tail
  per member as the single projector; `runAgent` is trigger-only. Interactive
  runs, injected tools, timers, and webhooks all render through one
  `project()`/`ToolCard` path. Back-compat `/sessions` and `/chat` are unchanged.
- **Server (owns the clock):** `server/scheduler.ts` (1s interval, lazy-boot),
  `server/injection.ts` (`runInjection` → the tool op; server-owned schedule +
  webhook registries; idempotent jobs; 64KB result cap), `server/cron.ts` (5-field
  cron + `everySeconds`). Routes: `api.inject`, `api.schedules`, `api.webhooks`
  (+ `api.webhooks.$token` ingress — a single-segment param so it doesn't shadow
  `/api/webhooks`), `api.tail`, `api.tools` (public-only registry, enforced at
  read time), `api.dev.offline`. Public demo tool `fetch_stats` on triage.
- **Offline** hosts are **simulated** dashboard-side (a pending queue + dev
  toggle) because the example embeds the host — the relay and its private queue
  are untouched.
- **UI:** an Automations panel (public tools + run-now, schedule table,
  send-test-webhook, offline toggle + "host offline — N queued" banner); injected
  tool cards carry a distinct trigger badge.
- **Deviation from the Phase 2 doc §4.1:** schedules/webhooks are **server** state
  (not `localOnly`) because the server owns the clock, so it owns the table.
- **Verified:** `tsc` + `oxlint` clean; **10 Playwright e2e pass** (6 prior + 4
  new: run-now/private-hidden, timer, webhook, offline queue+flush).

## Teams Phase 3 — system tools, channels, pod memory ✅ `04639fd`, `4101e64`

The design doc's **"the pod learns" loop** made concrete: a webhook opens a per-PR
channel, a subscribed security agent reviews it, the human corrects it, the
correction is persisted to **pod memory**, and the *next* PR is handled better —
every step a message or a tool call in the stream, **no hidden state**.

- **Harness (`04639fd`, additive):** the `prompt` op gains `systemPreamble?:
  string[]`, prepended ahead of the harness's own system prompts for one run — the
  seam a trigger uses to attach per-run memory. The server-tool execution
  `context` now always carries the live `threadId`/`runId`, so an **in-band**
  `pod.*` call can resolve its caller (out-of-band already got a flat
  `{ threadId }`). 184 harness tests pass; changeset included.
- **System tools (`pod.*`), dual citizens:** `pod.channel_create` /
  `pod.message_post` / `pod.memory_write` / `pod.memory_read` — public, callable
  in-band during a run *and* out-of-band via `{ op: 'tool' }`. channel_create /
  message_post are **structured intents** the dashboard realizes when it observes
  them on the tail (create the channel / post the message, routed by the result's
  channel id); memory_write mutates a server-side, thread-keyed store
  (`server/memory.ts`, `server/systools.ts`).
- **Memory delivery:** `/api/run` is the memory-attaching run trigger — every run
  (interactive prompt, subscription dispatch, prompt-mode webhook) prepends the
  thread's pod memory as a `systemPreamble`. The platform attaches it; the agent
  author does nothing. `/api/memory` backs the Memory panel.
- **Dynamic channels + subscriptions:** `channels` gains `kind`/`topic`/
  `createdBy`; new `channelMembers` (per-channel opt-in) vs the durable team
  roster; `memberships` gains `teamId` + `subscriptions`. `project()` routes
  system-tool results into channels/messages; client-side dispatch joins
  subscribers and triggers a review on `channel_created`.
- **UI:** channel sidebar, `channel_created` / joined system cards, a per-agent
  Memory panel, and an "N memory entries attached" run badge.
- **Demo:** `ops/pr-watcher` + `security/review` scripted harnesses and a seeded,
  stateful `github.check_pr`; "+ PR-watcher demo" and "Send PR webhook" entry
  points. The security model flags public-internet exposure **unless** its
  attached memory says the deployment is intranet-only.
- **Server learns each thread's harness:** the client passes `harness` on the
  tail/run/inject/webhook calls (`noteThread` adopts it), so a team can mix
  harnesses (watcher, reviewer, meta) instead of defaulting everything to triage.
- **Deviations (deliberate):** the watcher opens a review channel it does **not**
  join (it posts via `pod.message_post`, routed by channel id); pod memory is keyed
  by `threadId` (unique per member, so `teamId` is redundant for the store);
  `pod.*` are excluded from the run-now registry (plumbing, not automations).
- **Verified:** `tsc` + `oxlint` clean; **13 Playwright e2e pass** (10 prior + the
  full §7 loop, DM creation, memory panel add/remove).

## Persistence — durable across a restart ✅ `66dd71b`

The dashboard was all in-process memory; a restart wiped every team. Now state is
durable so you can close the tab, restart the server, and check in on each team.

- **`src/server/store.ts`** — one JSON snapshot file, written through on every
  mutation (debounced, atomic tmp+rename) and replayed on boot. `filePersistence()`
  keeps the in-memory reference backend (so all store-contract semantics are
  inherited), replays the snapshot into it, then mirrors the four chat state stores
  (messages, runs, interrupts, metadata) back to disk. A `FileMap` subclass gives
  the side tables (threads, pod memory, schedules, webhooks) write-through with no
  route changes.
- **Team roster** — teams/channels/memberships are client-only `localOnly`
  collections, so they reset on reload even though the underlying threads persist.
  Persisted as a server blob (`GET|POST /api/roster`), POSTed after each roster
  mutation, seeded on app load (`hydrateRoster` in `__root`).
- **Not persisted:** the in-flight injection queue, the dev offline toggle, and
  inbox/credentials (secrets do not belong in a plaintext file). Single-process,
  single-file; a multi-node dashboard swaps a real DB behind the same seam.
- **Verified:** state round-trips across a fresh process; e2e isolates its state to
  a wiped throwaway file; `tsc` + `oxlint` clean, **13 e2e pass**.

## Run it

```bash
# from the worktree root
pnpm install
pnpm --filter @tanstack/ai-harness build     # dashboard imports the built dist

pnpm --filter agent-dashboard dev            # http://localhost:3002 (no API key needed)
pnpm --filter agent-dashboard test:e2e       # Playwright
```

Demo: **New team** → **Start triage demo** → approve the drafted reply mid-run →
**+ Add agent** to reveal the team roster, then **▶ run** the second member and
watch both streams share one channel. In the **Automations** panel, **run
`fetch_stats` now**, **add a 1s schedule**, **send a test webhook**, or **simulate
the host offline** and watch jobs queue then flush. Then try **Meta-chat**,
**History**, **Spend**, **Config**.

For Phase 3: **+ PR-watcher demo** → **Send PR webhook**. A `#pr-…` channel opens,
the security agent joins and flags the PR; reply **"not a security problem — we're
intranet-only here"**, watch it write pod memory, then **Send PR webhook** again —
the next PR is reviewed cleanly with the memory attached.

## Verification

- `@tanstack/ai-harness`: **184 unit tests pass**; `tsc` / `oxlint` /
  `publint --strict` clean.
- `examples/agent-dashboard`: **13 Playwright e2e pass** (approval mid-run, config
  read/write, spend, history + replay, meta-chat, teams, injection ×4, the PR-watcher
  loop, DM creation, memory panel); `tsc --noEmit` clean.
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
