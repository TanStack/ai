---
'@tanstack/ai-harness': patch
---

A host that folds a `harness.*` log record type it does not know (a newer harness wrote it, for example during a rolling deploy) reads the log but refuses to write it, with `LogVersionError`. A log snapshot from a newer harness is not used.
