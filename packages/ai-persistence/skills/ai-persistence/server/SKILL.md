---
name: ai-persistence/server
description: >
  Server chat state with withPersistence from @tanstack/ai-persistence.
  Authoritative transcript, run lifecycle, durable interrupts/approvals,
  chatParamsFromRequest, reconstructChat, snapshotStreaming. Use when the
  server owns history, multi-device, or durable tool approvals. NOT client
  localStorage (see ai-core/client-persistence in @tanstack/ai) and NOT
  stream reconnect
  alone.
type: sub-skill
library: tanstack-ai
library_version: '0.0.0'
sources:
  - 'TanStack/ai:docs/persistence/chat-persistence.md'
  - 'TanStack/ai:docs/persistence/overview.md'
  - 'TanStack/ai:docs/persistence/controls.md'
---

# Server Chat Persistence

> Builds on **ai-persistence**. Package: `@tanstack/ai-persistence`.

`withPersistence(persistence)` is a `ChatMiddleware` that writes chat **state**
to a backend: messages, runs, interrupts (optional metadata). It does not
mutate the chunk stream and does not replace delivery durability.

## Setup

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
// Your adapter — see ai-persistence/stores.
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

Always pass `threadId` and `runId` from the client (via
`chatParamsFromRequest` / body helpers). Forward `resume` when the client
resolves pending interrupts.

For dev and tests, `memoryPersistence()` from `@tanstack/ai-persistence` is a
drop-in backend that implements all four stores in process.

## What each store does

| Store        | Role                                    | Required?                                 |
| ------------ | --------------------------------------- | ----------------------------------------- |
| `messages`   | Full model-message transcript load/save | **Yes** for `withPersistence`             |
| `runs`       | Run status, timing, usage, errors       | Optional; needed for interrupt durability |
| `interrupts` | Pending/resolved tool approvals & waits | Optional; **requires** `runs`             |
| `metadata`   | App-owned namespaced key/value          | Optional                                  |

Named shapes: `ChatTranscriptPersistence` (floor), `ChatPersistence` (all four).
**Annotate your factory with one of these**, not with bare `AIPersistence` —
the unparameterized type is the all-optional bag, and `withPersistence` rejects
it because `stores.messages` is possibly `undefined`.

## Authoritative-history contract

- **Non-empty `messages`** seed the authoritative history. On finish,
  persistence **overwrites** the stored thread with the engine's completed
  canonical transcript. Post the complete history, never a delta.
- **Empty `messages`** → middleware **loads** the stored thread and continues.

## When state is written

| Moment             | Writes                                                                 | Best-effort?                     |
| ------------------ | ---------------------------------------------------------------------- | -------------------------------- |
| `onStart`          | Pending turn snapshot (user + history)                                 | Yes — failure does not abort     |
| Interrupt boundary | New interrupts, run → `interrupted`, message snapshot                  | No                               |
| `onFinish`         | Canonical transcript **first**, then run → `completed`, commit resumes | No                               |
| Stream (optional)  | Throttled partial assistant text                                       | Yes if `snapshotStreaming: true` |
| `onError`          | Run → `failed`                                                         | Resumes stay pending             |
| `onAbort`          | Run → `aborted` — **but only sometimes** (see below)                   | Resumes stay pending             |

The canonical transcript already contains the completed terminal assistant
messages. Native-combined output keeps the structured result on its terminal
assistant message. Separate finalization and event-sourced harness output can
preserve plain-text and structured-output assistant messages separately when
those messages use different ids.

```ts
withPersistence(persistence, {
  snapshotStreaming: true,
  snapshotIntervalMs: 1000, // default
})
```

### `onAbort` writes conditionally, not always

A user pressing Stop and a user closing the tab produce the **identical**
connection close, so `onAbort` can never infer intent from the abort alone.
It writes:

