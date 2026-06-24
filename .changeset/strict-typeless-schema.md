---
'@tanstack/openai-base': patch
---

Fix `isStrictModeCompatible` wrongly reporting typeless schemas as strict-compatible. A property emitted by `z.any()`/`z.unknown()` (an empty `{}` schema with no `type`) was forcing `strict: true`, which OpenAI rejects with a 400. Such schemas are now detected and sent with `strict: false` so the tool stays callable.
