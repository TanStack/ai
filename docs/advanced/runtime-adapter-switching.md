---
title: Runtime Adapter Switching
id: runtime-adapter-switching
order: 6
description: "Let users switch between LLM providers at runtime in TanStack AI while keeping full TypeScript type safety for each adapter's model options."
keywords:
  - tanstack ai
  - runtime switching
  - multi-provider
  - adapter factory
  - type safety
  - dynamic adapter
---

Learn how to build interfaces where users can switch between LLM providers at runtime while maintaining full TypeScript type safety.

## The Simple Approach

With TanStack AI, the model is passed directly to the adapter factory function. This gives you full type safety and autocomplete at the point of definition:

```typescript
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

// Each factory retains its model's option types.
const adapters = {
  anthropic: () => anthropicText('claude-sonnet-5-5'),
  openai: () => openaiText('gpt-5.5'),
}

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const provider = params.forwardedProps.provider === 'anthropic' ? 'anthropic' : 'openai'

  const stream = chat({
    adapter: adapters[provider](),
    messages: params.messages,
  })
  return toServerSentEventsResponse(stream)
}
```

## Keep saved history when you switch

A conversation can contain replies from several providers. Keep each message's metadata when you save or send the history. `chat()` records the source under `metadata.tanstack.source`:

```json
{
  "provider": "openai",
  "api": "openai-responses",
  "model": "gpt-5.5"
}
```

The provider, wire API, and requested model must all match for same-source replay. `metadata.tanstack.model` holds the provider-reported response model when available. It can differ from the requested model.

For foreign history, the target adapter converts readable thinking to text and drops foreign signatures and redacted thinking. It also remaps tool call IDs and their results together. Messages without source metadata receive the same-source treatment.

Core prepares a request copy of the history:

- Failed or aborted assistant messages and their associated tool results are omitted.
- Unanswered tool calls receive an error result: `No result provided`.
- System messages between a tool call and its results move after the results.

These changes leave your saved transcript intact. A transport disconnect alone does not mark a provider reply as failed.

Subagent cards use a separate view of the saved transcript. A host message holds the routed subagents' answers. The card view removes only a host that it can identify. Ordinary assistant text and ambiguous messages stay. A new host uses an unused ID, so existing replies stay.

Gemini replays saved thinking and ordered tool history through its supported wire fields. This also applies to same-source and source-free history with thinking. Ordinary history without these parts retains its request shape.

Use the existing request parser on the server to retain message metadata:

```typescript
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const adapter = params.forwardedProps.provider === 'anthropic'
    ? anthropicText('claude-sonnet-5-5')
    : openaiText('gpt-5.5')

  return toServerSentEventsResponse(chat({
    adapter,
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  }))
}
```

Send the selected provider from the client:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function ProviderChat() {
  const [provider, setProvider] = useState('openai')
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    forwardedProps: { provider },
  })

  return (
    <>
      <select aria-label="Provider" value={provider} onChange={(event) => setProvider(event.target.value)}>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
      </select>
      <button onClick={() => sendMessage('Continue our conversation')}>Continue</button>
      <p>{messages.length} messages in this conversation</p>
    </>
  )
}
```

The next request uses the selected provider with the same conversation history.

## Adapter model types

Each adapter factory function accepts a model name as its first argument and returns a fully typed adapter:

```typescript
import { openaiText, OpenAITextAdapter } from '@tanstack/ai-openai'

// These are equivalent:
const adapter1 = openaiText('gpt-5.5')
const adapter2 = new OpenAITextAdapter({ apiKey: process.env.OPENAI_API_KEY! }, 'gpt-5.5')

// The model is stored on the adapter
console.log(adapter1.model) // 'gpt-5.5'
```

When you pass an adapter to `chat()`, it uses the model from `adapter.model`. This means:

- **Full autocomplete** - When typing the model name, TypeScript knows valid options
- **Type validation** - Invalid model names cause compile errors
- **Clean code** - No separate `model` parameter needed

## Full Example

Here's a complete example showing a multi-provider chat API:

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

// Define adapters with their models
const adapters = {
  anthropic: () => anthropicText('claude-sonnet-5-5'),
  gemini: () => geminiText('gemini-3.8-flash'),
  ollama: () => ollamaText('mistral:7b'),
  openai: () => openaiText('gpt-5.5'),
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const params = await chatParamsFromRequest(request)
        const selected = params.forwardedProps.provider
        const provider: Provider = selected === 'anthropic' || selected === 'gemini' || selected === 'ollama'
          ? selected : 'openai'

        const stream = chat({
          adapter: adapters[provider](),
          messages: params.messages,
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
```

## Using with Image Adapters

The same pattern works for image generation. Unlike the text and summarize adapters above, image adapters don't all accept the same shape of `size` — so it travels alongside its adapter in the provider map instead of being passed once for every branch:

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { geminiImage } from '@tanstack/ai-gemini'

type ImageProvider = 'openai' | 'gemini'

const imageAdapters = {
  openai: () => ({ adapter: openaiImage('gpt-image-2'), size: '1024x1024' as const }),
  gemini: () => ({ adapter: geminiImage('gemini-3.1-flash-image'), size: '16:9_4K' as const }),
}

export async function POST(request: Request) {
  const body = await request.json()
  const provider: ImageProvider = body.provider ?? 'openai'
  const { adapter, size } = imageAdapters[provider]()

  const result = await generateImage({
    adapter,
    prompt: 'A beautiful sunset over mountains',
    size,
  })

  return Response.json(result)
}
```

`size` is provider-specific, which is why it cannot be a single literal shared across branches. Gemini 3.x native image models take a `'<aspectRatio>_<tier>'` string (for example `'16:9_4K'`). `gemini-2.5-flash-image` takes a bare ratio with no suffix (for example `'16:9'`). OpenAI and Imagen models take pixel dimensions (for example `'1024x1024'`).

## Using with Summarize Adapters

And for summarization:

```typescript
import { summarize } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'

type SummarizeProvider = 'openai' | 'anthropic'

const summarizeAdapters: Record<SummarizeProvider, () => ReturnType<typeof openaiSummarize | typeof anthropicSummarize>> = {
  openai: () => openaiSummarize('gpt-5.5'),
  anthropic: () => anthropicSummarize('claude-sonnet-5-5'),
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

## Migration from Switch Statements

You can replace a provider switch with a map of adapter factories. Both forms keep the model on its adapter.

### Before

```typescript
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  let adapter
  switch (params.forwardedProps.provider) {
    case 'anthropic':
      adapter = anthropicText('claude-sonnet-5-5')
      break
    default:
      adapter = openaiText('gpt-5.5')
      break
  }

  return toServerSentEventsResponse(chat({ adapter, messages: params.messages }))
}
```

### After

```typescript
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

const adapters = {
  anthropic: () => anthropicText('claude-sonnet-5-5'),
  openai: () => openaiText('gpt-5.5'),
}

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const provider = params.forwardedProps.provider === 'anthropic' ? 'anthropic' : 'openai'
  return toServerSentEventsResponse(chat({
    adapter: adapters[provider](),
    messages: params.messages,
  }))
}
```

Each factory retains the selected model's types. The map lets you add a provider in one place.
