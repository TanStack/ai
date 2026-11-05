---
'@tanstack/ai-compaction': patch
---

A compaction checkpoint is now reused when the message store gives messages back with their object keys in another order, as PostgreSQL `jsonb` and schema parsing do. `hashMessages` hashes the messages by value, with the keys of every object sorted, so an equal history no longer looks changed and the summarizer does not run again over it. Checkpoints saved before this change miss once, and the next summary replaces them.
