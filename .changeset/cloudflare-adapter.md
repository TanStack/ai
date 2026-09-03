---
'@tanstack/ai-cloudflare': minor
'@tanstack/ai': minor
'@tanstack/ai-client': minor
---

Add `@tanstack/ai-cloudflare`: a Cloudflare adapter for Workers AI chat, summarization, embeddings, image generation, text-to-speech, and transcription over the `env.AI` binding or the REST API, with AI Gateway routing (`gateway` option and `cloudflareGateway()` helper for other providers). `@tanstack/ai` learns the `cloudflare` max-tokens key for summarize, lets `defineByokProvider` declare companion credentials with `with`, and adds `getByokKeys(request, { name: provider })` to `@tanstack/ai/byok/server`. `@tanstack/ai-client`'s `defineByok` takes `providers`: a send for a provider with companions (Cloudflare token plus account id) carries every `x-byok-*` header and prompts for each missing value.
