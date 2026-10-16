---
'@tanstack/ai': minor
'@tanstack/ai-persistence': patch
---

Fix `withPersistence` failing to resume an interrupt of a subagent tool call with `Tool <name> is unavailable for interrupt <id>.` The parent run now leaves interrupts its child answers to the child, using the new `ctx.childResumeIds` on the middleware context, and still commits them once the run succeeds.
