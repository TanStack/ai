---
title: Runtime Adapter Switching
id: runtime-adapter-switching
order: 6
description: "Let users pick the LLM provider at runtime. Each adapter keeps its types, and the chat history keeps working when the provider changes."
keywords:
  - tanstack ai
  - runtime switching
  - multi-provider
  - adapter factory
  - type safety
  - dynamic adapter
---

One endpoint can call Claude for one turn and GPT for the next. The history stays typed across the switch.

Keep a map of adapter factories on the server. The client sends the provider that the user picked, and the server picks the adapter from the map.

## Quick setup

### 1. Pick the adapter on the server

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

const adapters = {
  anthropic: () => anthropicText('claude-sonnet-5-5'),
  openai: () => openaiText('gpt-6.1-sol'),
}

type Provider = keyof typeof adapters

function isProvider(value: unknown): value is Provider {
  return value === 'anthropic' || value === 'openai'
}

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const requested = params.forwardedProps.provider
  const provider: Provider = isProvider(requested) ? requested : 'openai'

  const stream = chat({
    adapter: adapters[provider](),
    messages: params.messages,
    threadId: params.threadId,
  })

  return toServerSentEventsResponse(stream)
}
```

### 2. Send the provider from the client

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function ProviderChat() {
  const [provider, setProvider] = useState('anthropic')
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
    forwardedProps: { provider },
  })

  return (
    <>
      <select
        aria-label="Provider"
        value={provider}
        onChange={(event) => setProvider(event.target.value)}
      >
        <option value="anthropic">Claude</option>
        <option value="openai">GPT</option>
      </select>
      <button onClick={() => sendMessage('Keep going')}>Send</button>
    </>
  )
}
```

Switch the provider in the middle of a thread. The next answer comes from the new model, with the full history.

## How it works

The adapter factory takes the model name as its first argument. The adapter keeps the model, so `chat()` needs no separate `model` option.

- You get autocomplete for the model name where you write the map.
- A wrong model name is a compile error.
- Each entry in the map keeps its own types, so you need no casts.

Treat `forwardedProps` as client input. The `isProvider` check accepts only the names in your map.

## Keep saved history when you switch

You start a thread on Claude, then switch to GPT. The thinking signatures and tool call IDs of Claude mean nothing to OpenAI. If you send them as they are, the request fails.

You do not have to fix this yourself. Keep the message metadata when you save and send the history. `chat()` does the rest. On the server, `chatParamsFromRequest` keeps the message metadata for you.

Each assistant message records where it came from, in `metadata.tanstack.source`:

```json
{ "provider": "anthropic", "api": "anthropic-messages", "model": "claude-sonnet-5-5" }
```

When the next call goes to a different source, the adapter changes the request:

- It drops signatures and redacted thinking.
- It sends readable thinking as plain text.
- It rewrites tool call IDs to the shape that the new API accepts. Each result keeps its call.
- An OpenAI-compatible or OpenRouter adapter can know that the model has no image input. Then it sends no images from tool results. See [Images in Tool Results](./multimodal-content#images-in-tool-results).

Each request also cleans the history:

- An answer that failed or was aborted is left out, with its tool results.
- A tool call with no result gets the result `No result provided`.

All of this changes only the request. Your saved history stays the same. A message with no `source` counts as same-source, so its signatures go back as they are.

## Advanced

### The factory and the class

The factory and the adapter class give the same adapter:

```typescript
import { openaiText, OpenAITextAdapter } from '@tanstack/ai-openai'

const adapter1 = openaiText('gpt-6.1-sol')
const adapter2 = new OpenAITextAdapter(
  { apiKey: process.env.OPENAI_API_KEY ?? '' },
  'gpt-6.1-sol',
)

// The model is stored on the adapter
console.log(adapter1.model) // 'gpt-6.1-sol'
```

`chat()` reads the model from `adapter.model`.

### Replace a switch statement

Do you have a `switch` that sets an adapter and a model in two variables? Replace it with the map of factories from the quick setup. Each factory creates the adapter with its model, so the `chat()` call needs no casts.

### Full example with four providers

A TanStack Start route that serves OpenAI, Anthropic, Gemini, and Ollama:

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'
import { openaiText } from '@tanstack/ai-openai'

const adapters = {
  anthropic: () => anthropicText('claude-sonnet-5-5'),
  gemini: () => geminiText('gemini-3.8-flash'),
  ollama: () => ollamaText('mistral:7b'),
  openai: () => openaiText('gpt-6.1-sol'),
}

type Provider = keyof typeof adapters

function isProvider(value: unknown): value is Provider {
  return (
    value === 'anthropic' ||
    value === 'gemini' ||
    value === 'ollama' ||
    value === 'openai'
  )
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const params = await chatParamsFromRequest(request)
        // `forwardedProps` is the AG-UI field that `useChat({ forwardedProps })` sets.
        const requested = params.forwardedProps.provider
        const provider: Provider = isProvider(requested) ? requested : 'openai'

        const stream = chat({
          adapter: adapters[provider](),
          systemPrompts: ['You are a helpful assistant.'],
          messages: params.messages,
          threadId: params.threadId,
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
```

### Image adapters

The same pattern works for image generation. Image adapters do not all accept the same shape of `size`, so each entry in the map carries its own `size`:

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'
import { openaiImage } from '@tanstack/ai-openai'

const imageAdapters = {
  openai: () => ({ adapter: openaiImage('gpt-image-2.5-sunburst'), size: '1024x1024' as const }),
  gemini: () => ({ adapter: geminiImage('gemini-3.1-flash-image'), size: '16:9_4K' as const }),
}

export async function POST(request: Request) {
  const body: unknown = await request.json()
  const requested =
    typeof body === 'object' && body !== null && 'provider' in body
      ? body.provider
      : undefined
  const { adapter, size } =
    requested === 'gemini' ? imageAdapters.gemini() : imageAdapters.openai()

  const result = await generateImage({
    adapter,
    prompt: 'A beautiful sunset over mountains',
    threadId: 'thread-1',
    size,
  })

  return Response.json(result)
}
```

`size` is specific to the provider:

- Gemini 3.x native image models take a `'<aspectRatio>_<tier>'` string, for example `'16:9_4K'`.
- OpenAI and Imagen models take pixel dimensions, for example `'1024x1024'`.

### Summarize adapters

The same pattern works for summarization:

```typescript
import { summarize } from '@tanstack/ai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'
import { openaiSummarize } from '@tanstack/ai-openai'

type SummarizeProvider = 'openai' | 'anthropic'

const summarizeAdapters: Record<
  SummarizeProvider,
  () => ReturnType<typeof openaiSummarize | typeof anthropicSummarize>
> = {
  openai: () => openaiSummarize('gpt-5.4-mini'),
  anthropic: () => anthropicSummarize('claude-sonnet-5-5'),
}

export async function POST(request: Request) {
  const body: unknown = await request.json()
  if (typeof body !== 'object' || body === null) {
    return new Response('Bad request', { status: 400 })
  }
  const provider: SummarizeProvider =
    'provider' in body && body.provider === 'anthropic' ? 'anthropic' : 'openai'
  const text = 'text' in body && typeof body.text === 'string' ? body.text : ''

  const result = await summarize({
    adapter: summarizeAdapters[provider](),
    text,
    threadId: 'thread-1',
    maxLength: 100,
    style: 'concise',
  })

  return Response.json(result)
}
```
