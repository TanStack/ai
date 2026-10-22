---
'@tanstack/ai': minor
'@tanstack/ai-persistence': patch
---

Fix `withPersistence` failing to resume an interrupt of a subagent tool call with `Tool <name> is unavailable for interrupt <id>.` The parent run now leaves interrupts its child answers to the child, using the new `ctx.childResumeIds` on the middleware context, and still commits them once the run succeeds.

With `withPersistence`, the resume of a child is server-authoritative:

- The stored interrupt records decide which interrupts a child owns. A resume whose subagent cards claim other interrupts fails with `InterruptResumeValidationError`.
- The child resumes from its stored messages, not from the card the client sent back. `LoadChild` results get an optional `pending` field for this. A middleware that provides `loadChild` must set `pending` for a waiting child, or the agent tool does not resume it.