- **`'aborted'`** (terminal, with `finishedAt`) when the abort is an explicit
  cancel — `info.cancelRequested === true`, or a durable cancel request found
  via `wasCancelRequested(runs, runId)` (both from `@tanstack/ai`; paired with
  `requestRunCancel`/`RUN_CANCEL_REASON`) — **or** when the run is not
  detachable at all (no sandbox/journal behind it, so there is nothing to
  reattach to).
- **Nothing** when it is a plain disconnect on a **detachable** run (some
  other middleware, e.g. `@tanstack/ai-sandbox`, has provided
  `DetachableRunCapability` from `@tanstack/ai`). The record deliberately
  stays `'running'` — the agent keeps running and a later attach can take it
  over. (The detaching middleware, not `withPersistence`, is what stamps
  `detachedSince`.)

Chat's `onAbort` and generation's `onAbort` (`withGenerationPersistence`) are
**asymmetric on purpose**: a generation job has no journal and no agent loop
to reattach to, so its `onAbort` always writes `'aborted'` unconditionally.
Do not "fix" that asymmetry by making generation conditional, or chat
unconditional — both are correct for what they wrap.

Never build a client, or a persistence backend, that assumes a disconnect
always finalizes the run — for a detachable run it usually does not, and
inventing a `finishedAt` for a still-`'running'` record breaks takeover.
Use `isTerminalRunStatus(status)` (from `@tanstack/ai-persistence`) to test
whether a status is finished, rather than re-listing
`'completed' | 'failed' | 'aborted'` by hand.

Streaming snapshots default **off** (finish is authoritative). Enable only when
partial-output durability is worth extra writes.

Resumes accepted in `onConfig` commit only at a success boundary (interrupt or
finish). A failed run leaves interrupts pending so the same resume batch can
retry.

## Interrupt / resume flow

1. Middleware records pending interrupts and **gates** new input: if pending
   exist, the request must include a matching `resume` batch or `onConfig`
   throws.
2. On valid resume, middleware builds `resumeToolState` and clears
   `config.resume` so the engine does not double-reconstruct from client
   history (server owns transcript).
3. On success boundary, interrupts are marked resolved/cancelled.

## Hydrate a thread for the client (`reconstructChat`)

Server-authoritative clients load history by `threadId` (often `GET`):

```ts
import { reconstructChat } from '@tanstack/ai-persistence'

export async function GET(request: Request) {
  return reconstructChat(persistence, request, {
    // Multi-user: required in production
    authorize: async (threadId, req) => {
      const userId = await sessionUserId(req)
      return userOwnsThread(userId, threadId)
    },
  })
}
```

Returns `{ messages, activeRun, interrupts }`:

- `messages` — UI messages for paint
- `activeRun` — `{ runId }` if a run is still generating (`runs.findActiveRun`)
- `interrupts` — pending human-in-the-loop state for re-prompt

**Without `authorize`, anyone who guesses `?threadId=` gets the transcript.**

## Generation activities

`withGenerationPersistence(persistence)` tracks run records for non-chat
activities (image, audio, TTS, video, transcription). Do not fake
`threadId = requestId` on chat run stores — use the generation helper.

## Common mistakes

### CRITICAL: Posting a message delta as `messages`

Wipes the stored thread down to that delta. Always send full history or `[]`.

### HIGH: Omitting `threadId` / `runId`

Persistence keys and resume need stable ids. Use `chatParamsFromRequest`.

### HIGH: Interrupts without `runs`

`interrupts` requires `runs`; `withPersistence` throws otherwise.

### HIGH: Typing a factory as bare `AIPersistence`

`AIPersistence` defaults to the sparse all-optional bag, so `withPersistence`
and `reconstructChat` reject the value. Return `ChatPersistence` (or
`ChatTranscriptPersistence`) instead.

### MEDIUM: Expecting `withPersistence` to reconnect a dropped stream

That is delivery durability (resumable streams), not state persistence.

## Cross-references

- **ai-persistence** — layers and recommended stack
- **ai-persistence/stores** — implement the store interfaces
- **ai-core/client-persistence** (`@tanstack/ai`) — browser half
- **ai-core/locks** — multi-instance coordination
