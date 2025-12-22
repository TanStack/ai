---
title: Migration Guide
id: migration
order: 18
---

# Migration Guide

This guide helps you migrate from the previous version of TanStack AI to the latest version. The major changes focus on improved tree-shaking, clearer API naming, and simplified configuration.

## Overview of Changes

The main breaking changes in this release are:

1. **Adapter functions split** - Adapters are now split into activity-specific functions for optimal tree-shaking
2. **Common options flattened** - Options are now flattened in the config instead of nested
3. **`providerOptions` renamed** - Now called `modelOptions` for clarity
4. **`toResponseStream` renamed** - Now called `toServerSentEventsStream` for clarity
5. **Embeddings removed** - Embeddings support has been removed (most vector DB services have built-in support)

## 1. Adapter Functions Split

Adapters have been split into activity-specific functions to enable optimal tree-shaking. Instead of importing a monolithic adapter, you now import specific functions for each activity type.

### Before

```typescript
import { chat } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openai(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

### After

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

### Key Changes

- **Model is passed to adapter factory** - The model name is now passed directly to the adapter function (e.g., `openaiText('gpt-4o')`)
- **No separate `model` parameter** - The model is stored on the adapter, so you don't need to pass it separately to `chat()`
- **Activity-specific imports** - Import only what you need (e.g., `openaiText`, `openaiSummarize`, `openaiImage`)

### All Adapter Functions

Each provider package now exports activity-specific functions:

#### OpenAI

```typescript
import {
  openaiText,          // Chat/text generation
  openaiSummarize,     // Summarization
  openaiImage,         // Image generation
  openaiSpeech,        // Text-to-speech
  openaiTranscription, // Audio transcription
  openaiVideo,         // Video generation
} from '@tanstack/ai-openai'
```

#### Anthropic

```typescript
import {
  anthropicText,       // Chat/text generation
  anthropicSummarize,  // Summarization
} from '@tanstack/ai-anthropic'
```

#### Gemini

```typescript
import {
  geminiText,       // Chat/text generation
  geminiSummarize,  // Summarization
  geminiImage,      // Image generation
  geminiSpeech,     // Text-to-speech (experimental)
} from '@tanstack/ai-gemini'
```

#### Ollama

```typescript
import {
  ollamaText,       // Chat/text generation
  ollamaSummarize,  // Summarization
} from '@tanstack/ai-ollama'
```

### Migration Example

Here's a complete example of migrating adapter usage:

#### Before

```typescript
import { chat } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'
import { anthropic } from '@tanstack/ai-anthropic'

type Provider = 'openai' | 'anthropic'

function getAdapter(provider: Provider) {
  switch (provider) {
    case 'openai':
      return openai()
    case 'anthropic':
      return anthropic()
  }
}

const stream = chat({
  adapter: getAdapter(provider),
  model: provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-5',
  messages,
})
```

#### After

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'

type Provider = 'openai' | 'anthropic'

const adapters = {
  openai: () => openaiText('gpt-4o'),
  anthropic: () => anthropicText('claude-sonnet-4-5'),
}

const stream = chat({
  adapter: adapters[provider](),
  messages,
})
```

## 2. Common Options Flattened

Common options that were previously nested in an `options` object are now flattened directly in the config.

### Before

```typescript
const stream = chat({
  adapter: openai(),
  model: 'gpt-4o',
  messages,
  options: {
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
  },
})
```

### After

```typescript
const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  temperature: 0.7,
  maxTokens: 1000,
  topP: 0.9,
})
```

### Available Options

These options are now available at the top level:

- `temperature` - Controls randomness (0.0 to 2.0)
- `topP` - Nucleus sampling parameter
- `maxTokens` - Maximum tokens to generate
- `metadata` - Additional metadata to attach

## 3. `providerOptions` → `modelOptions`

The `providerOptions` parameter has been renamed to `modelOptions` for clarity. This parameter contains model-specific options that vary by provider and model.

### Before

```typescript
const stream = chat({
  adapter: openai(),
  model: 'gpt-4o',
  messages,
  providerOptions: {
    // OpenAI-specific options
    responseFormat: { type: 'json_object' },
    logitBias: { '123': 1.0 },
  },
})
```

