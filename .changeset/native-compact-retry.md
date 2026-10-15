---
'@tanstack/ai-compaction': patch
'@tanstack/openai-base': patch
---

A failed native `compact` is not saved as the checkpoint or the durable compaction record. The next process calls `compact` again. A compact result keeps image files, documents, and audio, and sends those parts back on the next request.
