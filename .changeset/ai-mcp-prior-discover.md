---
'@tanstack/ai-mcp': minor
---

Reuse a protocol `2026-07-28` `server/discover` result. `MCPClient.getDiscoverResult()` returns the result of the connection, or the adopted prior. `createMCPClient({ prior })` passes a saved one to the SDK `Client.connect`, so the client skips the `server/discover` request. `DiscoverResult` and `PriorDiscovery` are exported as types.
