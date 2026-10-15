---
'@tanstack/ai-harness': minor
'@tanstack/ai-mcp': minor
---

Add out-of-band tool invocation and a per-run system preamble to the harness.

- `session.tool(name, args?, options?)` runs one harness tool with no model
  turn, for example from a schedule or a webhook. The call goes through the
  same middleware, input check, and `permissions()` rules as a model call, and
  the call and its result join the transcript. A tool that asks for approval
  stops the turn with an interrupt. `meta` is echoed as a `tanstack.injection`
  custom event.
- A `{ op: 'tool', name, args?, meta? }` client input runs a tool in the new
  `expose.tools` list; any other tool is refused with `not_exposed`. The
  capabilities document marks each tool with `exposed`.
- `createHarnessMcpServer` adds a `tool_<name>` tool for each tool in
  `expose.tools`.
- `session.prompt(message, { systemPreamble })` prepends per-run,
  server-only system prompts ahead of the harness's own system prompts (for
  example host-provided memory). A client input cannot set them.
