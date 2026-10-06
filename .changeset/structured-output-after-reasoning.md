---
'@tanstack/ai': patch
---

Stop the duplicate `text` part on structured output from a reasoning model. When reasoning streamed first under its own message id, the stream processor put the JSON in a `text` part and also in the `structured-output` part. The message now has the `thinking` part and the `structured-output` part only.
