---
'@tanstack/ai': minor
---

Add an optional `inputSchema` to `defineAgent`. The agent's tool shows the schema to the model, so the parent model writes the child's input, such as a short brief. `run` gets the checked input as a typed `ctx.input`. A bad input goes back to the model as a tool error, and the child does not start. `inputSchema` needs tool mode: `chat()` throws when `subagents.router` meets an agent that has one. Agents without `inputSchema` do not change.
