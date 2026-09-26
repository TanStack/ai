---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
---

Subagent trees now have limits, and a harness can run agents from code and call other harnesses.

- **`subagents.limits`** in `@tanstack/ai`: `maxDepth`, `maxConcurrent`, `maxCalls`, and `timeoutMs` for the whole tree of children the model starts through tools. The tree shares one budget (`SubagentBudget`), which a child's `ctx.chat({ subagents })` passes on, so a child cannot reset it. A refused start reaches the model as a tool error.
- **`ctx.agents`** in harness plugins: `run`, `start` (with `wake`), and `group` with `onFailure: 'cancel-siblings' | 'collect'`. Every child of a group settles before the group returns.
- **`harnessAgent(harness)`** turns a harness into an agent for `subagents.agents`. `defineHarness` takes an optional `description`.
- A harness applies default limits (`DEFAULT_SUBAGENT_LIMITS`: depth 2, 3 at once, 12 per tree) when `subagents.limits` is not set, and agents started from code count against them.
