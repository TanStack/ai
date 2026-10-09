---
'@tanstack/ai-mcp': patch
---

`mcp()` and `mcpConnector` now answer the `elicitation/create` requests of MCP spec 2025 servers. The session asks the user, for form and URL requests. Decline and cancel go back to the server. On spec 2026-07-28, one tool call can now ask up to 5 times. One more request fails the tool call with a clear error.
