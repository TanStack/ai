---
'@tanstack/ai-mcp': minor
---

New `createMCPClient` options:

- `toolName: (tool) => string` sets the name the model sees for each tool. It wins over `prefix`. `metadata.mcp.serverToolName` keeps the server's own name, so `callTool()` and MCP Apps widget calls still reach the tool. Two tools with the same final name throw `DuplicateToolNameError`.
- `requestOptions: { timeout, resetTimeoutOnProgress }` is sent with tool lists, tool calls, resource requests, and prompt requests. The connect handshake, `subscriptions/listen`, and task status polls keep the SDK defaults. A spec 2026 `tools/call` uses `timeout` and gets no progress notifications.
- `toolFilter` also takes a list of server tool names. The client keeps exactly those tools, in list order. A missing or repeated name throws the new `MCPToolFilterError`, which names them and the available tools.

`toolName` and `requestOptions` also work per server in `createMCPClients`, in `mcpConnector`, and in MCP Apps widget calls.

Two default changes:

- A server input schema without `properties` now gets `properties: {}`, and a schema without `type` gets `type: 'object'`. A full schema does not change.
- `metadata.mcp.annotations` is now a frozen copy of the server's annotations, not the server's own object.
