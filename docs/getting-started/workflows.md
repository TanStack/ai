---
title: Workflows & Orchestrators
id: workflows
order: 8
description: "Build multi-step AI workflows and agent orchestrators with @tanstack/ai-orchestration. Generator-based syntax, typed state, approvals, retries, and durable replay."
keywords:
  - tanstack ai
  - ai workflows
  - agent orchestration
  - multi-step ai
  - durable execution
  - approval flow
---

# Workflows & Orchestrators

`@tanstack/ai-orchestration` lets you compose multi-step AI logic — a writer-and-editor pipeline, a triage-then-implement loop, a human-in-the-loop approval flow — out of small typed agents.

The whole library is built around one idea: **write your workflow as a normal async generator function**. Use `yield*` to call agents, `if`/`for`/`await` for everything else, and the engine handles streaming, state, approvals, retries, and durability.

```ts
const articleWorkflow = defineWorkflow({
  name: 'article-workflow',
  agents: { writer, legal, skeptic, editor },
  run: async function* ({ input, state, agents }) {
    const draft = yield* agents.writer({ topic: input.topic })
    const legalReview = yield* agents.legal({ draft })
    if (legalReview.verdict === 'block') return fail('legal issues')

    const decision = yield* approve({ title: 'Publish?' })
    if (!decision.approved) return fail('user denied')

    return succeed({ article: draft })
  },
})
```

That's a full workflow. No DSL, no node-graph builder — just a generator.

## When to reach for this

Use `@tanstack/ai-orchestration` when one `chat()` call isn't enough:

- **Multi-agent pipelines** — writer → reviewer → editor, each with its own prompt and schema
- **Human-in-the-loop** — pause for approval, resume with feedback
- **Triage / routing** — pick the next agent based on prior results (this is the *orchestrator* shape)
- **Long-running work** — survive process restarts, retry transient failures, time out runaway steps
- **Streaming UI** — show progress live as each step runs, with typed state the UI can render

If you only need a single completion or tool call, plain `chat()` is the right tool — workflows are for the *composition* layer above it.

## Workflows vs Orchestrators

`defineWorkflow` and `defineOrchestrator` are the same engine, different vocabulary:

| You have                      | Use                  | Shape                                           |
| ----------------------------- | -------------------- | ----------------------------------------------- |
| A known sequence of steps     | `defineWorkflow`     | `function*() { yield* a; yield* b; yield* c }`  |
| A loop that picks the next agent | `defineOrchestrator` | A `router` that returns `{ agent, input }` each turn |

You can always rewrite an orchestrator as a workflow with an explicit `while` loop. `defineOrchestrator` just gives you a cleaner shape for the "agent decides what to do next" pattern.

## Core concepts

### Agents

An agent is a typed wrapper around `chat()` (or any function that produces text or structured output). It declares its input and output schemas — the engine validates both.

```ts
import { defineAgent } from '@tanstack/ai-orchestration'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const writer = defineAgent({
  name: 'writer',
  input: z.object({ topic: z.string() }),
  output: z.object({
    title: z.string(),
    paragraphs: z.array(z.string()),
  }),
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: ArticleDraft,
      messages: [{ role: 'user', content: input.topic }],
    }),
})
```

The agent's `run` can return any of three shapes — pick whichever fits:

| Return shape                  | When to use                                        |
| ----------------------------- | -------------------------------------------------- |
| `Promise<TOutput>`            | Simple call-and-wait — no streaming                |
| `AsyncIterable<StreamChunk>`  | Stream tokens to the UI; engine parses final JSON  |
| `{ stream, output }`          | Stream chunks AND get a typed promise for the result |

`chat({ stream: true, outputSchema })` returns the third shape, which is why most agents look like the example above.

### Workflow state

Every workflow has typed state that lives across yields. Mutate it like a plain object — the engine snapshots between yields and sends a **JSON Patch** (RFC 6902) to connected clients, so your UI sees state updates live.

```ts
const articleWorkflow = defineWorkflow({
  name: 'article',
  state: z.object({
    phase: z.enum(['drafting', 'reviewing', 'done']).default('drafting'),
    draft: Draft.optional(),
  }),
  agents: { writer, reviewer },
  run: async function* ({ state, agents, input }) {
    state.phase = 'drafting'
    state.draft = yield* agents.writer({ topic: input.topic })

    state.phase = 'reviewing'
    const review = yield* agents.reviewer({ draft: state.draft })

    state.phase = 'done'
    return succeed({ article: state.draft, review })
  },
})
```

Two things matter:

1. **Mutate, don't reassign.** `state.foo = 'bar'` produces a clean diff; `state = newObject` doesn't (the engine watches the object you were given).
2. **Anything between yields is "during" a step.** The next snapshot fires when you `yield`, not when you assign.

