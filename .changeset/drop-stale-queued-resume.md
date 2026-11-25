---
'@tanstack/ai-client': patch
---

A resume that waits for the current stream does not start after a newer run replaces that pause. If you approve the old interrupt while `reload()` is in progress, the client does not send the old run id.
