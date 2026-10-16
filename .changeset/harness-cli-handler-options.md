---
'@tanstack/ai-harness-cli': patch
---

`--serve` passes `canAccess` and `media: { secret }` to the harness handler, which needs both.