### `yield*` is how you call things

Three things use `yield*` inside a workflow body:

| Primitive                        | Returns                          |
| -------------------------------- | -------------------------------- |
| `yield* agents.name(input)`      | The agent's typed output         |
| `yield* approve({ title })`      | `{ approved: boolean, feedback? }` |
| `yield* step('name', async () => ...)` | Whatever your function returns |

Plus the durable primitives (`now()`, `uuid()`, `sleep()`, `waitForSignal()`) — covered below.

The single asterisk matters: `yield agents.x(...)` (no star) silently breaks delegation. The engine only sees descriptors yielded via `yield*` from inside the bound generator.

### `succeed` and `fail`

Workflow outputs are usually a discriminated union — succeeded with data, or failed with a reason. The two helpers save you `as const` boilerplate:

```ts
return succeed({ article: draft })          // { ok: true, article: Draft }
return fail('legal review blocked')          // { ok: false, reason: string }
```

Declare it in your workflow's `output` schema and the engine validates the final return value.

## A worked example: article workflow

A real workflow showing all the pieces together.

```ts
import { z } from 'zod'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  approve,
  defineAgent,
  defineWorkflow,
  fail,
  succeed,
} from '@tanstack/ai-orchestration'

const Draft = z.object({
  title: z.string(),
  paragraphs: z.array(z.string()),
})

const writer = defineAgent({
  name: 'writer',
  input: z.object({ topic: z.string() }),
  output: Draft,
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: Draft,
      stream: true,
      systemPrompts: ['Write a factual three-paragraph article.'],
      messages: [{ role: 'user', content: input.topic }],
    }),
})

const editor = defineAgent({
  name: 'editor',
  input: z.object({ draft: Draft, notes: z.array(z.string()) }),
  output: Draft,
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: Draft,
      stream: true,
      systemPrompts: ['Polish the draft, addressing the notes.'],
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    }),
})

export const articleWorkflow = defineWorkflow({
  name: 'article-workflow',
  input: z.object({ topic: z.string() }),
  output: z.union([
    z.object({ ok: z.literal(true), article: Draft }),
    z.object({ ok: z.literal(false), reason: z.string() }),
  ]),
  state: z.object({
    phase: z.enum(['drafting', 'editing', 'awaiting-approval', 'done']),
    draft: Draft.optional(),
  }),
  initialize: () => ({ phase: 'drafting' as const }),
  agents: { writer, editor },
  run: async function* ({ input, state, agents }) {
    state.draft = yield* agents.writer({ topic: input.topic })
    state.phase = 'editing'

    let current = state.draft
    for (let round = 0; round < 4; round++) {
      state.phase = 'awaiting-approval'
      const decision = yield* approve({ title: 'Publish?' })

      if (decision.approved) {
        state.phase = 'done'
        return succeed({ article: current })
      }
      if (!decision.feedback?.trim()) {
        return fail('user denied')
      }
      current = yield* agents.editor({
        draft: current,
        notes: [decision.feedback],
      })
      state.draft = current
    }
    return fail('too many revision rounds')
  },
})
```

This is roughly 60 lines of plain code that produces a streaming, durable, type-safe, human-approvable article pipeline.

## Running a workflow on the server

A workflow doesn't run itself — your server route does. The shape is symmetric with how `chat()` is served:

```ts
// app/api/workflow/route.ts (or your framework's equivalent)
import { toServerSentEventsResponse } from '@tanstack/ai'
import {
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from '@tanstack/ai-orchestration'
import { articleWorkflow } from '@/workflows/article-workflow'

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 }) // 1h

export async function POST(request: Request) {
  const params = await parseWorkflowRequest(request)

  // Optional: handle stop requests
  if (params.abort && params.runId) {
    runStore.getLive(params.runId)?.abortController.abort()
    return new Response(null, { status: 204 })
  }

  const stream = runWorkflow({
    workflow: articleWorkflow,
    runStore,
    ...params,
  })
  return toServerSentEventsResponse(stream)
}
```

`parseWorkflowRequest` is just a thin extractor — it pulls `input`, `runId`, `approval`, `signal`, `attach`, and `abort` out of the request body. You hand those to `runWorkflow`, which returns an async iterable of AG-UI events.

### The run store

The run store holds in-flight and recently-finished runs. The default `inMemoryRunStore` is process-local — fine for single-instance servers and prototypes. It implements a documented `RunStore` interface so you can plug in a durable backend (Redis, Postgres) later without changing your workflow code.

```ts
inMemoryRunStore({
  ttl: 60 * 60 * 1000, // keep runs for 1h after they finish
})
```

## Consuming a workflow in React

`useWorkflow` mirrors `useChat`. Construct a connection adapter, pass it in, get back state + actions.

