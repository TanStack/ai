---
'@tanstack/ai-compaction': minor
'@tanstack/ai-client': patch
'@tanstack/ai-event-client': patch
'@tanstack/ai-devtools-core': patch
---

Show compaction in TanStack AI DevTools. `withCompaction` injects a
`compaction:state` CUSTOM stream event with before/after counts, the token
budget, and dropped vs sent message previews. The chat client re-emits
`compaction:applied`. The AI panel has a Compaction tab and an `onCompact`
step on the iteration.
