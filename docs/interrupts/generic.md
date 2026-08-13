---
title: Generic Interrupts
id: interrupts-generic
order: 4
description: "Ask for typed data from the client during a chat lifecycle boundary."
keywords:
  - tanstack ai
  - generic interrupt
  - defineInterrupt
  - onInterruptBoundary
  - onInterruptResolution
  - INTERRUPT_BOUNDARY_PHASES
---

# Generic Interrupts

Use a generic interrupt when the server needs data from the client but no tool
call caused the request. For example, ask the user to select a plan before the
model runs.

`defineInterrupt` defines the data that the client sees and the data it must
return. Register the same definition with `chat()` and `useChat()`. This gives
both sides the same types.

## Define and emit an interrupt

Put the definition in a module that both the route and the client can import.
The schemas must export JSON Schema.

```ts
// app/interrupts.ts
import { defineInterrupt } from '@tanstack/ai'
import { z } from 'zod'

export const reviewPlan = defineInterrupt({
  id: 'review-plan',
  payloadSchema: z.object({ title: z.string(), changes: z.array(z.string()) }),
  responseSchema: z.object({ approved: z.boolean(), note: z.string().optional() }),
})
```

`payloadSchema` describes display data that travels from the server to the
client. `responseSchema` describes data that travels from the client back to
the server. The display payload is optional. The response schema is required.

Return requests from `onInterruptBoundary`. The hook can run at each value in
`INTERRUPT_BOUNDARY_PHASES`:

- `beforeModel`: before the adapter call
- `afterModel`: after the model stream ends
- `beforeTools`: before tool execution
- `afterTools`: after tool results are in `messages`

Requests from every middleware in the same boundary form one interrupt batch.

Pick the phase with a `ctx.phase` guard. If `ctx.parentRunId` is set, skip
the emit. If you do not, the same pause happens again.

When to use each phase, and what `ctx` contains there, is in
[Lifecycle Boundaries](./boundaries).

```ts
// app/chat-middleware.ts
import type { ChatMiddleware } from '@tanstack/ai'
import { reviewPlan } from './interrupts'

export const requestReview: ChatMiddleware<unknown, typeof reviewPlan> = {
  name: 'request-review',
  onInterruptBoundary(ctx) {
    if (ctx.phase !== 'beforeModel') return
    if (ctx.parentRunId) return
    if (ctx.iteration !== 0) return
    return {
      interrupts: [
        reviewPlan.interrupt({
          key: 'initial-plan',
          reason: 'review-required',
          message: 'Review the proposed plan.',
          payload: { title: 'Release plan', changes: ['Add search', 'Add tests'] },
        }),
      ],
    }
  },
}
```

`interrupt()` accepts only `key`, `reason`, `message`, `expiresAt`, and, when
declared, `payload`. It returns an immutable request. Do not put secrets in the
payload because the client receives it and persistence can store it.

## Register it on the server

Register all definitions on `chat({ interrupts })`. A duplicate definition id
fails before the adapter starts.

```ts
// app/api/chat/route.ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { requestReview } from '../../chat-middleware'
import { reviewPlan } from '../../interrupts'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    state: params.state,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    interrupts: [reviewPlan],
    middleware: [requestReview],
  })
  return toServerSentEventsResponse(stream)
}
```

An interrupt ends the current AG-UI run with one `RUN_FINISHED` event whose
outcome is `interrupt`. Resolving it starts a new run with `parentRunId` set to
the interrupted run. The continuation carries the response to the registered
middleware.

## Resolve it in React

Register the same definitions with `useChat`. A bound generic interrupt has its
definition id, typed display payload, and typed `resolveInterrupt` method.

```tsx
// app/plan-review.tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { GenericInterrupt } from '@tanstack/ai-react'
import { reviewPlan } from './interrupts'

function ReviewCard({
  interrupt,
}: {
  interrupt: GenericInterrupt<typeof reviewPlan>
}) {
  return (
    <article>
      <h2>{interrupt.payload?.title}</h2>
      <button onClick={() => interrupt.resolveInterrupt({ approved: true })}>
        Approve
      </button>
      <button onClick={() => interrupt.cancel()}>Cancel</button>
    </article>
  )
}

export function PlanReview() {
  const { interrupts } = useChat({
    threadId: 'release-42',
    connection: fetchServerSentEvents('/api/chat'),
    interrupts: [reviewPlan],
  })

  return (
    <>
      {interrupts.map((interrupt) => {
        if (
          interrupt.kind !== 'generic' ||
          interrupt.definitionId !== reviewPlan.id
        ) {
          return null
        }
        return <ReviewCard key={interrupt.id} interrupt={interrupt} />
      })}
    </>
  )
}
```

`resolveInterrupt` stages the answer. The client sends one continuation only
after every bound interrupt in the batch is resolved or cancelled. Use
`cancel()` when the user declines to provide data.

## Read resumed values in middleware

`onInterruptResolution` does not run in the `chat()` call that paused. It runs
once at the start of the **next** `chat()` call, after the client answers.

That second call is a new run. `useChat` sends `parentRunId`, `resume`, and
`state['tanstack:interruptContinuation']`. The hook runs after init `onConfig`
and before `onStart`. `ctx.phase` is still `'init'`.

`for(definition)` keeps the response type for that definition. `all()` reads
all registered definitions. `all(definitionA, definitionB)` narrows the
result to those definitions.

```ts
import type { ChatMiddleware } from '@tanstack/ai'
import { reviewPlan } from './interrupts'

export const applyReview: ChatMiddleware<unknown, typeof reviewPlan> = {
  name: 'apply-review',
  onInterruptResolution(_ctx, resumedInterrupts) {
    for (const result of resumedInterrupts.for(reviewPlan)) {
      if (result.status === 'resolved' && !result.response.approved) {
        return { toolResume: 'stop' }
      }
    }
  },
}
```

Middleware can return `toolResume: 'continue'`, `'cancel'`, or `'stop'`.
When more than one middleware returns a value, `stop` wins over `cancel`, and
`cancel` wins over `continue`.

This hook cannot change prompts, tools, or messages. Store the answer on a
capability, then return those fields from `onConfig` when
`ctx.phase === 'beforeModel'`. The full order, plus a working example, is in
[Apply Answers](./apply-answers).

## Try the four lifecycle phases

The React chat example has a playground for `beforeModel`, `afterModel`,
`beforeTools`, and `afterTools`. Each pause shows two typed cards:
`reviewPlan` and `chooseAudience`.

1. Start `examples/ts-react-chat`.
2. Open `/generic-interrupts`.
3. Pick a phase, resolve both cards, and watch the selected policy.

## External generic interrupts

An external system can emit a standard AG-UI generic interrupt. TanStack AI
shows it as `kind: 'unbound'` unless it has a valid TanStack binding. It stays
visible, but it has no resolve or cancel method. This keeps another system from
receiving a continuation that TanStack AI owns.

See [Multiple Interrupts](./multiple) for mixed tool approvals and generic
interrupts. See [Chat persistence](../persistence/chat-persistence) when an
interrupt must survive a restart.

| You want to | Page |
| --- | --- |
| Pick `beforeModel`, `afterModel`, `beforeTools`, or `afterTools` | [Lifecycle Boundaries](./boundaries) |
| Apply the user answer to prompts, tools, or `toolResume` | [Apply Answers](./apply-answers) |
| Mix generic interrupts with tool approvals | [Multiple Interrupts](./multiple) |
