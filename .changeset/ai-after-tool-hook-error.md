---
'@tanstack/ai': patch
---

Treat a failed `onAfterToolCall` middleware hook as a chat run error instead of recording a second, contradictory tool result.
