# @tanstack/ai-orchestration

Generator-based workflows and orchestrators for TanStack AI. Compose typed agents into multi-step pipelines, pause for human approval, stream state to your UI, and survive process restarts — all using plain `async function*` syntax.

> Status: v0 prototype.

```ts
import {
  defineAgent,
  defineWorkflow,
  approve,
  succeed,
  fail,
} from '@tanstack/ai-orchestration'

const articleWorkflow = defineWorkflow({
  name: 'article',
  agents: { writer, legal, editor },
  run: async function* ({ input, state, agents }) {
    const draft = yield* agents.writer({ topic: input.topic })
    const review = yield* agents.legal({ draft })
    if (review.verdict === 'block') return fail(review.findings.join('; '))

    const decision = yield* approve({ title: 'Publish?' })
    if (!decision.approved) return fail('user denied')

    return succeed({ article: draft })
  },
})
```

## Why generators?

The workflow body is just JavaScript. `if`, `for`, `try/catch`, `await`, `Promise.all` — all work normally. `yield*` is how you call agents, request approvals, run durable side effects.

That keeps the mental model tiny: it's a function. The runtime adds the streaming, type safety, replay, retries, timeouts, and signals.

## What's in the box

- **`defineAgent`** — typed wrapper around any text/JSON producer (typically `chat()`)
- **`defineWorkflow`** — compose agents into a generator function
- **`defineOrchestrator`** / **`defineRouter`** — router-driven loops over agents
- **`step`** — durable side effects with retries, timeouts, idempotency keys
- **`approve`** — human-in-the-loop pauses
- **`waitForSignal`** — pause for arbitrary external events (webhooks, queues)
- **`sleep`** / **`sleepUntil`** — durable delays
- **`now`** / **`uuid`** — deterministic time and ID generation
- **`retry`** — wrap a sub-generator in a retry policy
- **`patched`** — Temporal-style mid-flight workflow migration
- **`succeed`** / **`fail`** — discriminated result helpers
- **`runWorkflow`** + **`parseWorkflowRequest`** — server-side execution
- **`inMemoryRunStore`** — pluggable run state + step log

## Full docs

See the **[Workflows & Orchestrators guide](../../../docs/getting-started/workflows.md)** for a walk-through covering agents, state, approvals, durable primitives, server-side execution, and the React `useWorkflow` hook.

For framework integration:

- React — `useWorkflow` from `@tanstack/ai-react`
- Headless client — `WorkflowClient` from `@tanstack/ai-client`

## Install

```bash
npm install @tanstack/ai-orchestration @tanstack/ai zod
```
