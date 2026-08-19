---
'@tanstack/ai-event-client': minor
'@tanstack/ai': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-byteplus': minor
'@tanstack/ai-cohere': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-persistence': minor
---

Add a self-describing `billed` field to `TokenUsage` so billed quantities carry the unit they are counted in (#816). `usage.billed` is `{ quantity, unit }` with a `BillingUnit` union (`'seconds'`, `'units'`, `'images'`, `'tokens'`, ... open-ended). The deprecated `unitsBilled` / `durationSeconds` counts are still populated for backward compatibility. The fal adapters report `{ quantity, unit: 'units' }`, Grok video `{ quantity, unit: 'seconds' }`, the OpenAI/Grok/BytePlus duration-billed transcription paths `{ quantity, unit: 'seconds' }`, BytePlus Seedream images `{ quantity, unit: 'images' }`, BytePlus Seedance video `{ quantity, unit: 'tokens' }`, and Cohere/OpenRouter rerank `{ quantity, unit: 'units' }` (search units). Persistence sums `billed` when both reports use the same unit. `otelMiddleware` emits the pair as `tanstack.ai.usage.billed_quantity` / `tanstack.ai.usage.billed_unit` span attributes.
