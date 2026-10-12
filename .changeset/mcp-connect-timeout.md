---
'@tanstack/ai-mcp': minor
---

`createMCPClient({ requestOptions })` now also applies to the connect handshake. A server that does not answer while it connects fails after `timeout`, not after the SDK default of 60 seconds. If you set a short `timeout` for tool calls, a slow server can now fail at connect. On a `stdio` server, connect can take up to two times `timeout`.
