---
title: Operating
id: memory-operating
order: 5
description: "Run memoryMiddleware in production: log recall and save with onRecall and onSave, watch memory in devtools, save without recall, and know what happens when the memory store fails."
keywords:
  - tanstack ai
  - memory
  - middleware options
  - telemetry
  - devtools
  - observability
  - save-only
---

Log what memory recalls, and keep a slow or failed store from failing the chat.

Add the `onRecall` and `onSave` callbacks for your logs, and use the devtools **Memory** tab while you develop. A memory failure never stops the chat.

## Quick setup

### 1. Log recall and save

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const middleware = memoryMiddleware({
  adapter: inMemory(),
  // ctx.threadId is the conversation id. Add userId from your server session.
  scope: (ctx) => ({ threadId: ctx.threadId }),
  onRecall: ({ query, result }) => {
    console.log('recalled', result.fragments?.length ?? 0, 'hits for', query)
  },
  onSave: ({ receipts }) => {
    console.log('saved', receipts.filter((r) => r.ok).length, 'records')
  },
})
```

Add `middleware` to the `middleware` array of your `chat()` call. Then send your metrics client the counts in place of `console.log`.

### 2. Watch memory in devtools

Open the TanStack AI devtools and select the **Memory** tab. For each turn, it shows:

- The recall query.
- The number of recalled fragments.
- The number of characters added to the prompt.
- The recall duration.
- The stored records and facts, for adapters that have `inspect` and `listFacts`. `inMemory()` and `redis()` have both.

See the [Memory Inspector](../getting-started/devtools#memory-inspector) for how server-side memory gets to the panel.

Each request now logs what memory recalled and saved, and the Memory tab shows the same data while you develop.

## How it works

- `onRecall` runs after each recall, with the scope, the query, and the result.
- `onSave` runs after each deferred save, with the scope, the turn, and the write receipts.
- If `recall` throws, the run continues with no memory in the prompt.
- If `save` throws, the turn is not saved. The response is not affected, because the save runs after the stream.

The middleware does not catch errors from your `onRecall` and `onSave` callbacks. Catch errors inside them.

## `memoryMiddleware` options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `adapter` | `MemoryAdapter` | (required) | The backend that `recall` reads from and `save` writes to. |
| `scope` | `MemoryScope \| (ctx) => MemoryScope` | (required) | The isolation scope. Static, or set for each request. The function can be async. |
| `role` | `'recall+save' \| 'save-only'` | `'recall+save'` | `'save-only'` saves turns but does not recall or add to the prompt. |
| `onRecall` | `({ scope, query, result }) => void` | none | Telemetry after each `recall`. |
| `onSave` | `({ scope, turn, receipts }) => void` | none | Telemetry after each deferred `save`. |

## Persist without recalling

Set `role: 'save-only'` to save each turn without reading memory or changing the prompt:

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const middleware = memoryMiddleware({
  adapter: inMemory(),
  scope: (ctx) => ({ threadId: ctx.threadId }),
  role: 'save-only',
})
```

Use it in these cases:

- You want to collect history for a user before you turn on recall.
- A route must record turns but must not change the current answer.

## Advanced

### When recall and save run

- The recall query is the text of the last user message. If there is no user text, recall does not run.
- The middleware keeps the resolved scope for the request, so recall and save use the same scope.
- Save runs only when the turn has both user text and assistant text.
- If `save` throws, the middleware makes one receipt with `ok: false`, and `onSave` still runs with it.

### Devtools events

The middleware emits these events on `aiEventClient` from `@tanstack/ai-event-client`. The devtools panel reads them, and you can subscribe to them yourself.

| Event | When |
| --- | --- |
| `memory:retrieve:started` | Recall starts. |
| `memory:retrieve:completed` | Recall returns, with the fragment count and whether tools were added. |
| `memory:persist:started` | A deferred save starts. |
| `memory:persist:completed` | A save completes, with the receipt count. |
| `memory:error` | `recall` or `save` threw (`phase: 'recall'` or `'save'`). It has `scope` only when the scope was already resolved. If the scope function failed or did not run, `scope` is not there. |

When the adapter has `inspect`, the middleware also emits `memory:snapshot` with the stored records after each save.

### How server memory gets to the browser panel

Server events do not cross to the browser. The middleware adds one `CUSTOM` chunk named `memory:state` to the stream of each turn. The chunk has the recall metrics. When the adapter has `inspect`, it also has a snapshot of the store from the start of the turn. The client devtools bridge in `@tanstack/ai-client` reads it and emits the `memory:*` events in the browser.

The snapshot is taken at the start of the turn, so the save of the current turn shows in the next turn.
