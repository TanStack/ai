---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
---

Adopt the AG-UI interrupt lifecycle for tool approvals, generic responses, and
client-tool execution, with typed bound resolvers, atomic batches, and
structured errors. Interrupts run ephemerally by resuming from the full client
message history in a fresh child run — no persistence required.

This changes native approval and client-tool streams from legacy custom events
to snapshot-plus-`RUN_FINISHED` interrupt outcomes. Deprecated
`pendingInterrupts`, `addToolApprovalResponse`, raw `resumeInterrupts`, and
legacy event readers remain as limited compatibility surfaces for migration;
`addToolResult` remains supported.
