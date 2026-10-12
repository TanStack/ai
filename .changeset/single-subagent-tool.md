---
'@tanstack/ai': minor
'@tanstack/ai-persistence': minor
---

One subagent tool. With `subagents: { tool: 'single' }`, the model picks an agent by name in one `subagent` tool (`SubagentToolInput`). An agent with an `inputSchema` takes `input`, and an agent without one takes an optional `prompt`. A `sessionId` continues an earlier child of the same agent, and `background` starts the child through a host's `subagents.binding.start`. The tool also supports the `detach` field of the tool context.

`@tanstack/ai` adds `LoadChildCapability`, `getLoadChild`, and `provideLoadChild`, so a persistence middleware can load a stored child. `withPersistence` in `@tanstack/ai-persistence` provides it: it stores the task of each child's first call and the thread that started it, and loads only the children of the calling thread. A tool result carries `subagentRunId` when the model can continue the child.
