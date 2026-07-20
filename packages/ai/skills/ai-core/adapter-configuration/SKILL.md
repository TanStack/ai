---
name: ai-core/adapter-configuration
description: >
  Provider adapter selection and configuration: openaiText, anthropicText,
  geminiText, ollamaText, grokText, groqText, openRouterText, bedrockText,
  openaiCompatible. Per-model type safety with modelOptions, reasoning/thinking configuration,
  runtime adapter switching, extendAdapter() for custom models, createModel().
  Generic OpenAI-compatible providers (DeepSeek, Together, Fireworks, etc.) via
  openaiCompatible({ baseURL, apiKey, models }) from @tanstack/ai-openai/compatible.
  API key env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY/GEMINI_API_KEY,
  XAI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, OLLAMA_HOST,
  BEDROCK_API_KEY (or AWS_BEARER_TOKEN_BEDROCK).
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/adapters/openai.md'
  - 'TanStack/ai:docs/adapters/anthropic.md'
  - 'TanStack/ai:docs/adapters/gemini.md'
  - 'TanStack/ai:docs/adapters/ollama.md'
  - 'TanStack/ai:docs/advanced/per-model-type-safety.md'
  - 'TanStack/ai:docs/advanced/runtime-adapter-switching.md'
  - 'TanStack/ai:docs/advanced/extend-adapter.md'
---

# Adapter Configuration

> **Dependency:** This skill builds on ai-core. Read it first for critical rules.

> **Before implementing:** Ask the user which provider and model they want.
> Then fetch the latest available models from the provider's source code
> (check the adapter's model metadata file, e.g. `packages/ai-openai/src/model-meta.ts`)
> or from the provider's API/docs to recommend the most current model.
> The model lists in this skill and its reference files may be outdated.
> Always verify against the source before recommending a specific model.

## Setup

Create an adapter and use it with `chat()`:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  modelOptions: {
    temperature: 0.7,
    max_output_tokens: 1000,
  },
})

return toServerSentEventsResponse(stream)
```

The adapter factory function takes the model name as a string literal and an
optional config object (API key, base URL, etc.). The model name is passed
into the factory, not into `chat()`.

Sampling options (`temperature`, token limits, `top_p`/`topP`, etc.) live
inside `modelOptions` using each provider's native key — they are **not**
top-level options on `chat()`. See the per-provider table in
[Configuring Sampling](#5-configuring-sampling) below.

## Core Patterns

### 1. Adapter Selection

Each provider has a dedicated package with tree-shakeable adapter factories.
The text adapter is the primary one for chat/completions:

| Provider          | Package                          | Factory                                     | Env Var                                           |
| ----------------- | -------------------------------- | ------------------------------------------- | ------------------------------------------------- |
| OpenAI            | `@tanstack/ai-openai`            | `openaiText`                                | `OPENAI_API_KEY`                                  |
| Anthropic         | `@tanstack/ai-anthropic`         | `anthropicText`                             | `ANTHROPIC_API_KEY`                               |
| Gemini            | `@tanstack/ai-gemini`            | `geminiText`                                | `GOOGLE_API_KEY` or `GEMINI_API_KEY`              |
| Grok (xAI)        | `@tanstack/ai-grok`              | `grokText`                                  | `XAI_API_KEY`                                     |
| Groq              | `@tanstack/ai-groq`              | `groqText`                                  | `GROQ_API_KEY`                                    |
| OpenRouter        | `@tanstack/ai-openrouter`        | `openRouterText`                            | `OPENROUTER_API_KEY`                              |
| Ollama            | `@tanstack/ai-ollama`            | `ollamaText`                                | `OLLAMA_HOST` (default: `http://localhost:11434`) |
| Bedrock           | `@tanstack/ai-bedrock`           | `bedrockText`                               | `BEDROCK_API_KEY` or `AWS_BEARER_TOKEN_BEDROCK`   |
| OpenAI-compatible | `@tanstack/ai-openai/compatible` | `openaiCompatible` / `openaiCompatibleText` | provider-specific (passed via `apiKey`)           |

