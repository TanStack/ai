---
title: Migration Guide
id: migration
order: 1
description: "Move code from an early TanStack AI 0.x release: split adapter functions, modelOptions, the SSE helpers, embed(), provider tools on /tools, and the { text, chunks } result."
keywords:
  - tanstack ai
  - migration
  - upgrade
  - breaking changes
  - tree-shaking
  - modelOptions
  - toServerSentEventsStream
---

Early 0.x called `openai()`, passed `model` to `chat()`, and used `providerOptions` or `toResponseStream`. Replace those first, then follow [Upgrade to 1.0](./v1).

## What changed

| Old | New | Section |
| --- | --- | --- |
| `openai()` plus a `model` option | `openaiText('<model>')` | [1](#1-adapter-functions-split) |
| `options: { temperature, topP, maxTokens }` and `providerOptions` | `modelOptions`, with the provider's own key names | [2](#2-options-moved-into-modeloptions) |
| `toResponseStream(stream, { abortController })` | `toServerSentEventsStream(stream, abortController)` or `toServerSentEventsResponse(stream)` | [3](#3-toresponsestream-is-now-toserversenteventsstream) |
| `embedding()` with `openaiEmbed()` | `embed()` with `openaiEmbedding('<model>')` | [4](#4-embedding-is-now-embed) |
| `createWebSearchTool` from `@tanstack/ai-openrouter` | `webSearchTool` from `@tanstack/ai-openrouter/tools` | [5](#5-provider-tools-moved-to-tools) |
| `chat({ stream: false })` resolves to a string | It resolves to `{ text, chunks }` | [6](#6-stream-false-returns-an-object) |

## Upgrade

1. Go through the sections below in order. Skip a section if your code does not use the old API.
2. For section 2, run the [sampling codemod](./sampling-options-to-model-options#run-the-codemod). It moves the sampling options into `modelOptions` for you.
3. Run your type checker, and fix the errors that are left.
4. Do [Upgrade to 1.0](./v1).

## 1. Adapter functions split

Each provider exports one function for each activity. The model id goes into that function, so `chat()` has no `model` option.

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
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello!' }],
  threadId: 'thread-1',
})
```

Import only the functions that you use:

```typescript
import {
  openaiText,          // Chat/text generation
  openaiSummarize,     // Summarization
  openaiImage,         // Image generation
  openaiSpeech,        // Text-to-speech
  openaiTranscription, // Audio transcription
  openaiVideo,         // Video generation
  openaiEmbedding,     // Embeddings
} from '@tanstack/ai-openai'
```

```typescript
import {
  anthropicText,       // Chat/text generation
  anthropicSummarize,  // Summarization
} from '@tanstack/ai-anthropic'
```

```typescript
import {
  geminiText,       // Chat/text generation
  geminiSummarize,  // Summarization
  geminiImage,      // Image generation
  geminiSpeech,     // Text-to-speech (experimental)
} from '@tanstack/ai-gemini'
```

```typescript
import {
  ollamaText,       // Chat/text generation
  ollamaSummarize,  // Summarization
} from '@tanstack/ai-ollama'
```

If you switch providers at runtime, keep a map of adapter functions:

```typescript ignore
// Before
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
  openai: () => openaiText('gpt-6.1-sol'),
  anthropic: () => anthropicText('claude-sonnet-5-5'),
}

const provider: Provider = 'openai'

const stream = chat({
  adapter: adapters[provider](),
  messages,
  threadId: 'thread-1',
})
```

For more on the split, see [Tree-Shaking](../advanced/tree-shaking).

## 2. Options moved into `modelOptions`

This change came in two releases:

1. The `options` object was flattened. `temperature`, `topP`, and `maxTokens` moved to the root of `chat()`, and `providerOptions` was renamed to `modelOptions`.
2. Later, the root `temperature`, `topP`, and `maxTokens` were removed. They now live in `modelOptions`, under the key name of each provider.

`metadata` stays at the root of `chat()`.

```typescript ignore
// Before
const stream = chat({
  adapter: openai(),
  model: 'gpt-5.2',
  messages,
  options: {
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
  },
  providerOptions: {
    responseFormat: { type: 'json_object' },
    logitBias: { '123': 1.0 },
  },
})
```

```typescript
// After
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello!' }]

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  modelOptions: {
    temperature: 0.7,
    max_output_tokens: 1000,
    top_p: 0.9,
  },
})
```

The keys in `modelOptions` are the keys of the provider API. `openaiText` has no `responseFormat` or `logitBias` key. For typed JSON output, use [`outputSchema`](../structured-outputs/overview).

`modelOptions` is typed from the adapter and the model that you pass. Your editor shows the keys that your model accepts. For the key names of each provider, see [Moving Sampling Options into modelOptions](./sampling-options-to-model-options).

## 3. `toResponseStream` is now `toServerSentEventsStream`

`toServerSentEventsStream` returns a `ReadableStream`, not a `Response`. It takes the `AbortController` as the second argument, not in an options object.

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
  const { messages, threadId } = await request.json()
  const abortController = new AbortController()

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
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

If you do not need your own `Response`, return `toServerSentEventsResponse(stream, { abortController })`. It makes the `Response` for you.

For newline-delimited JSON, not SSE, use `toHttpStream`:

```typescript ignore
import { toHttpStream } from '@tanstack/ai'

const readableStream = toHttpStream(stream, abortController)
return new Response(readableStream, {
  headers: {
    'Content-Type': 'application/x-ndjson',
  },
})
```

## 4. `embedding()` is now `embed()`

The old `embedding()` function was removed. Embeddings came back as a new activity, `embed()`. The old `embedding()` name and the old adapter factories (like `openaiEmbed()`) do not come back.

```typescript ignore
// Before
import { embedding } from '@tanstack/ai'
import { openaiEmbed } from '@tanstack/ai-openai'

const result = await embedding({
  adapter: openaiEmbed(),
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})
```

```typescript
// After
import { embed } from '@tanstack/ai'
import { openaiEmbedding } from '@tanstack/ai-openai'

const result = await embed({
  adapter: openaiEmbedding('text-embedding-3-small'),
  input: 'Hello, world!',
})

console.log(result.embeddings[0]?.vector)
```

What is different:

- **The model goes into the adapter function**, the same as every other activity.
- **One function for one input or many.** `input` takes one item or an array. The result always has an `embeddings` array, with one vector for each input item.
- **Multimodal input.** Models like Cohere embed-v4.0 and Amazon Titan Multimodal take image parts, and text and image together.
- **`dimensions` is a root option.** Request Matryoshka dimensions with no provider-specific option.

See the [Embeddings guide](../embeddings.md).

## 5. Provider tools moved to `/tools`

Each adapter package exports its provider tools (web search, code execution, computer use, and more) from a `/tools` subpath.

Only `@tanstack/ai-openrouter` has a breaking change. `createWebSearchTool` is gone from the package root. It is now `webSearchTool`, from `@tanstack/ai-openrouter/tools`. The provider tools of Anthropic, OpenAI, and Gemini were new exports, so no import breaks there.

```typescript ignore
// Before
import { createWebSearchTool } from '@tanstack/ai-openrouter'

const tools = [
  createWebSearchTool({ engine: 'native', maxResults: 5 }),
]
```

```typescript
// After
import { webSearchTool } from '@tanstack/ai-openrouter/tools'

const tools = [
  webSearchTool({ engine: 'native', maxResults: 5 }),
]
```

- **The config and the behavior do not change.** The factory takes the same config object. The tool works the same in `chat({ tools: [...] })`.
- **The `create` prefix is gone**, to match the other providers (`webSearchTool` in `@tanstack/ai-anthropic/tools`, `@tanstack/ai-openai/tools`, and more).
- **New: type-level gating.** The `supports.tools` list of each model names the provider tools that it supports. If you pass a provider tool that is not in the list, you get a type error on the `tools` array. Your `toolDefinition()` tools are not affected.

For each provider tool and the models that support it, see [Provider Tools](../tools/provider-tools.md).

## 6. `stream: false` returns an object

`chat({ stream: false })` and `streamToText(stream)` resolve to a `ChatResult` object, not a string. Read `text` from the result.

```diff
- const text = await chat({ adapter, messages, stream: false })
+ const { text } = await chat({ adapter, messages, stream: false })

- const streamedText = await streamToText(stream)
+ const { text: streamedText } = await streamToText(stream)
```

```typescript
// After
import { chat, streamToText } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const { text } = await chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello!' }],
  threadId: 'thread-1',
  stream: false,
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello!' }],
  threadId: 'thread-1',
})
const { text: streamedText } = await streamToText(stream)
```

`text` is the same string as before. The new `chunks` array holds every chunk of the run, so you can also read tool calls, usage, and interrupts. See [`chat()` returns](../api/ai.md#returns).

With `outputSchema`, `stream: false` still resolves to the parsed object.

## All changes together

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

```typescript
// After
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()
  const abortController = new AbortController()

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    modelOptions: {
      temperature: 0.7,
      max_output_tokens: 1000,
    },
    abortController,
  })

  return toServerSentEventsResponse(stream, { abortController })
}
```

## Done

Your code has no `openai()`, `model:`, `options:`, `providerOptions`, `toResponseStream`, or `embedding()` call, and your type checker passes. Next, do [Upgrade to 1.0](./v1).
