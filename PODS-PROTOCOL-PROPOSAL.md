# Pods/Teams — harness protocol proposal (for @AlemTuzlak)

**Status:** proposal · **Date:** 2026-09-26 · **Author:** Jack + Claude Code
**Basis:** `~/Downloads/pods-design-doc.md` (v2) and `pods-implementation-plan.md`

This is a **discussion doc, not a change**. No `packages/ai-harness` or
`packages/ai-dashboard` (relay) code has been touched. Phase 1 of the teams
reframe ships entirely in `examples/agent-dashboard` (dashboard-local
collections). Everything below is the net-new **harness/relay protocol surface**
that Phases 2+ need, grounded in what the current code does and doesn't do, so we
can agree on the shape before writing any of it.

The design doc says "pod"; the dashboard ships the noun **"team"**. Same concept.

## Why this doc exists

Three capabilities the design depends on are not expressible in the harness as it
stands today. Each is core protocol surface, so it needs your review before
implementation. Findings were verified against the current tree (head at the top
of the harness PR stack).

---

## 1. Out-of-band tool invocation (`injectToolCall`)

**Design need.** The dashboard's injection model (design §5.4) calls a single
named tool deterministically, with **no model turn and zero tokens**
(`injectToolCall(pod, tool, args)`), and posts the result to the stream. This is
the *default* trigger path (timers, webhooks, "run now").

**Current reality.** Every tool call originates from a model `chat()` turn. The
input ops are fixed:

```
INPUT_OPS = ['prompt','steer','followUp','resolve','agent','cancel','command','answer','config']
    // packages/ai-harness/src/protocol.ts:37
```

There is no op that runs a registered tool directly. The closest precedent is
plugin **commands** (`session.command(name, input)`, `session.ts:579`), which run
user-initiated actions outside a model turn and return a `Receipt` — this is the
shape to copy.

**Proposal.**
- Add input op `{ op: 'tool', name: string, args: unknown }` to `INPUT_OPS`
  (`protocol.ts:37`) and a case in `applyInput()` (`protocol.ts:119`) that
  resolves the tool, validates `args` against its schema, invokes
  `tool.execute(args)` **without** opening a `chat()` stream, and returns a
  `Receipt` (mirror `executeCommand`).
- Publish the result into the feed under a fresh `operationId` so it renders in
  the stream like any tool result (reuse `OperationImpl`/`SessionFeed`).

**Open questions for you.** Should this reuse the command machinery outright
(register injectable tools *as* commands) rather than a parallel op? What runs the
tool's `needsApproval` gate on the injection path — does an injected tool that
needs approval still raise an interrupt?

## 2. Tool registry + visibility (`public` vs `private`)

**Design need.** A pod tool registry the dashboard can query, with visibility:
`public` tools are pod-invocable (dashboard, other agents, schedules); `private`
tools run only in the owning agent's own runs (design §5.2).

**Current reality.** Tools are static per harness (`HarnessConfig.tools`,
`define.ts:36`), collected per-run from harness + plugins (`session.ts:1080`).
`expose` exists but only for **agents**, not tools:

```
expose?: { agents?: ReadonlyArray<...> }   // define.ts:58
```

`capabilitiesOf()` lists harness-level tool names only (`protocol.ts:197`), with
no visibility concept and no plugin/discovered tools.

**Proposal.**
- Add `expose?: { tools?: ReadonlyArray<string> }` to `HarnessConfig`
  (`define.ts`), defaulting to private (owner-only).
- Add `session.tools()` mirroring `session.commands()` (`session.ts:562`).
- Have `capabilitiesOf()` (`protocol.ts:187`) return the visibility-filtered set,
  so the dashboard registry query and the §1 injection path share one source of
  truth.

## 3. Injection to offline hosts vs. the relay constraint

**Design need.** "Injected tool calls execute on the owning agent's host; offline
hosts use the relay's existing queued-input behavior rather than silent drops"
(design §5.4).

**Current reality — this is a real conflict, flagging it explicitly.** The
offline queue exists, but it is **private** to the relay:

```
const sendToHost = (host, envelope): 'sent' | 'queued' => {
  if (host.streams.size === 0) { host.queue.push({ envelope, expiresAt: ... }); return 'queued' }
  ...
}   // packages/ai-dashboard/src/server.ts:160
```

`sendToHost()` is called only from `/api/sessions/:host/:thread/input` and
`/open`. There is **no external API to enqueue** for an offline host, and the
queue is drained only on the host's `/api/host/stream` reconnect
(`server.ts:253`). So:

- Adding an injection route that reuses the queue **requires modifying the relay**
  (add a route that calls `sendToHost()`), which collides with the hard "don't
  modify the relay" constraint.
- Duplicating the queue outside the relay **does not work**: the relay flushes
  only its own queue on reconnect, so externally-queued frames would never be
  delivered.

**Proposal / decision needed from you.** Pick one:
- **(a)** Accept a minimal, additive relay change: one new frame type
  (`harness.inject`) enqueued through the existing `sendToHost()` path. Smallest
  possible surface; keeps offline semantics correct. (Recommended — the
  constraint exists to protect the relay's protocol, and this is protocol we'd be
  co-designing with you rather than a unilateral edit.)
- **(b)** Keep injection **online-only** for now (dashboard injects only to hosts
  with a live stream; offline injection is deferred). No relay change; weaker
  guarantee.

## 4. Per-event causal metadata (loop-TTL bounce protection)

**Design need.** Bounce protection (design §6.3) leads with a **causal depth
TTL**: every event carries its causal chain and the pod caps reaction depth. That
requires per-event provenance.

**Current reality.** Only operation-level lineage exists — `parentRunId` on turns
for agent resume chains (`session.ts:163`), passed to `chat({ parentRunId })`.
`SessionEvent` itself (`feed.ts`) carries `{ cursor, operationId, event }` — no
`parentEventId`, no `causedByInputId`, no `depth`.

**Proposal.**
- Extend the feed/`SessionEvent` with `parentEventId?`, `causedByInputId?`, and a
  monotonically-increasing `depth` set when an operation is spawned in reaction to
  another event.
- Enforcement (TTL cap, cycle detection, quarantine) stays in the
  dashboard/harness layer per the design; this proposal is only about **carrying**
  the provenance so enforcement is possible later.

**Open question.** Is `parentRunId` enough to derive depth for the agent-to-agent
case, or do we genuinely need event-level parentage (I believe we do, because a
single run reacts to many upstream events)?

---

## Phasing implication

Phases 2–7 of the implementation plan are all gated on §§1–4. Phase 1 (the
dashboard-local teams reframe) is done and needs none of this. Recommend a short
review pass on §§1–3 first (they unblock the injection + registry work in Phase
2), with §4 reviewed alongside Phase 4 (bounce protection).
