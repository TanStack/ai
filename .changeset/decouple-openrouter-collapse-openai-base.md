---
'@tanstack/openai-base': minor
'@tanstack/ai-openai': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-openrouter': patch
---

Decouple `@tanstack/ai-openrouter` from the shared OpenAI base, and collapse the base into a thinner shim over the `openai` SDK.

Three changes that ship together:

**1. Rename `@tanstack/ai-openai-compatible` → `@tanstack/openai-base`.** The previous name implied a multi-vendor protocol surface. After ai-openrouter is decoupled (see below), the only remaining consumers (`ai-openai`, `ai-grok`, `ai-groq`) all back onto the `openai` SDK with a different `baseURL` — "base" describes that role accurately. Imports change:

```diff
- import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/ai-openai-compatible'
+ import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
- import { OpenAICompatibleResponsesTextAdapter } from '@tanstack/ai-openai-compatible'
+ import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
```

`@tanstack/ai-openai-compatible@0.2.x` remains published for anyone with a pinned lockfile reference but will receive no further updates.

**2. `@tanstack/openai-base` adopts the `openai` SDK directly.** The previous package vendored ~720 LOC of hand-written wire-format types (`ChatCompletion`, `ResponseStreamEvent`, etc.) and exposed abstract `callChatCompletion*` / `callResponse*` hooks subclasses had to implement. Both are gone:

- The base now depends on `openai` again and imports types directly from `openai/resources/...`. The vendored `src/types/` directory is removed; consumers that imported wire types from the package (e.g. `import type { ResponseInput } from '@tanstack/ai-openai-compatible'`) should now import from the openai SDK.
- The abstract SDK-call methods are removed. The base constructor takes a pre-built `OpenAI` client (`new OpenAIBaseChatCompletionsTextAdapter(model, name, openaiClient)`) and calls `client.chat.completions.create` / `client.responses.create` itself. Subclasses (`ai-openai`, `ai-grok`, `ai-groq`) now just construct the SDK with their provider-specific `baseURL` and pass it to `super` — `callChatCompletion*` / `callResponse*` overrides go away.

The other extension hooks (`extractReasoning`, `extractTextFromResponse`, `processStreamChunks`, `makeStructuredOutputCompatible`, `transformStructuredOutput`, `mapOptionsToRequest`, `convertMessage`) remain. Groq's `processStreamChunks` and `makeStructuredOutputCompatible` overrides (for `x_groq.usage` promotion and Groq's structured-output schema quirks) are unchanged.

**3. Decouple `@tanstack/ai-openrouter` from the OpenAI base entirely.** OpenRouter ships its own SDK (`@openrouter/sdk`) with a camelCase shape, so inheriting from the OpenAI-shaped base forced a snake_case ↔ camelCase round-trip on every request and stream event. ai-openrouter now extends `BaseTextAdapter` directly and inlines its own stream processors (`OpenRouterTextAdapter` for chat-completions, `OpenRouterResponsesTextAdapter` for the Responses beta), reading OpenRouter's camelCase types natively. The `@tanstack/openai-base` and `openai` dependencies are removed from ai-openrouter; only `@openrouter/sdk`, `@tanstack/ai`, and `@tanstack/ai-utils` remain.

Public API is unchanged: `openRouterText`, `openRouterResponsesText`, `createOpenRouterText`, `createOpenRouterResponsesText`, the OpenRouter tool factories, provider routing surface (`provider`, `models`, `plugins`, `variant`, `transforms`), app attribution headers (`httpReferer`, `appTitle`), `:variant` model suffixing, `RequestAbortedError` propagation, and the OpenRouter-specific structured-output null-preservation all behave the same. The ~300 LOC of inbound/outbound shape converters (`toOpenRouterRequest`, `toChatCompletion`, `adaptOpenRouterStreamChunks`, `toSnakeResponseResult`, …) are gone.

`ai-ollama` remains on `BaseTextAdapter` directly — its native API uses a different wire format from Chat Completions and was never on the shared base.
