---
'@tanstack/ai-persistence': patch
---

Keep the error of a stopped or failed subagent card after a reload. `reconstructChat` now reads the error from the stored child metadata, so a stopped child keeps its `Stopped` error and a failed child keeps its error `code`.
