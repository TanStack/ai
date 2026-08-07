---
title: Runtime Adapter Switching
id: runtime-adapter-switching
order: 6
description: "Switch LLM providers at runtime with a factory map while keeping per-adapter model types."
keywords:
  - tanstack ai
  - runtime switching
  - multi-provider
  - adapter factory
  - type safety
  - dynamic adapter
---

If users pick a provider at runtime → map provider keys to adapter factories that already bake in the model.

## Pattern

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

type Provider = 'openai' | 'anthropic'

const adapters = {
  anthropic: () => anthropicText('claude-sonnet-4-6'),
  openai: () => openaiText('gpt-5.5'),
}

async function handleRequest(request: Request) {
  const body = await request.json()
  const provider: Provider = body.forwardedProps?.provider || 'openai'

  const stream = chat({
    adapter: adapters[provider](),
    messages: body.messages,
  })

  return toServerSentEventsResponse(stream)
}
```

Model is the first factory arg; `chat()` uses `adapter.model`. Autocomplete and invalid-name errors happen at the factory call site.

```typescript
import { openaiText, OpenAITextAdapter } from '@tanstack/ai-openai'

// Equivalent:
const adapter1 = openaiText('gpt-5.5')
const adapter2 = new OpenAITextAdapter(
  { apiKey: process.env.OPENAI_API_KEY! },
  'gpt-5.5',
)

console.log(adapter1.model) // 'gpt-5.5'
```

## Full multi-provider route

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

const adapters = {
  anthropic: () => anthropicText('claude-sonnet-4-6'),
  gemini: () => geminiText('gemini-3-flash-preview'),
  ollama: () => ollamaText('mistral:7b'),
  openai: () => openaiText('gpt-5.5'),
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const body = await request.json()
        // Prefer forwardedProps (AG-UI). Legacy body.data.provider still mirrored.
        const provider: Provider = body.forwardedProps?.provider || 'openai'

        const stream = chat({
          adapter: adapters[provider](),
          tools: [...],
          systemPrompts: [...],
          messages: body.messages,
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
```

## Image adapters

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { geminiImage } from '@tanstack/ai-gemini'

type ImageProvider = 'openai' | 'gemini'

const imageAdapters = {
  openai: () => openaiImage('gpt-image-2'),
  gemini: () => geminiImage('gemini-3.1-flash-image-preview'),
}

export async function POST(request: Request) {
  const body = await request.json()
  const provider: ImageProvider = body.provider ?? 'openai'

  const result = await generateImage({
    adapter: imageAdapters[provider](),
    prompt: 'A beautiful sunset over mountains',
    size: '1024x1024',
  })

  return Response.json(result)
}
```

## Summarize adapters

```typescript
import { summarize } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'

type SummarizeProvider = 'openai' | 'anthropic'

const summarizeAdapters = {
  openai: () => openaiSummarize('gpt-5.4-mini'),
  anthropic: () => anthropicSummarize('claude-sonnet-4-6'),
}

export async function POST(request: Request) {
  const body = await request.json()
  const provider: SummarizeProvider = body.provider ?? 'openai'
  const longDocument: string = body.text

  const result = await summarize({
    adapter: summarizeAdapters[provider](),
    text: longDocument,
    maxLength: 100,
    style: 'concise',
  })

  return Response.json(result)
}
```

## Migrate from switch + casts

**Before** (avoid): switch sets adapter/model separately, often with type casts.

**After:**

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

type AfterProvider = 'openai' | 'anthropic'

const adapters = {
  anthropic: () => anthropicText('claude-sonnet-4-6'),
  openai: () => openaiText('gpt-5.5'),
}

export async function POST(request: Request) {
  const body = await request.json()
  const provider: AfterProvider = body.forwardedProps?.provider ?? 'openai'

  const stream = chat({
    adapter: adapters[provider](),
    messages: body.messages,
  })

  return toServerSentEventsResponse(stream)
}
```

1. Replace switch with factory object  
2. Include the model in each factory  
3. Drop type casts  
