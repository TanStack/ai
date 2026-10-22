---
'@tanstack/ai-mcp': minor
---

`createMCPServer({ setup })` gets the `handle` context of the request as its second argument, so an extension handler or an instrumentation hook can read the caller. A spec 2025 session with `sessions: 'memory'` gets the context of the request that opened it.
