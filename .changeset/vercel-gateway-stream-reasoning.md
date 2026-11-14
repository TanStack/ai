---
'@tanstack/ai-vercel-gateway': patch
---

Chat Completions streams now surface AI Gateway `delta.reasoning` as reasoning events. A `chat({ reasoning })` call with the summary on no longer drops the thinking text.
