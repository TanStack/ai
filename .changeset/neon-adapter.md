---
'@tanstack/ai': patch
'@tanstack/ai-neon': minor
'@tanstack/openai-base': patch
---

Add `@tanstack/ai-neon` for the Neon AI Gateway: `neonText` sends Claude to the Anthropic Messages route, codex and `*-pro` models to the Responses route, and every other model to Chat Completions, with `neonEmbedding` and `neonSummarize`. `@tanstack/openai-base` gets a `streamOptions(model)` hook, so a Chat Completions backend that rejects `stream_options` can leave it out.
