---
'@tanstack/ai-mcp': minor
---

`createMCPServer` takes an `instructions` option. The server sends it to the client as the MCP `instructions` field, in the `initialize` result on spec 2025 and in the `server/discover` result on spec 2026-07-28. Without it, the server sends no `instructions`.
