---
'@tanstack/ai': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-client': minor
---

Continue a child. With `withPersistence` on the parent `chat()`, an agent tool result gives the model the child's `subagentRunId`, and a later call of the same agent tool with `sessionId` continues that child from its stored transcript. With a host that sets `subagents.binding.start`, `background: true` starts the child and returns at once. These fields sit next to the agent's own fields, and each agent tool has them only when the run can use them. When the run uses `sessionId` or `background`, that name is reserved: `chat()` throws when an agent's `inputSchema` uses it. An agent without `inputSchema` takes the task as text in `prompt`, and the child gets it as the last user message. Agent tools also support the `detach` field of the tool context.

The card keeps the checked input of an agent with `inputSchema`. On the client, `part.subagent.input` has it, typed from `inputSchema` when the agent declaration goes to `useChat({ subagents })`.

`@tanstack/ai` adds `LoadChildCapability`, `getLoadChild`, and `provideLoadChild`, so a persistence middleware can load a stored child. A provider lists `LoadChildCapability` in `provides`. `withPersistence` in `@tanstack/ai-persistence` provides it: it stores the task of each child's first call and the thread that started it, and loads only the children of the calling thread.
