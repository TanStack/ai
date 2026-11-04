---
'@tanstack/ai': patch
---

Stop `chat()` from copying the whole assistant answer on every text chunk. A long reply streamed as small deltas no longer blocks the server for seconds.