```tsx
import { useWorkflow } from '@tanstack/ai-react'
import { fetchWorkflowEvents } from '@tanstack/ai-client'

function ArticleWorkflow() {
  const wf = useWorkflow<
    { topic: string },                // input
    { ok: true; article: Draft } | { ok: false; reason: string }, // output
    ArticleState
  >({
    connection: fetchWorkflowEvents('/api/workflow'),
  })

  return (
    <div>
      <button onClick={() => wf.start({ topic: 'Async generators' })}>
        Run
      </button>

      {wf.status === 'running' && <p>Phase: {wf.state?.phase}</p>}

      {wf.pendingApproval && (
        <div>
          <h2>{wf.pendingApproval.title}</h2>
          <button onClick={() => wf.approve(true)}>Approve</button>
          <button onClick={() => wf.approve(false, 'Tone is off')}>Revise</button>
        </div>
      )}

      {wf.status === 'finished' && wf.output?.ok && (
        <article>{wf.output.article.title}</article>
      )}
    </div>
  )
}
```

The hook gives you, in addition to the typed state:

- `start(input, { runId? })` — kick off a new run
- `attach(runId)` — reconnect to an existing run (e.g. after page reload)
- `approve(approved, feedback?)` — resolve an `approve()` pause
- `signal(name, payload, { signalId? })` — deliver a `waitForSignal()` payload
- `stop()` — abort the run

For Solid, Svelte, and Vue, use the equivalent `useWorkflow` from `@tanstack/ai-solid`, `@tanstack/ai-svelte`, or `@tanstack/ai-vue`. The headless `WorkflowClient` from `@tanstack/ai-client` works anywhere.

## Orchestrators (the router pattern)

When the next step depends on the result of the previous, an orchestrator's `router` is the cleaner shape than a hand-rolled `while` loop.

```ts
import { defineOrchestrator } from '@tanstack/ai-orchestration'

const featureOrchestrator = defineOrchestrator({
  name: 'feature-orchestrator',
  agents: { triage, spec, implement, review },
  state: z.object({ status: z.string() }),
  router: function* ({ agents, turn, lastResult }) {
    if (turn === 0) {
      const decision = yield* agents.triage({ request: '...' })
      return { agent: 'spec', input: { decision } }
    }
    if (turn === 1) return { agent: 'implement', input: lastResult }
    if (turn === 2) return { agent: 'review',    input: lastResult }
    return { done: true, output: lastResult }
  },
})
```

Each turn:

