---
'@tanstack/ai': patch
'@tanstack/ai-persistence': patch
---

A subagent run record stores `parentRunId`, `subagentRunId`, and `name`. Each child keeps its full transcript: text, reasoning, tool calls, and tool results. `reconstructChat` uses `listByParentRun` to put each child card back, with nested children and a child that waits for an approval. A later message keeps that link, so the next agent still sees the child text.

Subagent support in a store is optional. `runPersistenceConformance` checks the three link fields and `listByParentRun` only when the store has `listByParentRun`. A store without it passes with no change and no `skipMethods` entry.
