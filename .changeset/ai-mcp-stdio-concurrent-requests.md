---
'@tanstack/ai-mcp': patch
---

`serveMCPStdio` no longer holds a request behind a running request. A `ping` or a fast tool call sent during a slow tool call now gets its answer at once. Requests still wait for an `initialize` that is in flight, because it sets the session id.
