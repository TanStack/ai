---
'@tanstack/ai-client': minor
---

Add `body` to `SendMessageOptions` so framework hooks can pass per-call request JSON through `sendMessage(content, { body })`. The value is shallow-merged into `forwardedProps` with the highest priority. On `ChatClient`, positional `body` still wins if both are set.
