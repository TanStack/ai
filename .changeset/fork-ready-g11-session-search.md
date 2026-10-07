---
'@tanstack/ai-persistence': minor
'@tanstack/ai-harness': minor
---

Search and filter the session list. `SessionIndexListOptions` has `search` (title text, without case), `harness`, and `metadata` (exact string values). The memory store and the conformance suite support them. `GET sessions` lists only the sessions of the harness of the handler, and reads the `search` and `metadata.<key>` query parameters. `listSessions` of the client sends `search` and `metadata`.
