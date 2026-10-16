---
'@tanstack/ai-harness': patch
---

`definePlugin` refuses a `setup()` contribution, such as `adapter` or `tools`, at the top level of a definition, where it would be ignored. Return it from `setup()`.