```typescript
// Each factory takes model as first arg, optional config as second
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { grokText } from '@tanstack/ai-grok'
import { groqText } from '@tanstack/ai-groq'
import { openRouterText } from '@tanstack/ai-openrouter'
import { ollamaText } from '@tanstack/ai-ollama'
import { bedrockText } from '@tanstack/ai-bedrock'

// Model string is passed to the factory, NOT to chat()
const adapter = openaiText('gpt-5.2')
const adapter2 = anthropicText('claude-sonnet-4-6')
const adapter3 = geminiText('gemini-2.5-pro')
const adapter4 = grokText('grok-4')
const adapter5 = groqText('llama-3.3-70b-versatile')
const adapter6 = openRouterText('anthropic/claude-sonnet-4')
const adapter7 = ollamaText('llama3.3')
const adapter8 = bedrockText('us.anthropic.claude-3-7-sonnet-20250219-v1:0')

// Optional: pass explicit API key
const adapterWithKey = openaiText('gpt-5.2', {
  apiKey: 'sk-...',
})
```

`@tanstack/ai-bedrock` (Amazon Bedrock) branches on `config.api`:

- `bedrockText(model)` or `bedrockText(model, { api: 'converse' })` (the default) — Bedrock's native Converse API via `@aws-sdk/client-bedrock-runtime` (adapter name `bedrock-converse`). Reaches the broad catalog: Claude, Nova, Llama, Mistral, DeepSeek, and more.
- `bedrockText(model, { api: 'chat' })` — OpenAI-compatible Chat Completions endpoint (adapter name `bedrock`). Open-weight models only (gpt-oss, DeepSeek V3.x, Gemma, Qwen, etc.). Does NOT reach Claude, Nova, or Llama.
- `bedrockText(model, { api: 'responses' })` — OpenAI-compatible Responses API, mantle-only (adapter name `bedrock-responses`). Currently gpt-oss family.

Use `createBedrockText(model, apiKey, config?)` to pass the key explicitly. Auth resolves from `BEDROCK_API_KEY` / `AWS_BEARER_TOKEN_BEDROCK`, or SigV4 via the standard AWS credential chain (no extra packages needed — handled by `@aws-sdk/client-bedrock-runtime`).

### 2. Runtime Adapter Switching

Use an adapter factory map to switch providers dynamically based on user
input or configuration:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import type { TextAdapter } from '@tanstack/ai/adapters'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'

// Define a map of provider+model to adapter factory calls
const adapters: Record<string, () => TextAdapter> = {
  'openai/gpt-5.2': () => openaiText('gpt-5.2'),
  'anthropic/claude-sonnet-4-6': () => anthropicText('claude-sonnet-4-6'),
  'gemini/gemini-2.5-pro': () => geminiText('gemini-2.5-pro'),
}

export function handleChat(providerModel: string, messages: Array<any>) {
  const createAdapter = adapters[providerModel]
  if (!createAdapter) {
    throw new Error(`Unknown provider/model: ${providerModel}`)
  }

  const stream = chat({
    adapter: createAdapter(),
    messages,
  })

  return toServerSentEventsResponse(stream)
}
```

### 3. Configuring Reasoning / Thinking

Different providers expose reasoning/thinking through their `modelOptions`:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'

// OpenAI: reasoning with effort and summary
const openaiStream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  modelOptions: {
    reasoning: {
      effort: 'high',
      summary: 'auto',
    },
  },
})

// Anthropic: extended thinking with budget_tokens
const anthropicStream = chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages,
  modelOptions: {
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 8000, // must be >= 1024 and < max_tokens
    },
  },
})

// Anthropic: adaptive thinking (claude-sonnet-4-6 and newer)
const adaptiveStream = chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages,
  modelOptions: {
    max_tokens: 16000,
    thinking: {
      type: 'adaptive',
    },
    effort: 'high', // 'max' | 'high' | 'medium' | 'low'
  },
})

// Gemini: thinking config with budget or level
const geminiStream = chat({
  adapter: geminiText('gemini-2.5-pro'),
  messages,
  modelOptions: {
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 4096,
    },
  },
})
```

### 4. Extending Adapters with Custom Models

Use `extendAdapter()` and `createModel()` to add custom or fine-tuned models
while preserving type safety for the original models:

```typescript
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Define custom models
const customModels = [
  createModel('ft:gpt-5.2:my-org:custom-model:abc123', ['text', 'image']),
  createModel('my-local-proxy-model', ['text']),
] as const

// Create extended factory - original models still fully typed
const myOpenai = extendAdapter(openaiText, customModels)

// Use original models - full type inference preserved
const gpt5 = myOpenai('gpt-5.2')

// Use custom models - accepted by the type system
const custom = myOpenai('ft:gpt-5.2:my-org:custom-model:abc123')

// Type error: 'nonexistent-model' is not a valid model
// myOpenai('nonexistent-model')
```

