---
'@tanstack/ai-sandbox-upstash-box': minor
---

Add `@tanstack/ai-sandbox-upstash-box`, an Upstash Box sandbox provider. Runs
harness adapters inside isolated Upstash Box cloud sandboxes through the uniform
`SandboxHandle` — real filesystem (native Box file API + shell fallbacks), shell
`exec`, streamed background processes (`spawn` over `exec.stream`), public
preview URLs via `getPublicURL`, and native snapshots (`box.snapshot()` /
`Box.fromSnapshot()`). Like the Daytona provider, spawned processes have no
writable stdin (`writableStdin: false`), so stdin-driven harnesses must deliver
their prompt via a file + shell redirection.
