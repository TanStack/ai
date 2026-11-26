---
'@tanstack/ai': patch
'@tanstack/ai-persistence': patch
---

`withPersistence` now saves `RunRecord.usage` for a run that `subagents.router` owns. The record gets what the children spent, and with `strategy: 'handoff'` main adds its own usage to it.
