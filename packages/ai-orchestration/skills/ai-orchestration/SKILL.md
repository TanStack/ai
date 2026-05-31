---
name: ai-orchestration
description: >
  Generator-based workflows and orchestrators for multi-step LLM runs:
  defineAgent wraps a chat() call with input/output schemas, defineWorkflow
  composes agents with yield* (linear), defineOrchestrator adds a routing
  loop (dynamic). approve() pauses for human-in-the-loop with closed-SSE
  resume. retry() handles transient failures. runWorkflow + parseWorkflowRequest
  on the server, useWorkflow / useOrchestration + fetchWorkflowEvents on the
  client. Runs stream AG-UI step events the client renders as a live log.
  inMemoryRunStore is the only built-in store today; durable persistence
  requires re-routing resume requests back to the originating process.
type: core
library: tanstack-ai
library_version: '0.0.1'
sources:
  - 'TanStack/ai:docs/orchestration/overview.md'
  - 'TanStack/ai:docs/orchestration/workflows.md'
  - 'TanStack/ai:docs/orchestration/orchestrators.md'
  - 'TanStack/ai:docs/orchestration/approvals.md'
  - 'TanStack/ai:docs/orchestration/refining-across-runs.md'
  - 'TanStack/ai:docs/orchestration/retries-and-errors.md'
  - 'TanStack/ai:docs/orchestration/run-persistence.md'
  - 'TanStack/ai:docs/api/ai-orchestration.md'
---

> **Note:** This skill builds on `ai-core` and `ai-core/chat-experience`. Orchestration is always layered on top of `chat()`. Read those skills first for the underlying LLM-call surface.

## When to reach for orchestration

`useChat` is right for a single conversation. `chat()` with tools is right for a single LLM call that may loop through tools (the agent loop). Reach for `@tanstack/ai-orchestration` only when there are **multiple distinct LLM steps that need to coordinate** — and the steps either run in a fixed sequence (workflow) or the next step depends on the last (orchestrator).

| Building this                                                              | Use                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| One conversation, one model, optional tool calls in an agent loop          | `chat()` + `useChat` (see ai-core/chat-experience) |
| Multi-step LLM pipeline with a fixed order (A → B → C)                     | `defineWorkflow` (Pattern 1)                       |
| Multi-step run where the next step depends on the previous result          | `defineOrchestrator` (Pattern 2)                   |
| Any of the above, paused mid-run for human approval                        | `approve()` primitive (Pattern 3)                  |
| Carry context from one user submission to the next (refinement, iteration) | `initialize()` + `previousX` input (Pattern 4)     |
| Wrap a flaky step with retry + backoff                                     | `retry()` primitive (Pattern 5)                    |

## Setup

```bash
pnpm add @tanstack/ai-orchestration
```

Peer dependency: `@tanstack/ai`. The provider adapter you're calling (`@tanstack/ai-openai`, `@tanstack/ai-anthropic`, etc.) comes from `chat()` underneath the agents.

## Core Patterns

### Pattern 1: Linear workflow with `defineWorkflow`

Use when the path is known up front and steps are typed.

```typescript
import { defineAgent, defineWorkflow } from '@tanstack/ai-orchestration'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const translate = defineAgent({
  name: 'translate',
  input: z.object({ text: z.string(), target: z.string() }),
  output: z.object({ translated: z.string() }),
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-5.2'),
      outputSchema: z.object({ translated: z.string() }),
      stream: true,
      messages: [
        {
          role: 'user',
          content: `Translate to ${input.target}: ${input.text}`,
        },
      ],
    }),
})

const summarize = defineAgent({
  name: 'summarize',
  input: z.object({ text: z.string() }),
  output: z.object({ summary: z.string() }),
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-5.2'),
      outputSchema: z.object({ summary: z.string() }),
      stream: true,
      messages: [{ role: 'user', content: input.text }],
    }),
})

export const pipeline = defineWorkflow({
  name: 'translate-then-summarize',
  input: z.object({ text: z.string() }),
  output: z.object({ summary: z.string() }),
  agents: { translate, summarize },
  run: async function* ({ input, agents }) {
    const t = yield* agents.translate({ text: input.text, target: 'english' })
    const s = yield* agents.summarize({ text: t.translated })
    return { summary: s.summary }
  },
})
```

