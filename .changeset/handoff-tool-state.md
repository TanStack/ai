---
'@tanstack/ai-harness': minor
---

`routing.handoffTool` gets `state` on its context. It is the same function as `ctx.harness.state`, so a custom handoff tool can read and update the shared state of the session.
