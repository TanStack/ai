---
'@tanstack/ai-harness': patch
---

A log that gives its ownership back when its sessions have no work now also clears its pending snapshot timer, so the timer no longer stays armed for a snapshot this host cannot write.
