---
'@tanstack/ai': patch
---

A `ChatClient` that only watches a thread (a second tab, with `live: true`) now returns to `ready` after every run. Before, it stayed `streaming` after the second run, because the stream processor ended only the first run it saw.
