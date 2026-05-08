---
'@tanstack/ai-client': patch
---

Fixes a race condition in ChatClient.streamResponse() where this.abortController.signal could reference a stale or null controller by the time it is passed to this.connection.connect()
