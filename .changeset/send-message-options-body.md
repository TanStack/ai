---
'@tanstack/ai-client': minor
---

Add `body` to `SendMessageOptions` so framework hooks can pass per-call request JSON through `sendMessage(content, { body })`. Chat-level `body`, the positional `ChatClient` argument, and `sendOptions.body` shallow-merge into `forwardedProps`. `sendOptions.body` wins on key collisions.
