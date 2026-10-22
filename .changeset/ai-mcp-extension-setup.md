---
'@tanstack/ai-mcp': minor
---

Serve and call MCP extensions. `createMCPServer` takes a `setup` function. It gets each SDK `McpServer` before it connects, so a server can declare an extension in `capabilities.extensions` and add handlers for its methods. `MCPClient.request` sends any request with the SDK `Client.request`, including the methods of an extension.
