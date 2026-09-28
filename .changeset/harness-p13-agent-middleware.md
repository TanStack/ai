---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
---

`@tanstack/ai`: the chat middleware context has `subagentName`, the agent name of a child that runs through `ctx.chat`, and `parentSubagentRunId`, the id of the child that started a nested child. `chat()` takes both as options. A child that calls `ctx.chat({ subagents })` now gives its own children the host middleware (`subagents.binding.chatMiddleware` and `generationMiddleware`) before their own, also when the binding has no budget.

`@tanstack/ai-harness`: plugins can contribute `agentMiddleware`, chat middleware for every agent run: subagents the lead model calls (coding agents too), background agents, and their children. It does not run in the lead turn. Put the same middleware in `middleware` and `agentMiddleware` to see every model call. Run plugins' `generationMiddleware` now also reaches the agents of their turn.
