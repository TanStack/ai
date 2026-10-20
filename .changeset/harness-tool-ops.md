---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
'@tanstack/ai-mcp': minor
---

Run a harness tool with no model turn, add host records from a client, and add a per-run system preamble.

- `session.runTool({ name, args?, meta?, inputId?, user? })` runs one harness tool with no model
  turn, for example from a schedule or a webhook. The call goes through the
  same middleware, input check, and `permissions()` rules as a model call, and
  the call and its result join the transcript. A tool that asks for approval
  stops the turn with an interrupt. While interrupts wait, the call is refused
  with `pending_interrupts`. `meta` is echoed as a `tanstack.injection` custom
  event. `args` is typed from the input schema of a harness tool.
- `expose.tools` lists the harness tools a client may run with a
  `{ op: 'tool', name, args?, meta? }` input, or with the new
  `client.runTool({ name, args?, meta?, inputId? })`. The list is typed from the harness
  `tools`, and `defineHarness` throws for a name that is not in `tools`. Any
  other tool is refused with `not_exposed`. The capabilities document marks
  each tool with `exposed`.
- `expose.records` lists the host record types a client may add with an
  `{ op: 'append', records }` input, or with the new `client.appendRecords({ records })`.
  A record of another type, or with a `thread` field, is refused with
  `not_exposed`. The session log keeps the records.
- `createHarnessMcpServer` adds a `tool_<name>` tool for each tool in
  `expose.tools`, and an `append` tool when `expose.records` has types. A tool
  input with its own `threadId` field throws when the server is created,
  because MCP uses `threadId` to pick the thread.
- `session.send(message, { systemPreamble })` prepends per-run, server-only
  system prompts ahead of the harness's own system prompts (for example
  host-provided memory). A client input cannot set them.
- A tool call in a harness turn gets `threadId` and `runId` in its execution
  context. `ToolExecutionContext` in `@tanstack/ai` has the two new optional
  fields for a host to set.
