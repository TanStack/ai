---
'@tanstack/ai': patch
---

Preserve `UIMessage.createdAt` when converting messages to and from `ModelMessage` so persisted transcripts retain their original timestamps.
