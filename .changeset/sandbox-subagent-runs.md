---
'@tanstack/ai-sandbox': patch
---

The memory sandbox run store keeps `parentRunId`, `subagentRunId`, and `name` on a run record and adds `listByParentRun`, so `reconstructChat` can rebuild subagent cards from it.
