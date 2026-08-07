---
title: Typed Pre-Configured Options
id: typed-options
order: 11
description: "Reuse typed activity options with createChatOptions and siblings without losing per-model inference."
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

If you reuse the same activity config across routes or layers → wrap it with `createXxxOptions`, then spread at the call site.

## Pattern

Helpers are the identity function at runtime. Point is **type inference**: returned object keeps adapter/model generics so `modelOptions`, modalities, and schemas stay narrowed.

```typescript
import { chat, createChatOptions } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const chatOptions = createChatOptions({
  adapter: openaiText('gpt-5.5'),
  modelOptions: {
    temperature: 0.3,
    reasoning: { effort: 'medium' },
  },
})

const stream = chat({
  ...chatOptions,
  messages: [{ role: 'user', content: 'Hello' }],
})
```

Skip the helper if you only call the activity once inline.

## When to use

1. Share config across routes
2. Pass options through a layer without erasing adapter types
3. Branch on runtime value with separate options objects
4. Co-locate tools, system prompts, middleware with the adapter

## Helpers

| Helper | Activity | Adapter example |
|---|---|---|
| `createChatOptions` | `chat()` | `openaiText`, `anthropicText` |
| `createSummarizeOptions` | `summarize()` | `openaiSummarize` |
| `createImageOptions` | `generateImage()` | `openaiImage`, `falImage` |
| `createAudioOptions` | `generateAudio()` | `falAudio`, `geminiAudio` |
| `createVideoOptions` | `generateVideo()` / `getVideoJobStatus()` | `falVideo`, `openaiVideo` |
| `createSpeechOptions` | `generateSpeech()` | `openaiSpeech`, `elevenlabsSpeech` |
| `createTranscriptionOptions` | `generateTranscription()` | `openaiTranscription`, `falTranscription` |

All from `@tanstack/ai`.

## Shared chat config across routes

```typescript
// lib/ai/chat-options.ts
import { createChatOptions, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { db } from './db'

const lookupOrderDef = toolDefinition({
  name: 'lookupOrder',
  description: 'Look up a customer order by ID',
  inputSchema: z.object({ orderId: z.string() }),
})

const lookupOrder = lookupOrderDef.server(async ({ orderId }) => {
  return db.orders.findUnique({ where: { id: orderId } })
})

export const supportChatOptions = createChatOptions({
  adapter: openaiText('gpt-5.5'),
  systemPrompts: ['You are a customer-support assistant for Acme Corp.'],
  tools: [lookupOrder],
  modelOptions: {
    reasoning: { effort: 'medium' },
  },
})
```

```typescript ignore
// routes/api/support/chat.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { supportChatOptions } from '@/lib/ai/chat-options'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({ ...supportChatOptions, messages })
  return toServerSentEventsResponse(stream)
}
```

```typescript ignore
// routes/api/support/draft-reply.ts
import { chat } from '@tanstack/ai'
import { supportChatOptions } from '@/lib/ai/chat-options'
import { z } from 'zod'

export async function POST(request: Request) {
  const { ticket } = await request.json()
  const draft = await chat({
    ...supportChatOptions,
    messages: [{ role: 'user', content: `Draft a reply to: ${ticket}` }],
    outputSchema: z.object({ subject: z.string(), body: z.string() }),
    stream: false,
  })
  return Response.json(draft)
}
```

Right-hand spread overrides shared fields.

## Image options

```typescript
import { createImageOptions, generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const heroImageOptions = createImageOptions({
  adapter: openaiImage('gpt-image-2'),
  prompt: 'A glass sphere refracting a sunset over a calm sea',
  size: '1536x1024',
  numberOfImages: 1,
})

const result = await generateImage(heroImageOptions)
```

Same pattern for video, speech, transcription, audio, summarize.

## What helpers do not do

1. **No runtime behavior** — no validate/freeze/clone. Treat as immutable by convention.
2. **No partial typing** — pass a complete options shape; build partials yourself until the boundary.
3. **No request** — only the activity function (`chat`, `generateImage`, …) calls the model.

## Related

- [Per-Model Type Safety](./per-model-type-safety) — adapter+model drives `modelOptions`
- [Tree-Shaking](./tree-shaking) — separate adapter imports
- [Extend Adapter](./extend-adapter) — custom models with the same options ergonomics
