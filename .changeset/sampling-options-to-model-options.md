---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-groq': minor
'@tanstack/ai-ollama': minor
'@tanstack/ai-openrouter': minor
---

**BREAKING:** Sampling options (`temperature`, `topP`, `maxTokens`) have moved off the root of `chat()` / `ai()` / `generate()` and into provider-native `modelOptions`. There is no longer a generic root-level sampling surface — each provider accepts its own native keys, fully typed per model:

- OpenAI (Responses): `modelOptions: { temperature, top_p, max_output_tokens }`
- Anthropic: `modelOptions: { temperature, top_p, max_tokens }`
- Gemini: `modelOptions: { temperature, topP, maxOutputTokens }`
- Grok: `modelOptions: { temperature, top_p, max_tokens }`
- Groq: `modelOptions: { temperature, top_p, max_completion_tokens }`
- Ollama: `modelOptions: { options: { temperature, top_p, num_predict } }` (nested)
- OpenRouter (chat): `modelOptions: { temperature, topP, maxCompletionTokens }`

Middleware no longer sees `temperature`/`topP`/`maxTokens` as first-class fields on `ChatMiddlewareConfig`; mutate `config.modelOptions` (with the provider-native keys above) instead. `metadata` is unaffected and stays at the root.

Migrate automatically with the codemod, which resolves the provider from the adapter and rewrites the keys for you:

```bash
pnpm codemod:move-sampling-to-model-options "src/**/*.{ts,tsx}"
```

See the [Sampling Options migration guide](https://tanstack.com/ai/latest/docs/migration/sampling-options-to-model-options) for details.
