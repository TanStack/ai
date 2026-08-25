---
'@tanstack/ai-client': patch
---

Prevent pending client tools and a post-stop `addToolResult()` from continuing a chat after `ChatClient.stop()`.
