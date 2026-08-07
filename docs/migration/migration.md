---
title: Migration Guide
id: migration
order: 1
description: "Upgrade TanStack AI: split adapters, modelOptions, toServerSentEventsStream, embeddings removed, provider tools path."
keywords:
  - tanstack ai
  - migration
  - upgrade
  - breaking changes
  - tree-shaking
  - modelOptions
  - toServerSentEventsStream
---

# Migration Guide

If you are on a prior TanStack AI major → apply these renames and splits. Then see [sampling options](./sampling-options-to-model-options) if you still pass root `temperature` / `topP` / `maxTokens`.

## Breaking changes

1. Adapters split by activity (`openaiText`, not `openai`)
2. Sampling later moved into `modelOptions` (see note under options)
3. `providerOptions` → `modelOptions`
4. `toResponseStream` → `toServerSentEventsStream`
5. Embeddings removed; OpenRouter `createWebSearchTool` → `/tools` `webSearchTool`

## 1. Adapter functions split

### Change this → to this

```typescript ignore
// Before
import { chat } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openai(),
  model: 'gpt-5.2',
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

```typescript
// After
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

- Model goes into the adapter factory (`openaiText('gpt-5.2')`)
- No separate `model` on `chat()`
- Import only what you need

### Adapter exports

```typescript
// OpenAI
import {
  openaiText,
  openaiSummarize,
  openaiImage,
  openaiSpeech,
  openaiTranscription,
  openaiVideo,
} from '@tanstack/ai-openai'

// Anthropic
import { anthropicText, anthropicSummarize } from '@tanstack/ai-anthropic'

// Gemini
import {
  geminiText,
  geminiSummarize,
  geminiImage,
  geminiSpeech,
} from '@tanstack/ai-gemini'

// Ollama
import { ollamaText, ollamaSummarize } from '@tanstack/ai-ollama'
```

### Multi-provider switch

```typescript ignore
// Before
function getAdapter(provider: Provider) {
  switch (provider) {
    case 'openai':
      return openai()
    case 'anthropic':
      return anthropic()
  }
}
chat({
  adapter: getAdapter(provider),
  model: provider === 'openai' ? 'gpt-5.2' : 'claude-sonnet-4-5',
  messages,
})
```

```typescript
// After
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'

type Provider = 'openai' | 'anthropic'

const messages = [{ role: 'user' as const, content: 'Hello!' }]

const adapters = {
  openai: () => openaiText('gpt-5.2'),
  anthropic: () => anthropicText('claude-sonnet-4-5'),
}

const provider: Provider = 'openai'

const stream = chat({
  adapter: adapters[provider](),
  messages,
})
```

## 2. Common options

Historical flatten (options nested → root). **Then sampling left the root again:**

```typescript ignore
// Intermediate (root sampling — later removed)
chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  temperature: 0.7,
  maxTokens: 1000,
  topP: 0.9,
})
```

> **Breaking follow-up:** root `temperature` / `topP` / `maxTokens` no longer type-check or take effect. Put them in provider-native `modelOptions`. See [Moving Sampling Options into modelOptions](./sampling-options-to-model-options). `metadata` stays at the root.

## 3. `providerOptions` → `modelOptions`

```typescript ignore
// Before
chat({
  adapter: openai(),
  model: 'gpt-5.2',
  messages,
  providerOptions: {
    responseFormat: { type: 'json_object' },
    logitBias: { '123': 1.0 },
  },
})
```

```typescript ignore
// After
chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  modelOptions: {
    responseFormat: { type: 'json_object' },
    logitBias: { '123': 1.0 },
  },
})
```

`modelOptions` is typed from the adapter + model pair.

## 4. `toResponseStream` → `toServerSentEventsStream`

```typescript ignore
// Before
import { chat, toResponseStream } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const abortController = new AbortController()
  const stream = chat({
    adapter: openai(),
    model: 'gpt-5.2',
    messages,
    abortController,
  })
  return toResponseStream(stream, { abortController })
}
```

```typescript
// After
import { chat, toServerSentEventsStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const abortController = new AbortController()

  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages,
    abortController,
  })

  const readableStream = toServerSentEventsStream(stream, abortController)
  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

| Before | After |
| --- | --- |
| `toResponseStream` | `toServerSentEventsStream` |
| Returns `Response` | Returns `ReadableStream`; build `Response` yourself |
| `{ abortController }` options | `abortController` as second argument |

NDJSON: `toHttpStream(stream, abortController)` with `Content-Type: application/x-ndjson`.

## 5. Embeddings removed

Use the provider SDK or your vector DB:

```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const result = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})
```

## 6. Provider tools → `/tools`

Breaking only for OpenRouter: `createWebSearchTool` left the package root.

```typescript ignore
// Before
import { createWebSearchTool } from '@tanstack/ai-openrouter'
const tools = [createWebSearchTool({ engine: 'native', maxResults: 5 })]
```

```typescript
// After
import { webSearchTool } from '@tanstack/ai-openrouter/tools'
const tools = [webSearchTool({ engine: 'native', maxResults: 5 })]
```

- Import path `/tools` (same pattern as `/adapters`)
- `createWebSearchTool` → `webSearchTool`
- Runtime config unchanged; models without support now type-error on `tools`

Full list: [Provider Tools](../tools/provider-tools.md).

## Complete example

```typescript ignore
// Before
import { chat, toResponseStream } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const abortController = new AbortController()
  const stream = chat({
    adapter: openai(),
    model: 'gpt-5.2',
    messages,
    options: { temperature: 0.7, maxTokens: 1000 },
    providerOptions: { responseFormat: { type: 'json_object' } },
    abortController,
  })
  return toResponseStream(stream, { abortController })
}
```

```typescript ignore
// After
import { chat, toServerSentEventsStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const abortController = new AbortController()

  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages,
    modelOptions: {
      temperature: 0.7,
      max_output_tokens: 1000,
      responseFormat: { type: 'json_object' },
    },
    abortController,
  })

  const readableStream = toServerSentEventsStream(stream, abortController)
  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

## Help

1. [Tree-Shaking Guide](../advanced/tree-shaking)
2. [API Reference](../api/ai)
3. [Quick Start](../getting-started/quick-start)
4. [Sampling → modelOptions](./sampling-options-to-model-options)
