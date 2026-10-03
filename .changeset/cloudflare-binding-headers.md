---
'@tanstack/ai-cloudflare': minor
---

Add `defaultHeaders` to the binding config. Every binding run sends them as the Workers AI `extraHeaders` option, next to `gateway`, so you can set `x-session-affinity` for prompt caching when you use `{ binding: env.AI }`.
