---
'@tanstack/ai-persistence': minor
---

Add an opt-in `includeRuns` option to `reconstructChat`. With it, the response has `runs`: the thread's finished runs with `runId`, `status`, `startedAt`, and `finishedAt`. Use it to show how long each turn took after a reload. It needs a `runs` store that implements `listByThread` (the memory store does).
