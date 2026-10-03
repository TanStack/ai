---
'@tanstack/ai-client': minor
'@tanstack/ai': patch
---

Expose AG-UI activity messages on the chat client UIMessage path without sending them to the model.

Migration: `UIMessage.role` can now be `'activity'`. If your UI renders only `'user'` and `'assistant'` rows, it skips activity rows. If your code handles every role (for example, a `switch` that must be exhaustive), add a case for `'activity'`. Read the activity payload from the part with `type: 'activity'`.
