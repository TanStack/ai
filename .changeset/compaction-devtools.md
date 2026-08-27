---
'@tanstack/ai-compaction': minor
'@tanstack/ai-client': patch
'@tanstack/ai-event-client': patch
'@tanstack/ai-devtools-core': patch
---

Show compaction in TanStack AI DevTools. `withCompaction` injects a
`compaction:state` CUSTOM stream event with before/after token and message
counts. The chat client re-emits `compaction:applied` so the AI panel can
render an `onCompact` step.
