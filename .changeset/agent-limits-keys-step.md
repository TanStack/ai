---
'@tanstack/ai': minor
---

Subagent limits, provider keys for agents, and host hooks for agent steps and background agents.

- **`subagents.limits`**: `maxDepth`, `maxConcurrent`, `maxCalls`, and `timeoutMs` for the whole tree of children the model starts through tools. The tree shares one budget (`SubagentBudget`), which a child's `ctx.chat({ subagents })` passes on, so a child cannot reset it. A refused start reaches the model as a tool error.
- **`ctx.keys`** (`ProviderKeys`: `get`, `require`, and `adapter`) finds provider keys in agent code. A host sets them with `SubagentBinding.keys`. Without a host, `ctx.keys` reads each provider's `env` names, and a missing key throws an error that names the env var.
- **`ctx.step.do(name, fn)`** (`AgentStep`). A host can set `SubagentBinding.step` to keep the value of `fn`, so a side effect does not run again when the host runs the agent again. Without a host, `fn` runs each time.
- **`ctx.agents.start()`** (`AgentStarter`, `AgentRunHandle`) starts an agent in the background when a host binds it with `SubagentBinding.agents`. Without a host, it throws.