At runtime, `extendAdapter` simply passes through to the original factory.
The `_customModels` parameter is only used for type inference.

### 5. Configuring Sampling

Sampling controls (`temperature`, token limits, nucleus sampling) are passed
inside `modelOptions` using each provider's **native** key. They are not
top-level fields on `chat()`/`ai()`/`generate()`.

```typescript
// OpenAI — native keys
chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  modelOptions: { temperature: 0.7, top_p: 0.9, max_output_tokens: 1000 },
})

// Anthropic
chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages,
  modelOptions: { temperature: 0.7, top_p: 0.9, max_tokens: 1000 },
})

// Gemini — camelCase
chat({
  adapter: geminiText('gemini-2.5-pro'),
  messages,
  modelOptions: { temperature: 0.7, topP: 0.9, maxOutputTokens: 1000 },
})

// Ollama — NESTED under modelOptions.options
chat({
  adapter: ollamaText('llama3.3'),
  messages,
  modelOptions: {
    options: { temperature: 0.7, top_p: 0.9, num_predict: 1000 },
  },
})
```

Per-provider sampling keys (all live inside `modelOptions`):

| Provider          | Temperature   | Nucleus | Max output tokens                   |
| ----------------- | ------------- | ------- | ----------------------------------- |
| OpenAI            | `temperature` | `top_p` | `max_output_tokens`                 |
| Anthropic         | `temperature` | `top_p` | `max_tokens`                        |
| Gemini            | `temperature` | `topP`  | `maxOutputTokens`                   |
| Grok (xAI)        | `temperature` | `top_p` | `max_tokens`                        |
| Groq              | `temperature` | `top_p` | `max_completion_tokens`             |
| OpenRouter (chat) | `temperature` | `topP`  | `maxCompletionTokens`               |
| Ollama            | `temperature` | `top_p` | `num_predict` (nested in `options`) |

`temperature` is the one key every provider names identically; token limits and
some sampling options use provider-native names. Ollama nests all sampling under
`modelOptions.options`.

> **Anthropic `max_tokens` default:** Anthropic's API _requires_ `max_tokens`,
> so the adapter always sends one. When you omit `modelOptions.max_tokens`, it
> defaults to the selected model's full output ceiling (its `max_output_tokens`
> from model metadata — e.g. 64K for Sonnet, 128K for Opus), not a low constant.
> `max_tokens` is a ceiling, not a reservation (billing is per token generated),
> so leaving it unset is the right default for codegen / agentic / long-form
> output and avoids silent `stop_reason: "max_tokens"` truncation. Set it only to
> cap output below the model ceiling. Other providers treat token limits as
> optional and don't apply this flooring.

### 6. Capability Flag: `supportsCombinedToolsAndSchema`

Adapters can declare an optional capability method:

```ts
supportsCombinedToolsAndSchema?(modelOptions?: TProviderOptions): boolean
```

When `true`, the engine wires `outputSchema` into the regular
`chatStream` call alongside `tools` and harvests the schema-constrained
JSON from the agent loop's final-turn text — skipping the separate
`structuredOutput` / `structuredOutputStream` finalization round-trip.
When `false` (or the method is omitted), the legacy finalization path
runs.

