---
'@tanstack/ai-utils': minor
---

Add `commandEnv(env, platform, passEnv?)`, the short env of a command that a process starts (no provider keys or other secrets of the server), and `createOutputTail(maxBytes)`, the newest output of a command. `@tanstack/ai-harness`, `@tanstack/ai-sandbox`, and `@tanstack/ai-sandbox-local-process` use them.
