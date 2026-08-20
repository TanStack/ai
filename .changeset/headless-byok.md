---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-groq': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-mistral': minor
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-ollama': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-byteplus': minor
'@tanstack/ai-cohere': minor
'@tanstack/ai-vercel-gateway': minor
'@tanstack/ai-claude-code': minor
'@tanstack/ai-codex': minor
'@tanstack/ai-opencode': minor
'@tanstack/ai-grok-build': minor
---

Add headless BYOK: `defineByok` in `@tanstack/ai-client/byok`, pass `byok` into chat and generation hooks, and read keys on the relay with `@tanstack/ai/byok`. Provider ids are open slugs (`x-byok-<slug>`). Each adapter exports a `{ id, label, validate? }` object (`openaiByok`, …); `id` is required. OpenRouter PKCE (`@tanstack/ai-openrouter/pkce`) saves the minted key under `openrouterByok.id`.
