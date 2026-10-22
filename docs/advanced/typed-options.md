---
title: Typed Pre-Configured Options
id: typed-options
order: 11
description: "Define a typed options object once with createChatOptions and the other create*Options helpers, and use it in many routes. You keep the type checks for each model."
keywords:
  - tanstack ai
  - createChatOptions
  - createSummarizeOptions
  - createImageOptions
  - createSpeechOptions
  - createTranscriptionOptions
  - createAudioOptions
  - createVideoOptions
  - typed options
  - shared configuration
---

`createChatOptions` stores one adapter, system prompt, and tool list. Each route spreads that object and keeps the model types.

Define the config once with `createChatOptions`. The object keeps the full type of the adapter, so `modelOptions`, content types, and `outputSchema` stay checked where you spread it.

## Quick setup

### 1. Define the options once

```typescript
// lib/ai/chat-options.ts
import { createChatOptions, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const orders = new Map([['A-100', { id: 'A-100', status: 'shipped' }]])

const lookupOrder = toolDefinition({
  name: 'lookupOrder',
  description: 'Look up a customer order by ID',
  inputSchema: z.object({ orderId: z.string() }),
}).server(async ({ orderId }) => orders.get(orderId) ?? null)

export const supportChatOptions = createChatOptions({
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: ['You are a customer-support assistant for Acme Corp.'],
  tools: [lookupOrder],
  reasoning: 'medium',
  // Sampling settings go in modelOptions, under the key of the provider.
  modelOptions: {
    temperature: 0.3,
  },
})
```

### 2. Spread the options into `chat()`

```typescript
// routes/api/support/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { supportChatOptions } from '../../../lib/ai/chat-options'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({ ...supportChatOptions, messages, threadId, runId })

  return toServerSentEventsResponse(stream)
}
```

Every route that spreads `supportChatOptions` now uses the same model, prompt, and tools, with full type checks.

## Change one field per route

The spread wins from the right. Add or override any field at the call site. This route uses the same options, and adds a schema for a structured answer:

```typescript
// routes/api/support/draft-reply.ts
import { chat } from '@tanstack/ai'
import { z } from 'zod'
import { supportChatOptions } from '../../../lib/ai/chat-options'

export async function POST(request: Request) {
  const body: unknown = await request.json()
  const ticket =
    typeof body === 'object' && body !== null && 'ticket' in body
      ? String(body.ticket)
      : ''

  const draft = await chat({
    ...supportChatOptions,
    messages: [{ role: 'user', content: `Draft a reply to: ${ticket}` }],
    threadId: 'thread-1',
    outputSchema: z.object({ subject: z.string(), body: z.string() }),
    stream: false,
  })

  return Response.json(draft)
}
```

## When to use it

- You share one config across many routes.
- You pass options through a layer (a server function, a wrapper, a test fixture) and want to keep the types of the model.
- You pick between two configs at runtime. Build two options objects and choose one, so the `chat()` call has no conditions inside it.
- You keep tools, system prompts, and middleware next to the adapter that they target.

If you call an activity once in one place, you do not need the helper. Write the options inline.

## The same pattern for media

Each activity has its own helper. For example, an image:

```typescript
import { createImageOptions, generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const heroImageOptions = createImageOptions({
  adapter: openaiImage('gpt-image-2.5-sunburst'),
  prompt: 'A glass sphere refracting a sunset over a calm sea',
  threadId: 'thread-1',
  size: '1536x1024',
  numberOfImages: 1,
})

const result = await generateImage(heroImageOptions)
```

## Available helpers

All helpers come from `@tanstack/ai`. Each one takes the same options as its activity.

| Helper | Activity | Adapter examples |
|---|---|---|
| `createChatOptions` | `chat()` | `openaiText`, `anthropicText` |
| `createSummarizeOptions` | `summarize()` | `openaiSummarize` |
| `createEmbedOptions` | `embed()` | `openaiEmbedding`, `geminiEmbedding` |
| `createRerankOptions` | `rerank()` | `cohereRerank` |
| `createImageOptions` | `generateImage()` | `openaiImage`, `falImage` |
| `createAudioOptions` | `generateAudio()` | `falAudio`, `geminiAudio` |
| `createVideoOptions` | `generateVideo()`, `getVideoJobStatus()` | `falVideo`, `openaiVideo` |
| `createLiveVideoOptions` | `generateLiveVideo()` | `reactorVideo`, `falLiveVideo` |
| `createWorldOptions` | `generateWorld()` | `reactorWorld`, `worldlabsWorld` |
| `createSpeechOptions` | `generateSpeech()` | `openaiSpeech`, `elevenlabsSpeech` |
| `createVoiceOptions` | `generateVoice()` | `elevenlabsVoiceDesign` |
| `createTranscriptionOptions` | `generateTranscription()` | `openaiTranscription`, `falTranscription` |

## Advanced

### How it works

At runtime, each helper is the identity function: `createChatOptions(opts)` returns `opts`. The value of the helper is in the types. The returned object carries the full type of the adapter and model, so you do not write the generic types of the options yourself.

### What the helper does not do

- **No runtime behavior.** There is no validation, freezing, cloning, or memoization. If you change the returned object, the next call sees the change. Treat the object as read-only.
- **No partial types.** The helper expects the full options shape. To build options step by step, give the partial state your own type (a `Partial<>` of the full options shape). Call the helper only when the shape is complete.
- **No request.** The helper does not call the model. Only the activity function (`chat`, `generateImage`, and the others) sends the request.

### Related pages

- [Per-Model Type Safety](./per-model-type-safety): how the adapter and model choose the type of `modelOptions`.
- [Tree-Shaking](./tree-shaking): why each adapter and helper is a separate export.
- [Extend Adapter](./extend-adapter): add custom models to an adapter, with the same typed options.
