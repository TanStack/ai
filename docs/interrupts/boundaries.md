---
title: Lifecycle Boundaries
id: interrupts-boundaries
order: 5
description: "Pick the chat lifecycle phase where a generic interrupt pauses the run."
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

# Lifecycle Boundaries

You know you need a generic interrupt. You do not know which phase to pause
in. If you pause too early, the model has no draft to review. If you pause too
late, a tool has already run.

By the end of this page you can pick one phase from
`INTERRUPT_BOUNDARY_PHASES` and write the `ctx.phase` guard for it.

For the define, register, and resolve steps, see
[Generic Interrupts](./generic).

## The four phases

`onInterruptBoundary` runs at each of these points in one agent iteration.
Return `{ interrupts }` to pause. Return nothing to let the run continue.

| Phase | When it runs | Typical question |
| --- | --- | --- |
| `beforeModel` | After `onConfig` for this iteration, before the adapter call | Do we have enough from the user to spend tokens? |
| `afterModel` | After the model stream ends, before tools run | Is this draft or these tool calls acceptable? |
| `beforeTools` | After the assistant tool-call message is in `messages`, before execution | May these tools run? |
| `afterTools` | After tools finish and their result messages are in `messages` | May these results go back to the model? |

The engine combines every request from every middleware at the same phase into
one interrupt batch. That batch ends the current run with one `interrupt`
outcome.

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

`onInterruptBoundary` cannot change config. It can only pause. To change
prompts, tools, or messages from the user answer, see
[Apply Answers](./apply-answers).

## Skip the pause on the continuation

The continuation is a new `chat()` call. Every boundary hook runs again.

If you return the same request, the run pauses again. If `ctx.parentRunId` is
set, skip the emit. Use that skip when the pause belongs to the original
request only.

```ts ignore
onInterruptBoundary(ctx) {
  if (ctx.phase !== 'beforeModel') return
  if (ctx.parentRunId) return
  return {
    interrupts: [
      reviewPlan.interrupt({
        key: 'initial-plan',
        reason: 'review-required',
        message: 'Review the proposed plan.',
        payload: {
          title: 'Release plan',
          changes: ['Add search'],
        },
      }),
    ],
  }
}
```

## What you can read at each phase

Every hook receives the same `ChatMiddlewareContext`. The **contents** change.

Useful fields on `ctx`:

- `phase` and `iteration`
- `parentRunId` (set on a continuation)
- `messages` (read-only view)
- `systemPrompts`, `toolNames`, `hasTools`, `modelOptions`
- `accumulatedContent` (assistant text for this model turn)
- `model` and `provider` (fixed for this request)
- `context` (your `chat({ context })` value)
- `abort(reason)` and `defer(promise)`

Mutating `ctx.messages` does not change the engine config.

### `beforeModel`

`onConfig` for this iteration has already run. Prompts, tools, messages, and
`modelOptions` are the values after that merge.

- `accumulatedContent` is empty
- `messages` is the conversation so far

Use this phase when you need data **before** you pay for a model call.

### `afterModel`

The model stream is complete.

- `accumulatedContent` has this turn's assistant text
- `messages` does **not** include this turn yet
- Proposed tool calls are not on `ctx`. They are not in `messages` yet

If you need tool names or args, wait for `beforeTools`, or watch `onChunk`
during `modelStream`.

### `beforeTools`

The engine has added the assistant message with `toolCalls` to `messages`.
Tools have not run.

Use this phase to inspect the proposed calls before any side effect.

### `afterTools`

Tools have run. Result messages with `role: 'tool'` are already in
`messages`. `onToolPhaseComplete` has already run.

Use this phase to inspect results before the next model turn.

## Real uses

### `beforeModel`: collect a choice first

Ask for a plan, an audience, or a locale before the model writes.

Examples:

- "Which brand voice should this reply use?"
- "Which ticket should I work on?"
- "Is this request in scope for this agent?"

### `afterModel`: review the draft

The model has written text. You want a human to accept it before tools run.

Examples:

- Review an email draft before `sendEmail`
- Review a SQL query before `runQuery`
- Review a support reply before it reaches the user

### `beforeTools`: gate the side effects

The model asked for tools. Nothing has executed.

Examples:

- Confirm a bulk delete
- Confirm a payment
- Confirm a deploy

This is close to [tool approval](./tool-approval). Use a generic interrupt
when the question is not a yes or no on one tool. Also use it when several
tools must be judged as one batch.

### `afterTools`: audit the results

The tools have already run. You want a human to see the output before the
model uses it.

Examples:

- A search returned customer PII. Ask if it may stay in context
- A code run produced a diff. Ask if the next turn may apply it
- A lookup returned a low-confidence match. Ask which record to keep

## Try it

The React chat example has a playground for all four phases.

1. Start `examples/ts-react-chat`.
2. Open `/generic-interrupts`.
3. Pick a phase and resolve both cards.

When you are ready to apply the answer to prompts or to stop the run, go to
[Apply Answers](./apply-answers).
