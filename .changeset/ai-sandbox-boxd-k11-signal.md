---
'@tanstack/ai-sandbox-boxd': minor
---

When the `snapshot` signal aborts, `snapshot` stops polling for the capture. When the `fork` signal aborts, `fork` stops waiting for the new machine and deletes it. The boxd SDK takes no signal, so a started capture continues in boxd.
