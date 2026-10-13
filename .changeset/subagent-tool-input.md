---
'@tanstack/ai': minor
'@tanstack/ai-persistence': minor
---

**Breaking:** each agent tool takes its arguments in fields. The input of an agent with `inputSchema` moves under `input`: the model sends `{ "input": { "task": "..." } }`, not `{ "task": "..." }`. `ctx.input` in `run` does not change. An agent without `inputSchema` takes the task as text in `prompt`, and the child gets it as the last user message. To update a UI that reads the brief from the tool call, middleware that reads agent tool args, saved threads with a waiting subagent call, and recorded tool calls, see the [subagent tool input migration](https://tanstack.com/ai/latest/docs/migration/subagent-tool-input).

Continue a child. With `withPersistence` on the parent `chat()`, a tool result gives the model the child's `subagentRunId`, and a later call with `sessionId` continues that child from its stored transcript. With a host that sets `subagents.binding.start`, `background: true` starts the child and returns at once. Each agent tool shows `sessionId` and `background` only when the run can use them, and supports the `detach` field of the tool context.

`@tanstack/ai` adds `LoadChildCapability`, `getLoadChild`, and `provideLoadChild`, so a persistence middleware can load a stored child. `withPersistence` in `@tanstack/ai-persistence` provides it: it stores the task of each child's first call and the thread that started it, and loads only the children of the calling thread.
