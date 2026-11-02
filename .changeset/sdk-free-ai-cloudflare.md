---
'@tanstack/ai-cloudflare': minor
---

`@cloudflare/workers-types` is now an optional peer dependency. If you use TypeScript, install it as a dev dependency, because the adapter types use its `Ai` binding and AI Gateway types. The adapter needs no extra package at runtime.
