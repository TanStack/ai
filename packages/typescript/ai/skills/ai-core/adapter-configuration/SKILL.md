---
name: ai-core/adapter-configuration
description: >
  Provider adapter selection and configuration: openaiText, anthropicText,
  geminiText, ollamaText, grokText, groqText, openRouterText. Per-model
  type safety with modelOptions, reasoning/thinking configuration,
  runtime adapter switching, extendAdapter() for custom models, createModel().
  API key env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY/GEMINI_API_KEY,
  XAI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, OLLAMA_HOST.
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
> (check the adapter's model metadata file, e.g. `packages/typescript/ai-openai/src/model-meta.ts`)
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
  temperature: 0.7,
  maxTokens: 1000,
})

return toServerSentEventsResponse(stream)
```

The adapter factory function takes the model name as a string literal and an
optional config object (API key, base URL, etc.). The model name is passed
into the factory, not into `chat()`.

## Core Patterns

### 1. Adapter Selection

Each provider has a dedicated package with tree-shakeable adapter factories.
The text adapter is the primary one for chat/completions:

| Provider   | Package                   | Factory          | Env Var                                           |
| ---------- | ------------------------- | ---------------- | ------------------------------------------------- |
| OpenAI     | `@tanstack/ai-openai`     | `openaiText`     | `OPENAI_API_KEY`                                  |
| Anthropic  | `@tanstack/ai-anthropic`  | `anthropicText`  | `ANTHROPIC_API_KEY`                               |
| Gemini     | `@tanstack/ai-gemini`     | `geminiText`     | `GOOGLE_API_KEY` or `GEMINI_API_KEY`              |
| Grok (xAI) | `@tanstack/ai-grok`       | `grokText`       | `XAI_API_KEY`                                     |
| Groq       | `@tanstack/ai-groq`       | `groqText`       | `GROQ_API_KEY`                                    |
| OpenRouter | `@tanstack/ai-openrouter` | `openRouterText` | `OPENROUTER_API_KEY`                              |
| Ollama     | `@tanstack/ai-ollama`     | `ollamaText`     | `OLLAMA_HOST` (default: `http://localhost:11434`) |

```typescript
// Each factory takes model as first arg, optional config as second
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { grokText } from '@tanstack/ai-grok'
import { groqText } from '@tanstack/ai-groq'
import { openRouterText } from '@tanstack/ai-openrouter'
import { ollamaText } from '@tanstack/ai-ollama'

// Model string is passed to the factory, NOT to chat()
const adapter = openaiText('gpt-5.2')
const adapter2 = anthropicText('claude-sonnet-4-6')
const adapter3 = geminiText('gemini-2.5-pro')
const adapter4 = grokText('grok-4')
const adapter5 = groqText('llama-3.3-70b-versatile')
const adapter6 = openRouterText('anthropic/claude-sonnet-4')
const adapter7 = ollamaText('llama3.3')

// Optional: pass explicit API key
const adapterWithKey = openaiText('gpt-5.2', {
  apiKey: 'sk-...',
})
```

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
  maxTokens: 16000,
  modelOptions: {
    thinking: {
      type: 'enabled',
      budget_tokens: 8000, // must be >= 1024 and < maxTokens
    },
  },
})

// Anthropic: adaptive thinking (claude-sonnet-4-6 and newer)
const adaptiveStream = chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages,
  maxTokens: 16000,
  modelOptions: {
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

| Provider   | Correct Env Var                      | Common Mistake                                                           |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------ |
| OpenAI     | `OPENAI_API_KEY`                     |                                                                          |
| Anthropic  | `ANTHROPIC_API_KEY`                  |                                                                          |
| Gemini     | `GOOGLE_API_KEY` or `GEMINI_API_KEY` | `GOOGLE_GENAI_API_KEY` (does not work)                                   |
| Grok (xAI) | `XAI_API_KEY`                        | `GROK_API_KEY` (does not work)                                           |
| Groq       | `GROQ_API_KEY`                       |                                                                          |
| OpenRouter | `OPENROUTER_API_KEY`                 |                                                                          |
| Ollama     | `OLLAMA_HOST`                        | No API key needed, just the host URL (default: `http://localhost:11434`) |

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
