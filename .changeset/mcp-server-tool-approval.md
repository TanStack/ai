---
'@tanstack/ai-client': minor
'@tanstack/ai': patch
---

Approvals for tools that only the server knows, such as MCP tools gated with `needsApproval`, now reach `useChat` as `kind: 'server-tool-approval'`, with `toolName`, `toolCallId`, `originalArgs`, and `inputSchema`. `inputSchema` is the tool's JSON Schema, so the UI can label the arguments. The client shows it only when it matches the schema hash the server checks against. Before, they arrived as `generic` interrupts, so the approval UI never rendered them. Call `resolveInterrupt(true)` or `resolveInterrupt(false)` to answer one, or answer all approvals at once with `resolveInterrupts(true)`. Tools with a matching client definition still arrive as typed `tool-approval` items. A server tool whose approval needs a payload still arrives as `generic`.
