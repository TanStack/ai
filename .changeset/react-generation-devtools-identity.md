---
'@tanstack/ai-react': patch
---

Prevent caller-supplied `devtools` options from overriding the framework and
hook identity reported by `useGeneration`. Custom metadata continues to pass
through unchanged.
