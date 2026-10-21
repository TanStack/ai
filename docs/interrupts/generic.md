---
title: Generic Interrupts
id: interrupts-generic
order: 4
description: "Pause the run to ask the user for typed data, even when no tool call caused the question."
keywords:
  - tanstack ai
  - generic interrupt
  - defineInterrupt
  - onInterruptBoundary
  - onInterruptResolution
  - INTERRUPT_BOUNDARY_PHASES
---

Sometimes the server needs an answer from the user, but no tool call asks for
it. For example, the user must review a plan before the model runs.

A generic interrupt pauses the run with a typed question. `defineInterrupt`
describes the data that the client sees and the data that it sends back. The
server and the client register the same definition, so both sides share the
types.

## Quick setup

### 1. Define the interrupt

Put the definition in a module that the route and the client can both import.
The schemas must be able to export JSON Schema:

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

- `payloadSchema`: display data from the server to the client. Optional.
- `responseSchema`: the answer from the client to the server. Required.

### 2. Emit it from middleware

Return the request from `onInterruptBoundary`. Guard on `ctx.phase` to pick
when it runs. If `ctx.parentRunId` is set, return nothing. Without that guard,
the continuation pauses again:

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

To pick a different phase, see [Lifecycle Boundaries](./boundaries).

### 3. Register it on the server

Pass the definitions to `chat({ interrupts })` and the middleware to
`chat({ middleware })`. Forward `parentRunId` and `resume` from the request:

```ts
// app/api/chat/route.ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { requestReview } from '../../chat-middleware'
import { reviewPlan } from '../../interrupts'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    interrupts: [reviewPlan],
    middleware: [requestReview],
  })
  return toServerSentEventsResponse(stream)
}
```

### 4. Resolve it in React

Register the same definitions with `useChat`. Check `kind` and `definitionId`,
then pass the item to a card typed as `GenericInterrupt<typeof reviewPlan>`:

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
        if (interrupt.kind !== 'generic') return null
        if (!('definitionId' in interrupt)) return null
        if (interrupt.definitionId !== reviewPlan.id) return null
        return <ReviewCard key={interrupt.id} interrupt={interrupt} />
      })}
    </>
  )
}
```

### 5. Try it

Send any message. The run stops before the model call and shows the "Release
plan" card. Click Approve. The run continues, and the model answers.

## How it works

- `resolveInterrupt` stages the answer. The client sends one continuation when
  every bound interrupt in the batch is resolved or cancelled.
- Use `cancel()` when the user does not want to give the data.
- The interrupt ends the current AG-UI run with one `RUN_FINISHED` event. Its
  outcome is `interrupt`.
- The answer starts a new run. Its `parentRunId` is the interrupted run, and it
  carries the answer to the registered middleware.

## Read the answer on the server

`onInterruptResolution` runs once at the start of the continuation, after the
client answers. It does not run in the `chat()` call that paused:

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

This hook cannot change prompts, tools, or messages. To use the answer in the
next model call, see [Apply Answers](./apply-answers).

## Try all four phases

The React chat example has a playground for `beforeModel`, `afterModel`,
`beforeTools`, and `afterTools`. Each pause shows two typed cards:
`reviewPlan` and `chooseAudience`.

1. Start `examples/ts-react-chat`.
2. Open `/generic-interrupts`.
3. Pick a phase, resolve both cards, and look at the selected policy.

## Advanced

### Request rules

- `interrupt()` accepts only `key`, `reason`, `message`, `expiresAt`, and
  `payload` (when the definition declares a payload).
- It returns an immutable request.
- Do not put secrets in the payload. The client gets it, and persistence can
  store it.
- Requests from every middleware at the same boundary form one interrupt batch.
- A duplicate definition id in `chat({ interrupts })` fails before the adapter
  starts.

### Boundary phases

`onInterruptBoundary` can run at each value in `INTERRUPT_BOUNDARY_PHASES`:

- `beforeModel`: before the adapter call.
- `afterModel`: after the model stream ends.
- `beforeTools`: before the tools run.
- `afterTools`: after the tool results are in `messages`.

When to use each phase, and what `ctx` holds there, is in
[Lifecycle Boundaries](./boundaries).

### Resume details

- `useChat` sends `parentRunId` and `resume` on the continuation.
- Each generic resume item carries the original request in `metadata`.
- `onInterruptResolution` runs after init `onConfig` and before `onStart`.
  `ctx.phase` is still `'init'`.
- `resumedInterrupts.for(definition)` keeps the response type for that
  definition.
- `resumedInterrupts.all()` reads every registered definition.
  `all(definitionA, definitionB)` narrows the result to those definitions.

Middleware can return `toolResume: 'continue'`, `'cancel'`, or `'stop'`. When
more than one middleware returns a value, `stop` wins over `cancel`, and
`cancel` wins over `continue`.

### External generic interrupts

An external system can emit a standard AG-UI generic interrupt. Without a valid
TanStack binding, the client shows it as `kind: 'unbound'`. It stays visible,
but it has no resolve or cancel method. Then your client never sends a
continuation for a pause that a different system owns. See
[Interrupts from other systems](./overview#interrupts-from-other-systems).

### Related pages

- Mix generic interrupts with tool approvals: [Multiple Interrupts](./multiple).
- Keep an interrupt across a server restart:
  [Chat persistence](../persistence/chat-persistence).
