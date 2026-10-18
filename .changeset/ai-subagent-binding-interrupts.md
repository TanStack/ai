---
'@tanstack/ai': minor
---

Add `interrupts` to `SubagentBinding`.

- A host sets `binding.interrupts` to give interrupt definitions to every `ctx.chat` call of an agent run. Then the host middleware in `chatMiddleware` can stop the child with these interrupts.
- The own `interrupts` of the call win. When a host definition has the same id as one of the call, the host definition is not added.
- A child's `ctx.chat({ subagents })` passes the definitions on to its own children.
- A plain `chat()` call does not get them.
