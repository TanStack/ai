---
'@tanstack/ai-openai-compatible': minor
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-grok': patch
---

Rename `@tanstack/openai-base` → `@tanstack/ai-openai-compatible`.

The previous "base" name implied this package tracked OpenAI's product roadmap. In reality it implements two OpenAI-shaped _wire-format protocols_ that multiple providers ship:

- **Chat Completions** (`/v1/chat/completions`) — natively implemented by OpenAI, Groq, Grok, OpenRouter, vLLM, SGLang, Together, etc.
- **Responses** (`/v1/responses`) — OpenAI's reference implementation plus OpenRouter's beta routing implementation (which fans out to Anthropic, Google, and other underlying models).

"OpenAI-compatible" is the actual industry term for this family of wire formats (cf. Vercel's `@ai-sdk/openai-compatible`, LiteLLM's "OpenAI-compatible endpoint", BentoML / Lightning AI docs). The renamed package makes the boundary explicit: it holds the protocol, while OpenAI-specific tools, models, and behaviors continue to live in `@tanstack/ai-openai`.

No runtime behavior changes. Class names (`OpenAICompatibleChatCompletionsTextAdapter`, `OpenAICompatibleResponsesTextAdapter`, …) and protected hook contracts are unchanged. Consumer packages (`ai-openai`, `ai-openrouter`, `ai-groq`, `ai-grok`) only update their internal import paths — public API is unchanged.

If you were importing from `@tanstack/openai-base` directly (uncommon — the package was not yet documented as a public extension point), update your imports:

```diff
- import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/openai-base'
+ import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/ai-openai-compatible'
```

`@tanstack/openai-base@0.2.x` remains published on npm for anyone with a pinned lockfile reference but will receive no further updates.
