---
'@tanstack/ai-client': patch
---

Preserve completed client tool results in `ChatClient.reload()` when retrying a failed `addToolResult` follow-up run instead of truncating back to the last user message.
