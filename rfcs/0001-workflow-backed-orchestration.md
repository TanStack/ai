# RFC 0001: Workflow-backed AI orchestration

- Status: Proposed
- Owners: TanStack AI and TanStack Workflow
- Target package: `@tanstack/ai-orchestration`

## Summary

TanStack AI should use TanStack Workflow as the durable execution layer for
multi-step AI work. TanStack AI should not own a second workflow engine, replay
log, scheduler, lease model, or durable primitive set.

The first package is intentionally small:

- `defineAgent()` describes a typed AI unit.
- `agentMiddleware()` adds `ctx.ai.agent()` to a Workflow handler.
- Agent calls execute as Workflow steps.
- Workflow events can be projected into TanStack AI `StreamChunk` events.
- Hosts can publish that projection to Durable Streams or another delivery log.

The existing `chat()` agent loop remains useful inside one agent call. Workflow
coordinates work across calls, waits, approvals, process restarts, and runtime
drives.

## Motivation

TanStack AI has several adjacent concerns that must stay separate:

1. Model and tool execution.
2. Durable business-process execution.
3. Message, thread, artifact, and interrupt persistence.
4. Reconnectable delivery of live events.

The old orchestration prototype mixed these concerns. It wrapped a Workflow
engine with its own workflow definitions, generator descriptors, store aliases,
request parser, nested workflow behavior, and client API. That duplicated APIs
without resolving ownership.

TanStack Workflow now has the required execution foundation: closure handlers,
durable steps, replay, signals, approvals, timers, retries, step timeouts,
version routing, runtime deadlines, cooperative yielding, leases, sweeping, and
pluggable stores. TanStack AI already has AG-UI events and resumable delivery
streams. The missing layer is a narrow adapter between them.

## Ownership

| Concern                                              | Owner                       |
| ---------------------------------------------------- | --------------------------- |
| Workflow handler and durable state                   | TanStack Workflow           |
| Step replay, retries, timeouts, deterministic values | TanStack Workflow           |
| Signals, durable waits, and workflow approvals       | TanStack Workflow           |
| Runtime deadlines, yielding, leases, sweep, recovery | TanStack Workflow           |
| Agent definition and model-facing ergonomics         | TanStack AI orchestration   |
| `chat()` loop and server/client tool execution       | TanStack AI                 |
| AG-UI event projection                               | TanStack AI orchestration   |
| Message, thread, artifact, interrupt records         | TanStack AI persistence     |
| Event delivery, reconnect, and cursor replay         | TanStack AI durable streams |

Durable execution and durable event delivery are different guarantees. Workflow
decides what work has completed. Durable Streams decides which emitted events a
client can reconnect to.

## Proposed API

```ts
import { chat } from '@tanstack/ai'
import { agentMiddleware, defineAgent } from '@tanstack/ai-orchestration'
import { openaiText } from '@tanstack/ai-openai'
import { createWorkflow } from '@tanstack/workflow-core'
import { z } from 'zod'

const writer = defineAgent({
  name: 'writer',
  input: z.object({ topic: z.string() }),
  output: z.object({ article: z.string() }),
  run: ({ input, abortController }) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: [{ role: 'user', content: `Write about ${input.topic}` }],
      outputSchema: z.object({ article: z.string() }),
      stream: true,
      abortController,
    }),
})

export const article = createWorkflow({
  id: 'article',
  input: z.object({ topic: z.string() }),
})
  .middleware([agentMiddleware()])
  .handler(async (ctx) => {
    const draft = await ctx.ai.agent('draft', writer, {
      topic: ctx.input.topic,
    })

    const review = await ctx.approve({ title: 'Publish this article?' })
    return { draft, approved: review.approved }
  })
```

The async handler and context API is the only workflow authoring model. TanStack
AI will not expose a generator equivalent for these operations. Each durable
primitive has one canonical call shape, which keeps documentation, types, and
generated code aligned. The term "yield" remains reserved for Workflow's
cooperative runtime scheduling behavior.

`ctx.ai` is the package-owned middleware namespace. Workflow core does not need
to reserve every official integration name. A conflicting `ai` extension is a
composition error visible in TypeScript, while Workflow's own fields remain
reserved by core.

The first argument to `ctx.ai.agent()` is the stable Workflow step ID. It is not
an arbitrary batch position. Reordering code across deployed workflow versions
still follows Workflow's normal versioning rules.

## Agent execution semantics

An agent call is one Workflow step.

- Input is validated before the model call.
- The Workflow step signal is linked to the AbortController accepted by
  TanStack AI.
- Stream chunks are emitted live as non-checkpoint Workflow custom events.
- The validated final output becomes the Workflow step checkpoint.
- Replay returns the checkpoint without calling the model again.
- If a worker dies before the checkpoint, recovery may call the model again.

The final point is unavoidable without provider idempotency. This API therefore
offers at-least-once agent execution around a durable checkpoint, not exactly
once model execution. Agent tools with external side effects must continue to
use idempotency keys or separate Workflow steps.

Workflow retries are opt-in through the existing step options. Runtime deadline
handling is automatic because `ctx.ai.agent()` delegates to `ctx.step()`.
Workflow checks the drive budget before starting fresh work. Step timeouts stay
independent and abort the active agent call.

