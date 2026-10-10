---
'@tanstack/ai-client': patch
---

Rejoin an in-flight run restored by an async persistence store (IndexedDB, AsyncStorage) when the store finishes reading before `attach()`. The client kept the transcript but dropped the run id, so the partial assistant message stayed frozen. Attaching first already worked.
