---
'@tanstack/ai-client': patch
---

Rejoin an active continuation run on hydrate. When hydrate reports an active run and a pending interrupt from a different (parent) run, the client now joins the active run with `joinRun`. Before, it restored the parent interrupt, so the reply never appeared and the thread stayed parked. When both ids are the same (a run that just paused), the interrupt still wins.
