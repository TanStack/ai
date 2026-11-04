---
'@tanstack/ai-sandbox': patch
---

`spawnNdjson` now kills the agent process when the consumer stops reading early. The `save_sandbox_snapshot` tool now gives the abort signal of the call to `snapshots.save`.
