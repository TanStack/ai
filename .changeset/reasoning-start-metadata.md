---
'@tanstack/ai': patch
---

Keep custom metadata from `REASONING_MESSAGE_START` on the assistant `UIMessage`. The thinking text was already kept. Metadata that arrived only on the start event was dropped.