The whole `chat()` loop inside that call is currently one atomic durable unit.
Workflow does not checkpoint between model turns or tools owned by that loop,
and it cannot cooperatively yield until the call returns. This is appropriate
for bounded calls. Long autonomous loops need a later integration that exposes
model turns and side-effecting tools as Workflow operations; the first package
does not claim that guarantee.

## Streaming and replay

Model token chunks do not belong in Workflow's replay checkpoint log. They are
large, transient, and do not make model execution deterministic.

The event path is:

```text
chat() -> ctx.emit() -> Workflow publish hook -> AG-UI projection -> delivery log
```

The package filters inner model `RUN_STARTED` and `RUN_FINISHED` events. The
Workflow run owns the outer AG-UI lifecycle. `createAIEventPublisher()` adapts
Workflow's publish hook for a host transport. `toAIStream()` adapts the direct
`runWorkflow()` iterable.

For a request-bound run, hosts can pass `toAIStream()` through TanStack AI's
durable response helpers, which append before forwarding. Workflow's generic
publish hook is best-effort fan-out rather than a transaction with the step
checkpoint. A background host therefore cannot treat successful token publish
as part of Workflow correctness. The persistence RFC must define reconciliation
and publisher-failure behavior before background token delivery is considered
durable end to end.

A host may assign an AG-UI run ID distinct from the Workflow run ID. The mapper
accepts a stable ID resolver. The Workflow run ID remains the execution key;
the AI run ID remains the client protocol key. Hosts must persist that
correlation when the IDs differ.

Workflow state patches are not projected by default. AI message and artifact
state should come from the AI persistence layer, not from arbitrary Workflow
state. Hosts may opt into Workflow state projection for applications that use
the AG-UI state channel intentionally.

## Approvals and interrupts

Workflow approvals and AI tool approvals are not currently the same object.

For the first release:

- Durable human gates use `ctx.approve()` between agent calls.
- Workflow approval events use namespaced custom AG-UI events.
- An `approval-requested` event emitted inside a `chat()` call fails the agent
  step with a targeted error instead of checkpointing partial output.

The AI RFC follow-up must define whether an AI interrupt is:

1. A persisted AI-domain object resumed through a Workflow signal.
2. A direct projection of a Workflow approval.
3. A protocol envelope that can represent both.

Until then, silently translating one approval model into the other would create
an API that cannot resume reliably.

## Persistence

Workflow stores execution state and checkpoints. It should not become the
canonical message database.

TanStack AI persistence should own:

- threads and messages,
- tool-call and artifact projections,
- interrupt records,
- user-visible run metadata,
- the mapping between AI run IDs and Workflow run IDs.

That persistence layer can consume the same AG-UI projection used by clients.
It must tolerate repeated delivery because transports and recovered steps can
produce duplicate attempts.

## Child workflows

True child workflows are deferred. Wrapping a child run inside `ctx.step()` is
not sufficient: cancellation, parent-child status, signals, leases, and replay
all need first-class runtime semantics.

Composition in the first release uses normal helper functions and agent calls
inside one Workflow definition.

## Alternatives rejected

### Add a generator DSL

Rejected, not deferred. `yield* agents.writer()` would duplicate Workflow's
async context API and every durable primitive without adding a new guarantee.
Maintaining equivalent generator and async forms would split documentation,
examples, type behavior, and generated code while encouraging invalid mixtures
of `await`, `yield`, and `yield*`. It would also overload "yield" when Workflow
already uses that term for cooperative runtime scheduling.

Generator syntax is not planned and will not be added as optional sugar. Any
future proposal would have to demonstrate a required semantic that the async
context API cannot express and replace, rather than duplicate, the canonical
authoring model.

### Let TanStack AI own the workflow store

Rejected. It would fork durability semantics and force every Workflow store
fix to be reimplemented in AI.

### Persist every token in Workflow

Rejected. Token delivery durability belongs in a delivery log. Workflow keeps
only execution checkpoints and coordination records.

### Treat process death as normal retry behavior

Rejected as a complete strategy. Recovery is required, but intentionally
driving into a host timeout increases duplicate model calls, leaves stale
leases until recovery, and loses the chance to stop before starting fresh work.
Workflow deadlines and cooperative yielding reduce that ambiguity.

## Rollout

1. Land Workflow runtime event publishing and stale-lease recovery.
2. Land `@tanstack/ai-orchestration` as experimental.
3. Build one server example using a real Workflow runtime adapter and Durable
   Streams.
4. Define the AI persistence and interrupt contracts in a separate RFC.
5. Add framework client helpers only after the persisted projection is stable.

## Decisions still required

The following do not block the experimental package:

- The public AI persistence interface and database ownership.
- The interrupt envelope and approval mapping.
- Whether AI run IDs are always distinct or only distinct when supplied by a
  host.
- Attempt/reset semantics for token streams after a worker dies mid-agent.
- Backpressure and failure semantics for background event publishers.
- Durable boundaries inside long `chat()` model/tool loops.
- First-class child workflow semantics.
