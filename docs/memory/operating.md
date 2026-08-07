---
title: Operating
id: memory-operating
order: 5
description: "memoryMiddleware options, onRecall/onSave telemetry, devtools events, non-fatal failures."
keywords:
  - tanstack ai
  - memory
  - middleware options
  - telemetry
  - devtools
  - observability
  - save-only
---

# Operating memory

If memory is already wired → configure options, log activity, and rely on non-fatal failures.

New? [Overview](./overview) · [Quickstart](./quickstart).

## Options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `adapter` | `MemoryAdapter` | required | Backend |
| `scope` | `MemoryScope \| (ctx) => MemoryScope` | required | Isolation |
| `role` | `'recall+save' \| 'save-only'` | `'recall+save'` | Persist without inject |
| `onRecall` | callback | none | After each recall |
| `onSave` | callback | none | After each deferred save |

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const mw = memoryMiddleware({
  adapter: inMemory(),
  scope: (ctx) => ({ threadId: ctx.threadId }),
  role: 'recall+save',
  onRecall: ({ query, result }) => {
    console.log('recalled', result.fragments?.length ?? 0, 'hits for', query)
  },
  onSave: ({ receipts }) => {
    console.log('saved', receipts.filter((r) => r.ok).length, 'records')
  },
})
```

## Persist without recalling

Set `role: 'save-only'` to write turns without reading or injecting memory (build history first, or record-only routes).

## Telemetry

Ship `onRecall` / `onSave` to your metrics client (not only `console.log`). Devtools are for local inspection.

## Devtools

AI DevTools **Memory** tab shows per-turn recall (query, fragment count, chars, duration) and, for adapters with `inspect`/`listFacts` (`inMemory`, `redis`), stored records. See [Memory Inspector](../getting-started/devtools#memory-inspector).

Events on `aiEventClient`:

| Event | When |
|-------|------|
| `memory:retrieve:started` / `:completed` | Recall lifecycle |
| `memory:persist:started` / `:completed` | Deferred save lifecycle |
| `memory:error` | `recall` or `save` threw (`phase`; `scope` if resolved) |

## Failures are non-fatal

A throwing `recall`/`save` emits `memory:error` and continues: empty recall, dropped save. Streaming never blocks. Flaky store degrades memory; it does not kill the chat.

## Next

- [Overview](./overview) · [Adapters](./adapters) · [Custom Adapter](./custom-adapter)
