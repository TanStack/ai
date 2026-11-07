---
'@tanstack/ai-compaction': patch
---

A compaction checkpoint is now reused when the message store gives messages back with their object keys in another order, as PostgreSQL `jsonb` and schema parsing do. `hashMessages` hashes the messages with `stableJson`, so an equal history no longer looks changed and the summarizer does not run again over it. After the upgrade, saved checkpoints, saved usage counts and ready background summaries whose messages were not stored in sorted key order miss until the next compaction replaces them. Each such thread pays for one summarizer run.
