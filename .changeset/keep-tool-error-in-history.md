---
'@tanstack/ai': patch
---

Keep a failed tool call's error on the tool message `chat()` adds to its message history. Persisted threads now restore the call with `state: 'error'` instead of `'complete'`.
