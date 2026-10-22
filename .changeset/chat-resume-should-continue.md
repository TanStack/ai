---
'@tanstack/ai': patch
---

`chat()` asks the middleware `onShouldContinue` after it runs the pending tool calls of a resume, before the next model call. A middleware that returns `false` there ends the run with no more model calls. The loop strategy is not asked at that point.
