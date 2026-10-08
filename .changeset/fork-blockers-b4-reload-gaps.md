---
'@tanstack/ai-harness': minor
---

A reload keeps the background `bash` jobs of the session. Their end notes still reach the model. The jobs stop when the session closes. A reload also removes the `ctx.on` listeners of the old plugins, and the session view reads the commands and the settings again. `ctx.agents.set(agent, { subagent: true })` also gives the model a subagent tool for the agent. `ctx.agents.delete` removes both.
