---
title: Operating
id: memory-operating
order: 5
description: "Run memoryMiddleware in production: configure its options, add onRecall/onSave telemetry, watch recall and save in devtools, and rely on non-fatal failure handling that never breaks a chat run."
keywords:
  - tanstack ai
  - memory
  - middleware options
  - telemetry
  - devtools
  - observability
  - save-only
---

Memory is wired into your `chat()` call. Now you want to see whether it actually recalls
anything, get that activity into your own logs, and know that a slow or broken store
won't take down the chat. This page covers the middleware's options and how to observe
and operate it.

New to memory? Start with the [Overview](./overview) and [Quickstart](./quickstart) first.

## `memoryMiddleware` options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `adapter` | `MemoryAdapter` | (required) | The backend to `recall` from and `save` to. |
| `scope` | `MemoryScope \| (ctx) => MemoryScope` | (required) | Isolation scope, static or derived per request. |
| `role` | `'recall+save' \| 'save-only'` | `'recall+save'` | `'save-only'` persists turns without recalling or injecting. |
| `onRecall` | `({ scope, query, result }) => void` | none | App telemetry after each `recall`. |
| `onSave` | `({ scope, turn, receipts }) => void` | none | App telemetry after each deferred `save`. |

Every option in one place:

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const mw = memoryMiddleware({
  adapter: inMemory(),
  // Function form derives scope per request. `ctx.threadId` is the stable
  // per-conversation id; add `userId` from your server-validated session.
  scope: (ctx) => ({ sessionId: ctx.threadId }),
  role: 'recall+save', // or 'save-only' to persist without injecting
  onRecall: ({ query, result }) => {
    console.log('recalled', result.fragments?.length ?? 0, 'hits for', query)
  },
  onSave: ({ receipts }) => {
    console.log('saved', receipts.filter((r) => r.ok).length, 'records')
  },
})
```

## Persist without recalling

By default the middleware both recalls and saves (`role: 'recall+save'`). Set
`role: 'save-only'` to persist each turn without reading memory back or injecting anything
into the prompt. Use it to build up a user's history before you turn recall on, or on
routes where you want to record turns but not shape the current answer.

## Telemetry with onRecall and onSave

The devtools events below are for watching memory during development. For telemetry that
ships with your app, use the `onRecall` and `onSave` callbacks shown above. `onRecall`
fires after each recall with the query and result, so you can count hits. `onSave` fires
after each deferred save with the write receipts, so you can count writes. Send those to
your metrics client instead of `console.log`.

## Watch it in devtools

The AI DevTools has a **Memory** tab for any chat wired with `memoryMiddleware`. It
shows each turn's recall (query, fragment count, characters injected, recall duration)
and, for adapters that implement `inspect`/`listFacts` (the built-in `inMemory()` and
`redis()` do), the current stored records and facts. See the
[Memory Inspector](../getting-started/devtools#memory-inspector) for what it renders and
how server-side memory reaches the panel.

Under the hood the middleware emits these events on `aiEventClient` (from
`@tanstack/ai-event-client`). The panel reads them, and you can subscribe directly:

| Event | When |
|-------|------|
| `memory:retrieve:started` | Recall begins |
| `memory:retrieve:completed` | Recall returns (fragment count, whether tools were injected) |
| `memory:persist:started` | A deferred save begins |
| `memory:persist:completed` | A save completes (receipt count) |
| `memory:error` | A `recall` or `save` threw (`phase: 'recall'` or `'save'`) |

## Failures are non-fatal

A memory failure never breaks a chat run. A throwing `recall` or `save` emits
`memory:error` and the run continues with degraded memory: recall returns nothing, and a
failed save is dropped. Streaming is never blocked, and a failed save never fails the
turn. This means a flaky store degrades the experience instead of taking down the chat.

## Where to go next

- [Overview](./overview): the `recall`/`save` contract and how a turn flows
- [Adapters](./adapters): every adapter's options, with an example of each
- [Custom Adapter](./custom-adapter): implement `recall`/`save` for a backend that isn't shipped
