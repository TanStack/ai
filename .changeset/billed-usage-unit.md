---
'@tanstack/ai-event-client': minor
'@tanstack/ai': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-openai': minor
---

Add a self-describing `billed` field to `TokenUsage` so non-token billed quantities carry the unit they are counted in (#816). `usage.billed` is `{ quantity, unit }` with a `BillingUnit` union (`'seconds'`, `'units'`, `'images'`, ... open-ended), replacing the guesswork previously needed to interpret the bare `unitsBilled` / `durationSeconds` counts — those two fields are now deprecated but still populated for backward compatibility. The fal adapters report `{ quantity, unit: 'units' }`, Grok video `{ quantity, unit: 'seconds' }`, and the OpenAI/Grok duration-billed transcription paths `{ quantity, unit: 'seconds' }`. `otelMiddleware` emits the pair as `tanstack.ai.usage.billed_quantity` / `tanstack.ai.usage.billed_unit` span attributes.
