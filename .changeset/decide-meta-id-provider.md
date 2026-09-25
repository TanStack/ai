---
'@tanstack/ai': minor
'@tanstack/ai-openrouter': minor
---

Add optional `id` and `provider` to `decide()` results (`result.meta.id`, `result.meta.provider`). Evaluate adapters return them on `EvaluateAdapterResult`. `openRouterDecider` fills them from the Decisions API response, so you can look a request up later with `GET /api/v1/generation?id=`.
