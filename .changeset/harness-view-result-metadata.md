---
'@tanstack/ai-harness': minor
---

The session view now shows tool result metadata. A `tool-call` part from `createSessionView` has `resultMetadata` when the server tool called `setResultMetadata`, live and after a reload. The value has only the app keys, as `part.resultMetadata` in `useChat`.
