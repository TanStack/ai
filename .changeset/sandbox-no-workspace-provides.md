---
'@tanstack/ai-sandbox': patch
---

`withSandbox` no longer fails the first `chat()` call with `declares it provides "sandbox-projection" but never called provide() in setup()` when the sandbox definition has no `workspace`. `sandbox-projection` is listed in `provides` only when a workspace is declared, which is when `setup` calls `provide()`. A sandbox with a workspace still satisfies `requires: [ProjectionCapability]`.
