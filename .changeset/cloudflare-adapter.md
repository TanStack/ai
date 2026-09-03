---
'@tanstack/ai-cloudflare': minor
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-angular': patch
'@tanstack/ai-remix': patch
---

Add `@tanstack/ai-cloudflare`: a Cloudflare adapter for Workers AI chat, summarization, embeddings, image generation, text-to-speech, and transcription over the `env.AI` binding or the REST API, with AI Gateway routing (`gateway` option and `cloudflareGateway()` helper for other providers). `@tanstack/ai` learns the `cloudflare` max-tokens key for summarize and adds `getByokKeys(request, { name: provider })` to `@tanstack/ai/byok/server` for credentials made of several values. `@tanstack/ai-client`'s `byokProvider` may now return a list of ids so credentials made of several values (Cloudflare account id + token) send every `x-byok-*` header; the framework generation hooks accept the same `byokProvider` shape.
