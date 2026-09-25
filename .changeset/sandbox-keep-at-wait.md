---
'@tanstack/ai-sandbox': patch
---

Keep the sandbox when a run pauses at an interrupt, a client-tool wait, or an approval wait. `withSandbox` no longer takes the `after-run` snapshot or runs `destroyOnComplete` at the pause. It does these when the run completes.
