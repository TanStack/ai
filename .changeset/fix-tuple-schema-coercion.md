---
'@tanstack/openai-base': patch
---

Preserve draft-07 tuple `items` arrays during strict schema conversion.

Send tools that use `prefixItems` with `strict: false`. OpenAI strict mode rejects that keyword.
