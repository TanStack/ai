---
'@tanstack/ai': minor
---

Add `interrupts` to `SubagentBinding`.

- A host sets `binding.interrupts` to give interrupt definitions to every `ctx.chat` call of an agent run. Then the host middleware in `chatMiddleware` can stop the child with these interrupts.
- The own `interrupts` of the call win. When a host definition has the same id as one of the call, the host definition is not added.
- A child's `ctx.chat({ subagents })` passes the definitions on to its own children.
- A plain `chat()` call does not get them.

Add `lastChatMiddleware` to `SubagentBinding`. It runs after the own middleware of each `ctx.chat` call of an agent run, so it sees the final model context and tool results. A child's `ctx.chat({ subagents })` passes it on, after the child's own.

Add `validateJsonSchema(schema, value)`. It checks a value against a JSON Schema with `@cfworker/json-schema`, as a tool input is checked, but with no repair. The result has the Standard Schema shape: `{ value }` or `{ issues }`. The root also exports the `StandardSchemaV1` and `StandardJSONSchemaV1` types.

An agent `run` that throws the shape of `MCPInputRequiredError` (`name`, `kind`, `request`) stops the child as `suspended`, as a tool does, and the parent run stops with its interrupt. The interrupt has a generic binding and no tool call. Its id is the `interruptId` of the thrown value, else `mcp_input_<subagentRunId>`, and its message is the error message. The resume runs the child again, and `ctx.resume` has the answer.
