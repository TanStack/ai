---
'@tanstack/ai-client': patch
---

Stop the per-chunk re-render storm on high-frequency streams. A tool call whose arguments arrive as thousands of `TOOL_CALL_ARGS` deltas in one burst (e.g. Code Mode emitting a large generated program) used to patch the snapshot atom and notify every framework `useChat` hook once per chunk, saturating the main thread. Message updates made while a streamed chunk is being processed now coalesce to roughly one snapshot notification per animation frame (`requestAnimationFrame`, falling back to a macrotask off-DOM), so React/Vue/Solid/Svelte re-render a handful of times instead of thousands. Discrete, API-driven changes (`setMessages`, `clear`, `reload`, status/subscription updates) still notify synchronously, and `getSnapshot()` flushes any pending streamed messages so it is never stale. In development, the devtools bridge's per-event full-snapshot emit is likewise coalesced to one per microtask instead of firing after every streamed event.
