---
title: Lifecycle Boundaries
id: interrupts-boundaries
order: 5
description: "Pick the point in the chat lifecycle where a generic interrupt pauses the run."
keywords:
  - tanstack ai
  - generic interrupt
  - onInterruptBoundary
  - INTERRUPT_BOUNDARY_PHASES
  - beforeModel
  - afterModel
  - beforeTools
  - afterTools
---

Pause a generic interrupt after the model has a draft and before a tool runs.

Each agent iteration has four boundaries. You pick one with a `ctx.phase` guard
in `onInterruptBoundary`.

This page assumes that you have a definition from
[Generic Interrupts](./generic).

## Quick setup

### 1. Pick a phase

| Phase | When it runs | Use it to |
| --- | --- | --- |
| `beforeModel` | After `onConfig` for this iteration, before the adapter call | Get a choice from the user before you pay for tokens |
| `afterModel` | After the model stream ends, before tools run | Review the draft that the model wrote |
| `beforeTools` | After the assistant tool-call message is in `messages`, before the tools run | Allow or block side effects |
| `afterTools` | After the tools finish and their results are in `messages` | Audit tool results before the model reads them |

### 2. Guard on the phase

Return `{ interrupts }` to pause. Return nothing to let the run continue. This
example pauses at `beforeModel` on the first iteration only:

```ts
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
          payload: {
            title: 'Release plan',
            changes: ['Add search', 'Add tests'],
          },
        }),
      ],
    }
  },
}
```

### 3. Skip the pause on the continuation

Keep the `ctx.parentRunId` guard from step 2. The continuation is a new
`chat()` call, and every boundary hook runs again. If the hook returns the same
request, the run pauses again. `ctx.parentRunId` is set only on a continuation,
so the guard limits the pause to the original request.

## How it works

- The engine collects every request from every middleware at the same phase
  into one interrupt batch.
- That batch ends the current run with one `interrupt` outcome.
- `onInterruptBoundary` can only pause. It cannot change config. To change
  prompts, tools, or messages from the answer, see
  [Apply Answers](./apply-answers).

## Examples for each phase

### `beforeModel`: get a choice first

Ask for a plan, an audience, or a locale before the model writes:

- "Which brand voice must this reply use?"
- "Which ticket do I work on?"
- "Is this request in scope for this agent?"

### `afterModel`: review the draft

The model wrote text, and a human must accept it before tools run:

- Review an email draft before `sendEmail`.
- Review a SQL query before `runQuery`.
- Review a support reply before the user sees it.

### `beforeTools`: gate the side effects

The model asked for tools, and nothing has run yet:

- Confirm a bulk delete.
- Confirm a payment.
- Confirm a deploy.

This is close to [tool approval](./tool-approval). Use a generic interrupt in these cases:

- The question is more than a yes or no on one tool.
- You judge several tools as one batch.

### `afterTools`: audit the results

The tools ran, and a human must see the output before the model uses it:

- A search returned customer PII. Ask if it can stay in context.
- A code run made a diff. Ask if the next turn can apply it.
- A lookup returned a low-confidence match. Ask which record to keep.

## Try it

The React chat example has a playground for all four phases.

1. Start `examples/ts-react-chat`.
2. Open `/generic-interrupts`.
3. Pick a phase and resolve both cards.

## Advanced

### What `ctx` holds

Every hook gets the same `ChatMiddlewareContext`. Its contents change from phase
to phase.

The fields that you use most:

- `phase` and `iteration`.
- `parentRunId`: set on a continuation.
- `messages`: a read-only view.
- `accumulatedContent`: the assistant text for this model turn.
- `context`: your `chat({ context })` value.

Other fields:

- `systemPrompts`, `toolNames`, `hasTools`, `modelOptions`.
- `model` and `provider`, fixed for this request.
- `abort(reason)` and `defer(promise)`.

A change to `ctx.messages` does not change the engine config.

### `beforeModel`

`onConfig` for this iteration has already run. Prompts, tools, messages, and
`modelOptions` hold the values after that merge.

- `accumulatedContent` is empty.
- `messages` is the conversation so far.

### `afterModel`

The model stream is complete.

- `accumulatedContent` has the assistant text for this turn.
- `messages` does **not** include this turn yet.
- The proposed tool calls are not on `ctx`, and they are not in `messages` yet.

If you need tool names or arguments, use `beforeTools`. You can also watch
`onChunk` during `modelStream`.

### `beforeTools`

The engine has added the assistant message with `toolCalls` to `messages`. The
tools have not run. Read the proposed calls here, before any side effect.

### `afterTools`

The tools have run. Result messages with `role: 'tool'` are in `messages`, and
`onToolPhaseComplete` has already run. Read the results here, before the next
model turn.
