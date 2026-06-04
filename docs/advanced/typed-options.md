---
title: Typed Pre-Configured Options
id: typed-options
order: 11
description: "Define typed, reusable option objects for chat, summarize, image, video, audio, speech, and transcription with createChatOptions and friends — share configuration across routes without losing per-model type safety."
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

You have a `chat()` (or `generateImage()`, `generateSpeech()`, …) configuration you want to reuse — across multiple routes, between a server function and its caller, or simply factored out of a handler for clarity. By the end of this guide, you'll have a single typed options object that infers the adapter's model, modalities, and provider options, and that you can spread into any call site without losing type safety.

## The pattern

Every activity in `@tanstack/ai` ships a paired `createXxxOptions` helper that takes the exact same options object as the activity itself and returns it unchanged — at runtime it's the identity function. The point is **type inference**: the returned object carries the adapter's full type, so when you spread it into the activity, TypeScript still narrows `modelOptions`, content modalities, and `outputSchema` to the adapter you chose.

```typescript
import { chat, createChatOptions } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const chatOptions = createChatOptions({
  adapter: openaiText('gpt-5.5'),
  // modelOptions, systemPrompts, tools — all type-checked against the
  // adapter+model pair above. Sampling params (temperature, top_p,
  // max_output_tokens, …) live inside modelOptions, under each provider's
  // native key.
  modelOptions: {
    temperature: 0.3,
    reasoning: { effort: 'medium' },
  },
})

// Later, anywhere in your codebase:
const stream = chat({ ...chatOptions, messages })
```

Without the helper you'd have to either inline the configuration at every call site, or hand-write the full chat options type with its adapter/model generics resolved manually — `createChatOptions` does that for you.

## When to reach for it

- **Sharing a configuration across multiple routes** — define once, spread into each handler.
- **Passing options through a layer** (a server function, a wrapper, a test fixture) without erasing the adapter's model-specific types.
- **Branching on a runtime value while keeping types intact** — build different options objects and choose between them, instead of weaving conditionals into a single `chat({...})` call.
- **Co-locating tools, system prompts, and middleware** with the adapter they target.

If you only call an activity once at one site, you don't need this helper. Inline the options.

## Available helpers

Each helper mirrors the activity it pairs with. Same options, same return type.

| Helper | Activity | Adapter |
|---|---|---|
| `createChatOptions` | `chat()` | text adapter (e.g. `openaiText`, `anthropicText`) |
| `createSummarizeOptions` | `summarize()` | summarize adapter (e.g. `openaiSummarize`) |
| `createImageOptions` | `generateImage()` | image adapter (e.g. `openaiImage`, `falImage`) |
| `createAudioOptions` | `generateAudio()` | audio adapter (e.g. `falAudio`, `geminiAudio`) |
| `createVideoOptions` | `generateVideo()` / `getVideoJobStatus()` | video adapter (e.g. `falVideo`, `openaiVideo`) |
| `createSpeechOptions` | `generateSpeech()` | speech adapter (e.g. `openaiSpeech`, `elevenlabsSpeech`) |
| `createTranscriptionOptions` | `generateTranscription()` | transcription adapter (e.g. `openaiTranscription`, `falTranscription`) |

All helpers are exported from `@tanstack/ai`.

## Example: shared chat configuration across routes

Suppose you have several routes that all hit the same model with the same provider options and tool set. Factor the configuration out once:

```typescript
// lib/ai/chat-options.ts
import { createChatOptions, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const lookupOrderDef = toolDefinition({
  name: 'lookupOrder',
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

```typescript
// routes/api/support/chat.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { supportChatOptions } from '@/lib/ai/chat-options'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({ ...supportChatOptions, messages })
  return toServerSentEventsResponse(stream)
}
```

```typescript
// routes/api/support/draft-reply.ts — same adapter+tools, different schema
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

Both routes share the adapter, system prompt, tools, and reasoning settings; each adds what it needs. Override or omit any field at the call site — the spread wins on the right.

## Example: typed pre-configured image generation

```typescript
import { createImageOptions, generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const heroImageOptions = createImageOptions({
  adapter: openaiImage('gpt-image-1'),
  size: '1536x1024',
  numberOfImages: 1,
})

const result = await generateImage({
  ...heroImageOptions,
  prompt: 'A glass sphere refracting a sunset over a calm sea',
})
```

The same pattern works for `createVideoOptions`, `createSpeechOptions`, `createTranscriptionOptions`, `createAudioOptions`, and `createSummarizeOptions` — the adapter is captured in the typed options object and every downstream call is narrowed to it.

## What the helper does NOT do

- **No runtime behavior.** `createChatOptions(opts)` is `opts`. There is no validation, freezing, cloning, or memoization. If you mutate the returned object after creation, the next call sees the mutation. Treat the result as immutable by convention.
- **No partial typing.** The helper expects the full options shape it'll be spread into. If you need to build options up incrementally, type the intermediate state yourself (a `Partial<>` of the full chat options shape) and only call the helper at the boundary where the shape is complete.
- **No request execution.** The helper does not call the model. Only the activity function (`chat`, `generateImage`, …) makes the request.

## Related

- [Per-Model Type Safety](./per-model-type-safety) — how the adapter+model pair drives `modelOptions` inference.
- [Tree-Shaking](./tree-shaking) — why each adapter is exported separately, and how the typed-options pattern keeps your bundle small.
- [Extend Adapter](./extend-adapter) — when you need to add custom models to an adapter without losing the same typed-options ergonomics.
