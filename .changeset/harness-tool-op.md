---
'@tanstack/ai-harness': minor
'@tanstack/ai-mcp': minor
---

Run one harness tool with no model, for example from a schedule or a webhook.

- `session.tool(name, args?, { meta?, inputId?, principal? })` and the `{ op: 'tool', name, args?, meta? }` client input run the tool as a chat turn. The only model call of that turn asks for the tool. So the call goes through middleware, the final input check, `permissions()`, and durable steps, and the call and its result join the transcript. A tool that asks for approval waits for the answer. `meta` comes back as a `tanstack.injection` custom event.
- A client runs only the tools in the new `expose.tools` of `defineHarness`. Any other tool gets `not_exposed`. Nothing is exposed by default. `capabilitiesOf()` marks each tool with `exposed`.
- `createHarnessMcpServer` adds a `tool_<name>` MCP tool for each tool in `expose.tools`.
