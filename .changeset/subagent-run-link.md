---
'@tanstack/ai': patch
'@tanstack/ai-persistence': patch
---

A subagent run record stores `parentRunId`, `subagentRunId`, and `name`. `reconstructChat` uses `listByParentRun` to put the text of each child back on the parent message. A later message keeps that link, so the next agent still sees the child text.

`runPersistenceConformance` checks those three fields on `createOrResume`. A second call for the same run id does not overwrite them. `listByParentRun` is optional. Declare `runs.listByParentRun` in `skipMethods` when the store omits it.