Current per-adapter status (#605):

| Adapter                                      | Returns                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `openaiText` / `openaiChatCompletions`       | `true` (all supported models)                                                                     |
| `anthropicText`                              | `true` for Claude 4.5+ (gated by `ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS`), `false` otherwise |
| `geminiText`                                 | `true` for Gemini 3.x (gated by `GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS`), `false` otherwise     |
| `grokText`                                   | `true` for Grok 4 family (gated by `GROK_COMBINED_TOOLS_AND_SCHEMA_MODELS`), `false` otherwise    |
| `groqText`                                   | `false` (Groq API rejects schema + tools + stream)                                                |
| `openRouterText` / `openRouterResponsesText` | `false` (per-call resolution is a follow-up)                                                      |
| `ollamaText`                                 | `false` (constrained-decoding vs tool-call grammar conflict)                                      |

Subclasses can override to narrow the capability. When extending an
adapter for a custom model that doesn't support the combination, return
`false` explicitly.

### 6. OpenAI-Compatible Providers

Any provider that implements the OpenAI **Chat Completions** API (DeepSeek,
Moonshot/Kimi, Together, Fireworks, Cerebras, Qwen/DashScope, Perplexity,
NVIDIA NIM, LM Studio, etc.) can be used through the generic
`openaiCompatible` factory from `@tanstack/ai-openai/compatible` — no
dedicated package required.

```typescript
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { createModel } from '@tanstack/ai'

// Provider-factory: configure baseURL + apiKey + models ONCE,
// then select a model per call (the model arg is a type-safe union).
const deepseek = openaiCompatible({
  name: 'deepseek', // optional label for devtools/errors (default 'openai-compatible')
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: [
    'deepseek-chat', // bare string → optimistic defaults: text/image in, streaming, tools, structured output
    createModel('deepseek-reasoner', {
      // rich def → precise per-model capabilities
      input: ['text'],
      features: ['reasoning', 'structured_outputs'],
    }),
  ],
})

chat({ adapter: deepseek('deepseek-chat'), messages })
chat({ adapter: deepseek('deepseek-reasoner'), messages })
```

`config` also accepts any OpenAI SDK `ClientOptions` (notably `defaultHeaders`
and `defaultQuery`) for providers that need extra auth headers or query params.

For a single model, use the one-shot helper:

```typescript
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'

chat({
  adapter: openaiCompatibleText('deepseek-chat', {
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY!,
  }),
  messages,
})
```

Pass `api: 'responses'` to target the OpenAI **Responses** API instead of Chat
Completions (only for the rare compatible provider that implements it, e.g.
Azure OpenAI); the default is `'chat-completions'`, which is what nearly all
compatible providers speak.

> Verify the provider's current `baseURL` and model ids against its live docs —
> they drift. See `docs/adapters/openai-compatible.md` for the full provider table.

## Common Mistakes

### a. HIGH: Confusing legacy monolithic with tree-shakeable adapter

The legacy `openai()` (and `anthropic()`, etc.) monolithic adapters are
deprecated. They take the model in `chat()`, not in the factory.

```typescript
// WRONG: Legacy monolithic adapter pattern
import { openai } from '@tanstack/ai-openai'
chat({ adapter: openai(), model: 'gpt-5.2', messages })

// CORRECT: Tree-shakeable adapter, model in factory
import { openaiText } from '@tanstack/ai-openai'
chat({ adapter: openaiText('gpt-5.2'), messages })
```

Source: docs/migration/migration.md

### b. MEDIUM: Wrong API key environment variable name

Each provider uses a specific env var name. Using the wrong one causes a
runtime error:

| Provider   | Correct Env Var                                | Common Mistake                                                           |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| OpenAI     | `OPENAI_API_KEY`                               |                                                                          |
| Anthropic  | `ANTHROPIC_API_KEY`                            |                                                                          |
| Gemini     | `GOOGLE_API_KEY` or `GEMINI_API_KEY`           | `GOOGLE_GENAI_API_KEY` (does not work)                                   |
| Grok (xAI) | `XAI_API_KEY`                                  | `GROK_API_KEY` (does not work)                                           |
| Groq       | `GROQ_API_KEY`                                 |                                                                          |
| OpenRouter | `OPENROUTER_API_KEY`                           |                                                                          |
| Ollama     | `OLLAMA_HOST`                                  | No API key needed, just the host URL (default: `http://localhost:11434`) |
| Bedrock    | `BEDROCK_API_KEY` / `AWS_BEARER_TOKEN_BEDROCK` | Falls back to SigV4 credentials when no API key is set                   |

Source: adapter source code (`utils/client.ts` in each adapter package).

## References

Detailed per-adapter reference files:

- [OpenAI Adapter](references/openai-adapter.md)
- [Anthropic Adapter](references/anthropic-adapter.md)
- [Gemini Adapter](references/gemini-adapter.md)
- [Ollama Adapter](references/ollama-adapter.md)
- [Grok Adapter](references/grok-adapter.md)
- [Groq Adapter](references/groq-adapter.md)
- [OpenRouter Adapter](references/openrouter-adapter.md)

## Tension

**HIGH Tension: Type safety vs. quick prototyping** -- Per-model type safety
requires specific model string literals. Quick prototyping wants dynamic
selection with `string` variables. Agents optimizing for quick setup silently
lose type safety. If model names come from user input or config files, use
`extendAdapter()` to add custom names.

## Cross-References

- See also: `ai-core/chat-experience/SKILL.md` -- Adapter choice affects chat setup
- See also: `ai-core/structured-outputs/SKILL.md` -- `outputSchema` handles provider differences transparently