`yield*` is the composition operator. `agents.translate({...})` is typed against the schema given to `defineAgent`. Misspelling a field fails the build.

**`run` return shapes accepted by `defineAgent`:**

- `Promise<TOutput>` — non-LLM agents (DB fetch, computation)
- `StructuredOutputStream<TOutput>` from `chat({ outputSchema, stream: true })`
- `AsyncIterable<StreamChunk>` from a raw `chat()` stream — final output parsed from accumulated text
- `{ stream, output }` — manual split

**`run({ input, emit, signal })`** — `signal` is an `AbortSignal`. Pass it directly to APIs that accept one (`fetch(url, { signal })`). For `chat()`, bridge into an `AbortController` (see pitfall #1). The run itself always aborts when the signal fires; bridging just keeps the LLM call from spending tokens after the abort.

### Pattern 2: Orchestrator with router

Use when the next step depends on the previous result. The `router` is a generator returning `{ done: true, output }` or `{ agent, input }` each turn.

```typescript
import { defineOrchestrator, defineRouter } from '@tanstack/ai-orchestration'

const orchestratorConfig = {
  agents: { triage, extractTopics, draftOutline, expandSection },
  input: z.object({ text: z.string() }),
  output: z.object({ sections: z.array(/* ... */) }),
  state: z.object({
    topics: z.array(z.string()).default([]),
    headings: z.array(z.string()).default([]),
    sections: z.array(/* ... */).default([]),
  }),
}

const router = defineRouter(
  orchestratorConfig,
  function* ({ agents, state, lastResult }) {
    // Fold lastResult into state. Without this, state stays empty and
    // triage loops on the same decision forever.
    if (lastResult && typeof lastResult === 'object') {
      const r = lastResult as Record<string, unknown>
      if (Array.isArray(r.topics)) state.topics = r.topics as Array<string>
      if (Array.isArray(r.headings))
        state.headings = r.headings as Array<string>
      if (typeof r.heading === 'string' && typeof r.body === 'string') {
        state.sections.push({ heading: r.heading, body: r.body })
      }
    }

    const decision = yield* agents.triage({
      hasTopics: state.topics.length > 0,
      hasOutline: state.headings.length > 0,
      sectionsRemaining: state.headings.length - state.sections.length,
    })

    if (decision.next === 'done') {
      return { done: true, output: { sections: state.sections } }
    }
    if (decision.next === 'extract-topics') {
      return { agent: 'extractTopics', input: { text: /* input.text */ '' } }
    }
    // ...other branches
    return { done: true, output: { sections: state.sections } }
  },
)

export const orchestrator = defineOrchestrator({
  ...orchestratorConfig,
  name: 'write-article-orchestrator',
  router,
  maxTurns: 20, // default 12
})
```

**Critical:** Fold `lastResult` into `state` at the top of every router turn. The engine dispatches the agent the router picks, but doesn't know which slice of `state` its output belongs in — the router does. Without this fold the router stays blind to its own decisions and loops on the same branch.

`defineRouter(config, router)` is a phantom-config helper — first arg is unused at runtime, only there to capture types so the router gets typed `agents`, `state`, `input`.

`maxTurns` (default 12) protects against runaway routers. Engine throws if the router doesn't return `done` before then.

### Pattern 3: Human-in-the-loop approvals

`approve()` is a yieldable primitive that pauses the run. The engine emits `approval-requested`, persists state, closes the SSE. The client renders the prompt; calling `run.approve(true|false, feedback?)` resumes via a new POST.

```typescript
import { approve, defineWorkflow } from '@tanstack/ai-orchestration'

const implementWithApproval = defineWorkflow({
  // ...
  run: async function* ({ input, agents }) {
    const plan = yield* agents.planner({ spec: input.spec })

    const decision = yield* approve({
      title: `Implement ${plan.files.length} files?`,
      description: plan.files.join(', '),
    })

    if (!decision.approved) {
      throw new Error(
        `Declined${decision.feedback ? `: ${decision.feedback}` : ''}`,
      )
    }
    // Continue implementation...
  },
})
```

Inside an orchestrator router, deny-with-feedback routes back to a refinement step:

```typescript
if (triage.next === 'await-approval') {
  const decision = yield * approve({ title: '...', description: '...' })
  if (decision.approved) {
    return { agent: 'implement', input: { spec: state.spec } }
  }
  // Denied: route back to the spec agent carrying feedback.
  state.pendingFeedback = decision.feedback?.trim() || 'refine the spec'
  return {
    agent: 'spec',
    input: { userMessage: state.pendingFeedback, existingSpec: state.spec },
  }
}
```

Client side:

```tsx
const run = useWorkflow({ connection: fetchWorkflowEvents('/api/feature') })

{
  run.pendingApproval && (
    <ApprovalPrompt
      title={run.pendingApproval.title}
      description={run.pendingApproval.description}
      onApprove={() => run.approve(true)}
      onDeny={(feedback) => run.approve(false, feedback)}
    />
  )
}
```

### Pattern 4: Refinement across separate runs

Each `run.start(...)` is a fresh run on the server. To make a follow-up message refine the previous result, pass the prior output back as input and use `initialize` to seed state.

```typescript
const OrchestratorInput = z.object({
  userMessage: z.string(),
  previousSpec: SpecSchema.optional(),
  previousResult: ResultSchema.optional(),
})

export const orchestrator = defineOrchestrator({
  // ...
  input: OrchestratorInput,
  state: OrchestratorState,
  initialize: ({ input }) => {
    if (input.previousSpec) {
      // Refinement run: pre-populate state so triage sees mid-flow context.
      return {
        lastUserMessage: input.userMessage,
        pendingFeedback: input.userMessage,
        spec: input.previousSpec,
        result: input.previousResult,
        phase: 'review' as const,
      }
    }
    return {
      lastUserMessage: input.userMessage,
      pendingFeedback: input.userMessage,
    }
  },
})
```

Client tracks the most recent finished run and passes `previousX` back:

```tsx
const [carryover, setCarryover] = useState<Carryover | null>(null)

useEffect(() => {
  if (orch.status === 'finished' && orch.state?.spec) {
    setCarryover({ spec: orch.state.spec, result: orch.state.result })
  }
}, [orch.status, orch.state])

const submit = () =>
  orch.start({
    userMessage: input,
    previousSpec: carryover?.spec,
    previousResult: carryover?.result,
  })
```

### Pattern 5: Retry with backoff

```typescript
import { retry, SchemaValidationError } from '@tanstack/ai-orchestration'

const result =
  yield *
  retry(() => agents.parser({ document }), {
    attempts: 3,
    backoff: 'exponential',
    baseDelayMs: 200,
    maxDelayMs: 5000,
    // Don't retry schema violations — re-running the same model with the
    // same prompt won't fix them. Retry only network/rate-limit errors.
    retryOn: (err) => !(err instanceof SchemaValidationError),
  })
```

`retry(fn, options)` reinvokes `fn()` on failure — the underlying generator restarts. Works around agents, nested workflows, or any yieldable.

## Server route

Same shape for workflows and orchestrators:

```typescript
import { toServerSentEventsResponse } from '@tanstack/ai'
import {
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from '@tanstack/ai-orchestration'

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export async function POST(request: Request) {
  const params = await parseWorkflowRequest(request)
  if (params.abort && params.runId) {
    runStore.getLive(params.runId)?.abortController.abort()
    return new Response(null, { status: 204 })
  }
  const stream = runWorkflow({ workflow, runStore, ...params })
  return toServerSentEventsResponse(stream)
}
```

`parseWorkflowRequest` handles all three modes (start / resume / abort). `runWorkflow` returns an `AsyncIterable<StreamChunk>` ready for `toServerSentEventsResponse`.

## Client surface

`useWorkflow` and `useOrchestration` are the **same hook** — alias re-export. Both available from every framework package (`@tanstack/ai-react`, `-solid`, `-vue`, `-svelte`, `-preact`).

```tsx
import { fetchWorkflowEvents, useOrchestration } from '@tanstack/ai-react'

const orch = useOrchestration<TInput, TOutput, TState>({
  connection: fetchWorkflowEvents('/api/feature'),
})

// Fields available:
orch.runId            // server-assigned ID, sent back on resume
orch.status           // 'idle' | 'running' | 'paused' | 'finished' | 'error' | 'aborted'
orch.steps            // Array<WorkflowStep> — every step the engine emitted
orch.currentStep      // the running step, or null
orch.currentText      // live text accumulating in active agent — pipe parsePartialJSON for partial structured output
orch.state            // typed orchestrator state snapshot
orch.output           // final typed output, populated when status==='finished'
orch.error            // { message, code? } on error
orch.pendingApproval  // non-null while paused for approval

orch.start(input)
orch.approve(approved, feedback?)
orch.stop()
```

For vanilla / non-React clients use `WorkflowClient` from `@tanstack/ai-client` directly.

## Common pitfalls

### 1. Forgetting to forward `signal` into `chat()`

`chat()` takes `abortController` (an `AbortController`), not `signal`. Bridge the agent's signal into a controller so a `run.stop()` actually cancels the LLM call instead of just discarding its eventual output:

```typescript
// ❌ Stop fires, but the LLM call keeps running until it finishes naturally.
run: ({ input }) => chat({ adapter, messages })

// ✅ Bridge signal → AbortController.
run: ({ input, signal }) => {
  const abortController = new AbortController()
  if (signal.aborted) abortController.abort()
  else
    signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
  return chat({ adapter, messages, abortController })
}
```

The run itself aborts either way — the engine checks `signal.aborted` on every yield boundary. Bridging just stops the in-flight call from spending tokens before its output is discarded.

### 2. Not folding `lastResult` into state in the router

```typescript
// ❌ Router stays blind to results; triage loops forever.
const decision =
  yield *
  agents.triage({
    /* ... */
  })

// ✅
if (lastResult && typeof lastResult === 'object') {
  const r = lastResult as Record<string, unknown>
  if ('spec' in r) state.spec = r.spec as Spec
}
const decision =
  yield *
  agents.triage({
    /* ... */
  })
```

### 3. Not clearing `pendingFeedback` after the spec agent consumes it

A spec agent that just absorbed feedback will produce a new spec — but if `pendingFeedback` stays set, triage will route back to spec on the next turn against the same note, forever. Clear it the moment it's consumed:

```typescript
if (state.phase === 'scoping' && lastResult?.spec) {
  state.spec = lastResult.spec
  state.pendingFeedback = '' // <-- crucial
}
```

### 4. Assuming a durable `RunStore` makes resume "just work"

Only `inMemoryRunStore` ships today. Pause-and-resume depends on the **live generator handle**, which only the originating process holds. A horizontally-scaled deployment needs either sticky routing back to the originating instance, or an event-sourcing approach that replays past results into a fresh generator to reach the pause point. The `RunStore` interface alone isn't enough — see `docs/orchestration/run-persistence.md`.

### 5. Validating async schemas

Standard Schema async validators aren't supported in v1 — the engine throws if validation returns a `Promise`. Stick to synchronous Zod / ArkType / Valibot validators on `input` and `output`.

### 6. Importing client types from `@tanstack/ai-client` directly

For UI, import from the framework package (`@tanstack/ai-react` / etc.). `@tanstack/ai-client` is for vanilla JS — the framework packages re-export everything plus the hooks.

## Sources

- Workflows & Orchestration overview: `docs/orchestration/overview.md`
- Per-pattern guides: `docs/orchestration/{workflows,orchestrators,approvals,refining-across-runs,retries-and-errors,run-persistence}.md`
- API reference: `docs/api/ai-orchestration.md`
- End-to-end example: `examples/ts-react-chat/src/lib/workflows/orchestrator.ts` plus `routes/api.orchestration.ts` and `routes/orchestration.tsx`
