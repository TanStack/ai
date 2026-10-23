---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-cloudflare': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-groq': minor
'@tanstack/ai-mistral': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-vercel-gateway': minor
'@tanstack/ai-vertex': minor
---

Each provider package exports its model catalog at `./models`, for example `import { models } from '@tanstack/ai-anthropic/models'`. A record has the model's `id`, `name`, `input` modalities, `contextWindow`, `maxOutputTokens`, `prices`, and `reasoning` levels. `@tanstack/ai-openai` also exports `./azure-models`, and `@tanstack/ai-cloudflare` also exports `./gateway-models`.

`@tanstack/ai` adds the `ModelRecord` type and `modelCost(model, usage)`. `modelCost` prices one call from its `TokenUsage`, with long-context tiers and 1-hour cache writes. It returns `undefined` when the call used tokens that have no known price.

The data comes from modelschemas, and a daily job syncs it. A value that modelschemas does not list is `undefined`, never `0`.
