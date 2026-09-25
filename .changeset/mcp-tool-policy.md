---
'@tanstack/ai-mcp': minor
---

Add `toolFilter` and `needsApproval` options to `createMCPClient` (and to each
server entry in `createMCPClients`). Both receive the server's raw tool
definition, so a policy can read `name`, `title`, and `annotations`.

- `toolFilter` hides tools from `tools()` and from `chat({ mcp })`. An explicit
  `tools([defs])` call throws `MCPToolNotFoundError` for a hidden tool.
- `needsApproval` marks auto-discovered tools as needing approval before they
  run.
- `createMcpAppCallHandler` reconnects with the client's `toolFilter`, so an
  MCP Apps widget cannot call a tool that the filter hides.

Both are off by default, so current behavior does not change. The MCP SDK
`Tool` type is re-exported as `McpTool`.

```ts
const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
  toolFilter: (tool) => tool.annotations?.readOnlyHint === true,
})
```
