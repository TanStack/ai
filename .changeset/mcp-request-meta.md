---
'@tanstack/ai': minor
'@tanstack/ai-mcp': minor
---

Send request context to MCP servers as `_meta`. Set `requestMeta` on `chat({ mcp })` or `tools()`, or pass `meta` to `callTool`, `readResource`, `getPrompt`, and the MCP Apps call handler.

`createMCPClients().readResource(uri, { serverId })` now reads only from the server with that key.
