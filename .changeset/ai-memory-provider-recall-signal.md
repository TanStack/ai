---
'@tanstack/ai-memory': minor
---

The Hindsight adapter passes the `recall()` signal to `client.recall`. The Honcho adapter stops waiting when the signal aborts. The Honcho SDK takes no signal, so its request continues in the background.
