---
'@tanstack/ai': minor
---

Add an `mcp` option to `chat()` for managing MCP clients directly: `chat({ mcp: { clients, connection, lazyTools, onDiscoveryError } })` discovers the given MCP clients'/pools' tools at run start, merges them into the run, and (by default, `connection: 'close'`) closes them when the run ends — or keeps them warm with `connection: 'keep-alive'`. Also exports `MCPToolSource`, `ChatMCPOptions`, `MCPConnectionPolicy`, and `MCPDuplicateToolNameError` (the error thrown when tools from separate `mcp.clients` entries collide after merging; catchable with `instanceof`).
