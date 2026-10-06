---
'@tanstack/ai-mcp': patch
---

Stop advertising list-change subscriptions for static MCP servers and reject `subscriptions/listen` instead of leaving an idle SSE stream open.
