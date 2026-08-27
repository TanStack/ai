---
'@tanstack/ai': minor
'@tanstack/ai-compaction': patch
---

Add `ctx.emitCustomEvent` on chat middleware context. The engine yields
`CUSTOM` chunks while hooks such as `onConfig` are still running, so a long
middleware step can send progress before it finishes. Compaction uses this
to emit `compaction:started` before the strategy returns.
