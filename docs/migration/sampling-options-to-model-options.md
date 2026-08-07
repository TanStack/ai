---
title: Moving Sampling Options into modelOptions
---

# Moving Sampling Options into `modelOptions`

**Breaking.** Root `temperature` / `topP` / `maxTokens` on `chat()` / `ai()` / `generate()` are **removed**. Put them in provider-native `modelOptions` under each provider’s key. Root usage no longer type-checks or runs. `metadata` stays at the root.

## Change this → to this

```typescript ignore
// Before
chat({
  adapter: openaiText('gpt-4o'),
  messages,
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 100,
})
```

```typescript
// After
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: openaiText('gpt-4o'),
  messages,
  modelOptions: {
    temperature: 0.3,
    top_p: 0.9,
    max_output_tokens: 100,
  },
})
```

Why: one place for model knobs, keys match the provider API, and `modelOptions` is typed per adapter+model.

## By provider

### OpenAI

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: openaiText('gpt-4o'),
  messages,
  modelOptions: {
    temperature: 0.3,
    top_p: 0.9,
    max_output_tokens: 100,
  },
})
```

### Anthropic

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: anthropicText('claude-sonnet-4-5'),
  messages,
  modelOptions: {
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 1024,
  },
})
```

### Gemini

```typescript
import { chat } from '@tanstack/ai'
import { geminiText } from '@tanstack/ai-gemini'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: geminiText('gemini-3.1-pro-preview'),
  messages,
  modelOptions: {
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 2048,
  },
})
```

### Ollama (nested under `options`)

```typescript ignore
import { chat } from '@tanstack/ai'
import { ollamaText } from '@tanstack/ai-ollama'

chat({
  adapter: ollamaText('llama3'),
  messages,
  modelOptions: {
    options: {
      temperature: 0.3,
      top_p: 0.9,
      num_predict: 1000,
    },
  },
})
```

## Key reference

| Root prop | OpenAI | Anthropic | Gemini | Grok | Groq | OpenRouter | Ollama |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `temperature` | `temperature` | `temperature` | `temperature` | `temperature` | `temperature` | `temperature` | `options.temperature` |
| `topP` | `top_p` | `top_p` | `topP` | `top_p` | `top_p` | `topP` | `options.top_p` |
| `maxTokens` | `max_output_tokens` | `max_tokens` | `maxOutputTokens` | `max_tokens` | `max_completion_tokens` | `maxCompletionTokens` | `options.num_predict` |

## Codemod

```bash
pnpm codemod:move-sampling-to-model-options "src/**/*.{ts,tsx}"
```

Or without a clone:

```bash
npx jscodeshift \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/move-sampling-to-model-options/transform.ts \
  "src/**/*.{ts,tsx}"
```

Add `--dry --print` to preview.

**Targets:** `chat()`, `ai()`, `generate()`, `createChatOptions()` from `@tanstack/ai`. Resolves provider from `adapter:` factory; Ollama nests under `modelOptions.options`; merges into existing `modelOptions` literals.

**Leaves call untouched** (never partial) when: adapter unresolvable, `modelOptions` not a plain object literal, or target key already exists. Full details: [`codemods/move-sampling-to-model-options/README.md`](https://github.com/TanStack/ai/blob/main/codemods/move-sampling-to-model-options/README.md).

## Stays at root

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: openaiText('gpt-4o'),
  messages,
  metadata: { requestId: 'abc-123' },
  modelOptions: {
    temperature: 0.3,
    max_output_tokens: 100,
  },
})
```

## Help

- [Per-Model Type Safety](../advanced/per-model-type-safety)
- [API Reference](../api/ai)
- Provider pages: [OpenAI](../adapters/openai), [Anthropic](../adapters/anthropic), [Gemini](../adapters/gemini), [Ollama](../adapters/ollama)
