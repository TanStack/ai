---
'@tanstack/ai': minor
---

A host can add fields to the `ctx` an agent's `run` gets.

- `subagents.binding.extend(ctx)` returns the fields to add. A child's `ctx.chat({ subagents })` passes it down, so the fields reach nested children too.
- `SubagentContextExtension` is an empty interface that `SubagentRunContext` includes. A package augments it to type its fields, for example `ctx.harness` from `@tanstack/ai-harness`. Make each field optional, because a run that a plain `chat()` starts has no host.
