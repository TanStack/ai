# Agent Dashboard — build status

Spec: `~/Downloads/agent-dashboard-spec.md` (original four phases), then the
**teams reframe** (`~/Downloads/pods-design-doc.md` + `pods-implementation-plan.md`).
Everything below is committed and verified; nothing is pushed.

> **Latest work: the teams reframe (Phase 1).** See the "Teams reframe" section
> below. The original four-phase build still stands underneath it.

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
- **Deferred (behind the Alem review, D2):** injection/timers/webhooks (Phase 2),
  system tools + channels + memory (Phase 3), bounce protection (Phase 4),
  polyglot tool face (Phase 5), bridging (Phase 6), install model (Phase 7),
  hibernation/policy/pricing/versioning (Phase 8).

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
watch both streams share one channel. Then try **Meta-chat**, **History**,
**Spend**, **Config**.

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
