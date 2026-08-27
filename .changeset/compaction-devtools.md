---
'@tanstack/ai-compaction': minor
'@tanstack/ai-client': patch
'@tanstack/ai-event-client': patch
'@tanstack/ai-devtools-core': patch
---

Show compaction in TanStack AI DevTools. `withCompaction` injects
`compaction:started`, `compaction:state`, and `compaction:ended` CUSTOM
stream events. State includes before/after counts, the token budget, and
dropped vs sent message previews. The chat client re-emits the same three
events. The AI panel has a Compaction tab and started/state/ended steps on
the iteration.
