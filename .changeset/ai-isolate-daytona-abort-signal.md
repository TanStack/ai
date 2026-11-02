---
'@tanstack/ai-isolate-daytona': minor
---

When the `execute()` signal aborts, `execute()` returns an `AbortError` failure and starts no more tool rounds. The Daytona SDK cannot cancel a `codeRun`, so a run that already started continues in the sandbox until its own timeout.
