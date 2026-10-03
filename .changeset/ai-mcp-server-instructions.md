---
'@tanstack/ai-mcp': minor
---

Add `instructions` to `MCPClient`. It holds the instructions the server sends when the client connects, so a host can put them in the system prompt. It is `undefined` when the server sends none.
