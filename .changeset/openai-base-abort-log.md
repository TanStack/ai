---
'@tanstack/openai-base': patch
---

A caller abort no longer logs a `fatal` entry on the `errors` debug channel. A direct `chatStream()` call that is aborted before the response arrives now yields `RUN_ERROR` with `code: 'aborted'`.
