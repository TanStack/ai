---
'@tanstack/ai': minor
---

Subagent limits, and provider keys for agents.

- **`subagents.limits`**: `maxDepth`, `maxConcurrent`, `maxCalls`, and `timeoutMs` for the whole tree of children the model starts through tools. The tree shares one budget (`SubagentBudget`), which a child's `ctx.chat({ subagents })` passes on, so a child cannot reset it. A refused start reaches the model as a tool error.
- **`subagents.keys`** and **`ctx.keys`** (`ProviderKeys`: `get`, `require`, and `adapter`). Pass an object by provider id, for example `{ openai: userKey }`, or a function, for example `(provider) => getByokKey(request, provider)`. An agent builds a `keyedAdapter` with `await ctx.keys.adapter(adapter)`. A missing key falls back to the provider's `env` names. When there is no key at all, the call throws an error that names the env var. A child's `ctx.chat({ subagents })` passes the keys on to its own children. Keys that the child sets itself win for those providers.
