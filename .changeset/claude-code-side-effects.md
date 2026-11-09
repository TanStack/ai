---
'@tanstack/ai-claude-code': patch
---

`@tanstack/ai-claude-code` now sets `"sideEffects": false`. A bundler can drop the sandbox, MCP, and Hono modules when an app imports only `translateSdkStream`.
