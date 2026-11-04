---
'@tanstack/ai-sandbox': patch
---

`withSandbox` no longer fails the first `chat()` call with `declares it provides "sandbox-projection" but never called provide() in setup()` when the sandbox definition has no `workspace`. The projection capability is only provided when a workspace is declared, so it is no longer listed in the middleware's static `provides`; adapters already read it with `optional: true`.