### After

```typescript
const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  modelOptions: {
    // OpenAI-specific options
    responseFormat: { type: 'json_object' },
    logitBias: { '123': 1.0 },
  },
})
```

### Type Safety

`modelOptions` is fully typed based on the adapter and model you're using:

```typescript
import { openaiText } from '@tanstack/ai-openai'

const adapter = openaiText('gpt-4o')

// TypeScript knows the exact modelOptions type for gpt-4o
const stream = chat({
  adapter,
  messages,
  modelOptions: {
    // Autocomplete and type checking for gpt-4o options
    responseFormat: { type: 'json_object' },
  },
})
```

## 4. `toResponseStream` → `toServerSentEventsStream`

The `toResponseStream` function has been renamed to `toServerSentEventsStream` to better reflect its purpose. Additionally, the API has changed slightly.

### Before

```typescript
import { chat, toResponseStream } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const abortController = new AbortController()

  const stream = chat({
    adapter: openai(),
    model: 'gpt-4o',
    messages,
    abortController,
  })

  return toResponseStream(stream, { abortController })
}
```

### After

```typescript
import { chat, toServerSentEventsStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const abortController = new AbortController()

  const stream = chat({
    adapter: openaiText('gpt-4o'),
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

### Key Changes

- **Function renamed** - `toResponseStream` → `toServerSentEventsStream`
- **Returns ReadableStream** - Now returns a `ReadableStream` instead of a `Response`
- **Manual Response creation** - You create the `Response` object yourself with appropriate headers
- **AbortController parameter** - Passed as a separate parameter instead of in options

### Alternative: HTTP Stream Format

If you need HTTP stream format (newline-delimited JSON) instead of SSE, use `toHttpStream`:

```typescript
import { toHttpStream } from '@tanstack/ai'

const readableStream = toHttpStream(stream, abortController)
return new Response(readableStream, {
  headers: {
    'Content-Type': 'application/x-ndjson',
  },
})
```

## 5. Embeddings Removed

Embeddings support has been removed from TanStack AI. Most vector database services (like Pinecone, Weaviate, Qdrant, etc.) have built-in support for embeddings, and most applications pick an embedding model and stick with it.

### Before

```typescript
import { embedding } from '@tanstack/ai'
import { openaiEmbed } from '@tanstack/ai-openai'

const result = await embedding({
  adapter: openaiEmbed(),
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})
```

### After

Use your vector database service's built-in embedding support, or call the provider's API directly:

```typescript
// Example with OpenAI SDK directly
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const result = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})
```

### Why This Change?

- **Vector DB services handle it** - Most vector databases have native embedding support
- **Simpler API** - Reduces API surface area and complexity
- **Direct provider access** - You can use the provider SDK directly for embeddings
- **Focused scope** - TanStack AI focuses on chat, tools, and agentic workflows

## Complete Migration Example

Here's a complete example showing all the changes together:

### Before

```typescript
import { chat, toResponseStream } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const abortController = new AbortController()

  const stream = chat({
    adapter: openai(),
    model: 'gpt-4o',
    messages,
    options: {
      temperature: 0.7,
      maxTokens: 1000,
    },
    providerOptions: {
      responseFormat: { type: 'json_object' },
    },
    abortController,
  })

  return toResponseStream(stream, { abortController })
}
```

### After

```typescript
import { chat, toServerSentEventsStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const abortController = new AbortController()

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    temperature: 0.7,
    maxTokens: 1000,
    modelOptions: {
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

## Benefits of These Changes

1. **Better Tree-Shaking** - Import only what you need, resulting in smaller bundle sizes
2. **Clearer API** - Function names clearly indicate their purpose
3. **Type Safety** - Model-specific options are fully typed
4. **Simpler Configuration** - Flattened options are easier to work with
5. **Focused Scope** - Removed features that are better handled elsewhere

## Need Help?

If you encounter issues during migration:

1. Check the [Tree-Shaking Guide](./tree-shaking) for details on the new adapter structure
2. Review the [API Reference](../api/ai) for complete function signatures
3. Look at the [examples](../getting-started/quick-start) for working code samples