1. The engine calls your router with `lastResult` (the dispatched agent's output from the previous turn).
2. The router returns either `{ agent: 'name', input }` to dispatch, or `{ done: true, output }` to finish.
3. The engine runs that agent and loops.

`maxTurns` (default `12`) caps runaway routers.

### `defineRouter` for type-safe routers outside the orchestrator

If you want to extract the router into its own file or function, `defineRouter` preserves the type inference:

```ts
import { defineRouter, defineOrchestrator } from '@tanstack/ai-orchestration'

const config = { agents: { triage, spec, implement }, input, output, state }

const myRouter = defineRouter(config, function* ({ agents, turn, lastResult }) {
  // `agents.triage(...)` is fully typed here
  return { agent: 'spec', input: {} }
})

defineOrchestrator({ ...config, router: myRouter })
```

## Durable primitives

These are the building blocks beyond agents. Each one is a `yield*` call.

### `step` — run a side effect once, even across restarts

```ts
const data = yield* step('fetch-user', async (ctx) => {
  const res = await fetch('/api/user', {
    headers: { 'Idempotency-Key': ctx.id },
    signal: ctx.signal,
  })
  return res.json()
})
```

The engine persists `data` to the run's step log. If the process crashes and the run resumes (or another instance picks it up), the step is **not re-executed** — the recorded value is replayed. `ctx.id` is a deterministic, per-step identifier you can pass to external systems as an idempotency key.

Options:

- `retry: { maxAttempts, backoff, baseMs, shouldRetry }` — per-step retry policy
- `timeout: 30_000` — abort the attempt after N ms

### `approve` — pause for a human decision

```ts
const decision = yield* approve({
  title: 'Publish this article?',
  description: 'Review the draft before publishing.',
})
if (!decision.approved) return fail('user rejected')
// decision.feedback is an optional free-text field
```

The engine pauses the run, emits an `approval-requested` event, and resumes when the client calls `approve()`.

### `waitForSignal` — pause for an external event

Generic version of approval — wait for *anything* to be delivered.

```ts
const event = yield* waitForSignal<WebhookPayload>('stripe-webhook')
// resumes when the client calls signal('stripe-webhook', payload)
```

### `sleep` and `sleepUntil` — durable delays

```ts
yield* sleep(5 * 60_000)              // five minutes
yield* sleepUntil(new Date('2026-06-01'))
```

Survives process restarts — the engine persists the deadline and resumes the run when it fires.

### `now` and `uuid` — deterministic versions of `Date.now()` and `crypto.randomUUID()`

Use these inside a workflow body. The values are recorded on first execution and replayed on resume, so your generator stays deterministic.

```ts
const id = yield* uuid()
const startedAt = yield* now()
```

### `retry` — retry a sub-generator

```ts
const result = yield* retry(
  () => agents.flakyApi({ ... }),
  { attempts: 3, backoff: 'exponential', baseMs: 200 },
)
```

For per-step retries on a single `step()` call, prefer the `retry` option on `step()` itself — `retry()` is for retrying a whole composed block.

## Migration: changing a workflow already in production

If you have running workflows persisted to the store and you change the workflow code, the engine will refuse to replay a stale run against the new code by default — silent drift across versions is the source of the worst durability bugs.

Two ways to handle it:

**1. Versioned routing** — register multiple versions and route by run:

```ts
import { createWorkflowRegistry } from '@tanstack/ai-orchestration'

const registry = createWorkflowRegistry<typeof articleWorkflowV1>()
  .add(articleWorkflowV1)   // version: 'v1'
  .add(articleWorkflowV2)   // version: 'v2'
  .withDefault('v2')

const workflow = await registry.forRun(runId, runStore)
```

New starts get v2; in-flight v1 runs continue against v1.

**2. Inline patches** — for small additive changes:

```ts
defineWorkflow({
  patches: ['add-cache-step'],
  run: async function* ({ state, agents }) {
    const draft = yield* agents.writer(...)
    if (yield* patched('add-cache-step')) {
      yield* step('cache-draft', () => cache.set(draft.id, draft))
    }
    return succeed({ article: draft })
  },
})
```

Old runs (started before the patch) see `patched(...)` return `false`; new runs see `true`. The engine persists patch decisions positionally so replay alignment stays correct.

## What gets emitted over the wire

The engine emits standard [AG-UI](https://github.com/ai-protocol/ag-ui) events. You usually don't touch these directly — `WorkflowClient` handles them — but it's worth knowing what's there:

| Event             | When                                                    |
| ----------------- | ------------------------------------------------------- |
| `RUN_STARTED`     | Once, at the top of a run                               |
| `STATE_SNAPSHOT`  | Initial state and on attach                             |
| `STATE_DELTA`     | JSON Patch ops whenever state mutates between yields    |
| `STEP_STARTED`    | A step / agent / approval is about to run               |
| `STEP_FINISHED`   | A step / agent / approval finished (with result)        |
| `TEXT_MESSAGE_CONTENT` | Streaming tokens from an agent                     |
| `RUN_FINISHED`    | Terminal — carries the typed workflow output            |
| `RUN_ERROR`       | Terminal — workflow threw, was aborted, or signal raced |
| `CUSTOM`          | `approval-requested`, `run.paused`, etc.                |

## Quick reference

| Need to…                                | Use                                            |
| --------------------------------------- | ---------------------------------------------- |
| Define a callable LLM agent             | `defineAgent({ name, input, output, run })`    |
| Compose agents into a known sequence    | `defineWorkflow({ agents, run })`              |
| Loop over agent choices                 | `defineOrchestrator({ agents, router })`       |
| Extract the router into its own file    | `defineRouter(config, router)`                 |
| Call an agent inside a workflow         | `yield* agents.name(input)`                    |
| Pause for human approval                | `yield* approve({ title })`                    |
| Pause for an external event             | `yield* waitForSignal('name')`                 |
| Run a durable side effect               | `yield* step('name', async (ctx) => ...)`      |
| Get a deterministic time / id           | `yield* now()` / `yield* uuid()`               |
| Sleep durably                           | `yield* sleep(ms)` / `yield* sleepUntil(date)` |
| Discriminated workflow output           | `return succeed({ ... })` / `return fail(reason)` |
| Run a workflow on the server            | `runWorkflow({ workflow, runStore, ...params })` |
| Stream to a React UI                    | `useWorkflow({ connection })`                  |
| Reconnect to an existing run            | `wf.attach(runId)`                             |
| Version a workflow across deploys       | `createWorkflowRegistry()` + `version: 'v2'`   |
| Patch a workflow mid-flight             | `patches: [...]` + `yield* patched('name')`    |

## What's next

- Read the `examples/ts-react-chat/src/routes/workflow.tsx` route for a complete end-to-end demo, including a streaming `DraftPreview` that renders state live.
- The `examples/ts-react-chat/src/routes/orchestration.tsx` route shows the orchestrator + nested-workflow pattern (Claude Code-style spec → approve → implement → review).
- For a pluggable durable run store, implement the `RunStore` interface from `@tanstack/ai-orchestration` against your backend of choice — the in-memory version is one possible implementation, not the contract.
