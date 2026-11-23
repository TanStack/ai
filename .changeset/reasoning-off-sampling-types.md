---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': patch
---

Fix model option types that did not match what the provider accepts.

- `@tanstack/ai`: an adapter can mark `modelOptions` keys that work only with `reasoning: 'off'` (`offOnlyOptions` on its reasoning capability). `chat()`, `ctx.chat()` and `createChatOptions()` then make those keys a type error when `reasoning` is not `'off'` or not set.
- `@tanstack/ai-openai`: on reasoning models (o-series, `gpt-5*`, `gpt-6*`, except `*-chat-latest`), `temperature`, `top_p` and `top_logprobs` type-check only with `reasoning: 'off'`. Before, the adapter dropped them without a warning.
- `@tanstack/ai-openai`: `gpt-6.1-terra` and `gpt-6.1-terra-pro` now have their reasoning levels (`off` to `max`). Before, every `reasoning` value was a type error, and the adapter sent no reasoning effort.
- `@tanstack/ai-openai`: `service_tier` accepts `'ultrafast'` and any newer tier name.
- `@tanstack/ai-anthropic`: `claude-opus-5` and `claude-opus-5-5` no longer accept `temperature`, `top_p` or `top_k`. Anthropic returns a 400 for them on these models.
