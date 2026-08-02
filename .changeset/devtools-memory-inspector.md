---
'@tanstack/ai-memory': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-client': minor
'@tanstack/ai-devtools-core': minor
---

**Surface server-side memory state in the TanStack AI DevTools.**

The DevTools panel now has a **Memory** tab for any chat wired with
`memoryMiddleware`. It shows, per scope (session), an operations timeline (each
turn's recall — query, fragment count, injected system-prompt size, whether
memory tools were exposed, duration) and the current stored records/facts when
the adapter implements the optional `inspect`/`listFacts` methods.

Because memory runs on the server (whose event bus never reaches the browser),
the middleware transports its state to the panel over the chat stream as a
`memory:state` `CUSTOM` event, which `@tanstack/ai-client`'s devtools bridge
re-emits as browser `memory:*` events — the same pattern generation results use.
The snapshot reflects memory as of the start of each turn; opening the panel
mid-conversation replays the latest state so the tab isn't empty.

- `@tanstack/ai-memory` — `memoryMiddleware` injects a `memory:state` `CUSTOM`
  chunk carrying recall metrics + an `inspect`/`listFacts` snapshot; exports
  `MEMORY_STATE_EVENT` and `MemoryStateEventValue`.
- `@tanstack/ai-event-client` — adds the `memory:snapshot` devtools event.
- `@tanstack/ai-client` — the chat devtools bridge re-emits `memory:*` from the
  transported chunk and replays the last snapshot on `devtools:request-state`.
- `@tanstack/ai-devtools-core` — new Memory tab + per-scope memory store slice.
