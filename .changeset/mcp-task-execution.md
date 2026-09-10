---
'@tanstack/ai-mcp': minor
---

Support MCP tools that require task-based execution. Task-required tools are now discovered and execute through the MCP SDK's experimental task stream, while optional task tools continue to use ordinary tool calls.

Task execution is gated on the server declaring the tasks capability for `tools/call` — a server that lists a task-required tool without it is skipped by auto-discovery (binding one explicitly throws `MCPTaskRequiredToolError`). Aborting a run now sends a best-effort `tasks/cancel` for an in-flight task, and `MCPClient.callTool` accepts an optional `{ signal }`. Tool discovery follows `tools/list` pagination, is refreshed on `tools/list_changed`, and a direct `callTool` no longer hard-depends on `tools/list` (a failing listing falls back to a plain call) nor changes output-schema validation behavior.
