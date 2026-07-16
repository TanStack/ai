---
name: ai-core/assistant
description: >
  Multi-capability assistant composition: defineAssistant() registers
  per-capability callbacks (chat/image/audio/speech/video/transcription/
  summarize) on the server behind one handler; useAssistant() consumes all
  declared capabilities from a single client hook with no generics, types
  inferred from the server definition. Each capability entry mirrors the
  matching primitive hook (useChat, useGenerateImage, etc.) exactly.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:packages/ai/src/activities/assistant/index.ts'
  - 'TanStack/ai:packages/ai/src/activities/assistant/types.ts'
  - 'TanStack/ai:packages/ai-client/src/assistant-client.ts'
  - 'TanStack/ai:packages/ai-client/src/assistant-types.ts'
  - 'TanStack/ai:packages/ai-react/src/use-assistant.ts'
---

# Assistant

This skill builds on ai-core, ai-core/chat-experience, and
ai-core/media-generation. Read them first.

`defineAssistant` + `useAssistant` are a **composition layer**, not a new
activity or wire format. They wire together activities you already know
(`chat()`, `generateImage()`, `generateSpeech()`, …) behind one server
endpoint and one client hook. There is no new client state machine: each
declared capability on the client is exactly the same surface as the
matching primitive hook (`useChat`, `useGenerateImage`, `useGenerateAudio`,
`useGenerateSpeech`, `useGenerateVideo`, `useTranscription`, `useSummarize`).

## Setup — Chat + Image Assistant End-to-End

### Server: `defineAssistant` + a single `handler`

Each capability key maps to a callback `(req) => <activity call>`. The
definition is **inert** — `defineAssistant` only stores the callbacks and a
static list of declared capability names. It constructs nothing (no
adapters, no connections) until a request actually reaches `handler`, so
it's safe to import into an isomorphic module shared with the client.

```typescript
// src/lib/assistant.ts — shared/isomorphic module
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import {
  openaiText,
  openaiImage,
  openaiSpeech,
} from '@tanstack/ai-openai/adapters'
import { getWeather } from './tools'

export const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      threadId: req.threadId,
      runId: req.runId,
      tools: [getWeather],
    }),

  image: (req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
      size: req.size,
      numberOfImages: req.numberOfImages,
    }),

  speech: (req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.text,
      voice: req.voice ?? 'alloy',
    }),
})
```

```typescript
// src/routes/api.assistant.ts — server route, single handler
import { createFileRoute } from '@tanstack/react-router'
import { assistant } from '../lib/assistant'

export const Route = createFileRoute('/api/assistant')({
  server: {
    handlers: {
      POST: (request) => blogAssistant.handler(request),
    },
  },
})
```

`handler` is the **only** thing the route needs to call. Internally it
routes by a `capability` discriminator carried on the request body: `'chat'`
dispatches to the AG-UI `RunAgentInput` parsing path (same as a standalone
chat route), and every other declared key is a one-shot generation request
parsed into that capability's input shape. Unknown or undeclared
capabilities get a `400` before any callback runs.

### Client: `useAssistant`

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { assistant } from '../lib/assistant'

function AssistantPanel() {
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  return (
    <div>
      <div>
        {assistant.chat.messages.map((message) => (
          <div key={message.id}>{message.role}</div>
        ))}
      </div>
      <button
        onClick={() => assistant.chat.sendMessage('What can you help with?')}
      >
        Ask
      </button>

      <button
        onClick={() =>
          assistant.image.generate({ prompt: 'a fox in a garden' })
        }
        disabled={assistant.image.isLoading}
      >
        {assistant.image.isLoading ? 'Generating...' : 'Generate image'}
      </button>
      {assistant.image.result?.images.map((img, i) => (
        <img key={i} src={img.url} alt="" />
      ))}
    </div>
  )
}
```

`assistant` is typed from the `assistant` value passed in — **no generics** at
the call site. Only capabilities declared in `defineAssistant` appear on
`assistant`; referencing an undeclared key is a compile error. `assistant.chat`
is the full `useChat` return (`messages`, `sendMessage`, `isLoading`,
`error`, `status`, `stop`, `clear`, `addToolResult`, …); `assistant.image` /
`assistant.audio` / `assistant.speech` / `assistant.video` /
`assistant.transcription` / `assistant.summarize` are each the full
`useGeneration`-style return (`generate`, `result`, `isLoading`, `error`,
`status`, `stop`, `reset`).

Vue/Solid/Svelte have identical patterns with different hook imports
(e.g. `import { useAssistant } from '@tanstack/ai-solid/assistant'`).

## Core Patterns

### 1. Chat tools auto-type from the server callback; `chat: { tools }` is only for client-executed runtime

Tools passed to `chat({ tools: [...] })` inside the server callback
automatically type `assistant.chat.messages`' tool-call/result parts —
narrowed by tool name, input, and output — with **no** client-side
re-declaration needed for typing:

```typescript
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { blogAssistant } from '../lib/assistant' // chat callback passed tools: [getWeather]

const assistant = useAssistant(blogAssistant, {
  connection: fetchServerSentEvents('/api/assistant'),
})

// assistant.chat.messages parts are already narrowed by tool name — inferred
// from the server callback's `tools: [getWeather]`, not from anything passed
// here.
```

`chat: { tools }` on `useAssistant` still exists, but only for one reason:
a client-**executed** tool's `.client()` implementation runs in the browser,
so its code can't cross the wire — the server callback only ever sees the
tool's _definition_ (for the model and for typing). Pass the client
implementation there to register its runtime:

```typescript
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { blogAssistant } from '../lib/assistant' // chat callback passed tools: [showToastDef]
import { showToast } from '../lib/tools' // showToastDef.client((input) => ...)

const assistant = useAssistant(blogAssistant, {
  connection: fetchServerSentEvents('/api/assistant'),
  chat: { tools: [showToast] }, // runtime only — types already came from the callback
})
```

`chat.forwardedProps` is also available on the same option, merged into
every chat request alongside the reserved `capability` field.

Each **one-shot** capability accepts an optional transform too, keyed by the
capability name (`image`, `speech`, `audio`, `video`, `transcription`,
`summarize`): `image: { onResult, forwardedProps }`. `onResult` runs on the
raw backend result and its return type becomes `assistant.<capability>.result`
— mirroring the standalone generation hooks. Return nothing to keep the raw
result.

```typescript
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { blogAssistant } from '../lib/assistant'

const assistant = useAssistant(blogAssistant, {
  connection: fetchServerSentEvents('/api/assistant'),
  image: { onResult: (result) => result.images[0]?.url ?? null },
})

assistant.image.result // string | null — the transform's return type
```

### 2. Structured output via `outputSchema` in the chat callback

If the `chat` callback passes `outputSchema` to `chat()`, `assistant.chat`
picks up typed `partial` (progressive `DeepPartial`) and `final` (validated
terminal object) fields — the same conditional shape `useChat({
outputSchema })` returns. Omit `outputSchema` and neither field is present on
the type.

```typescript
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { blogAssistant } from '../lib/assistant' // chat callback passed outputSchema: BlogOutlineSchema

const assistant = useAssistant(blogAssistant, {
  connection: fetchServerSentEvents('/api/assistant'),
})

assistant.chat.partial.title // string | undefined — fills in as JSON streams
assistant.chat.final // full schema type | null — set once the run completes
```

### 3. Manual chaining across capabilities

There is no auto-chaining or shared "artifact workspace" — `useAssistant`
is a pure composition layer. To use one capability's result as input to
another, read the result value and pass it explicitly:

```typescript
await assistant.image.generate({ prompt: 'a lighthouse at dusk' })

// after assistant.image.result is populated:
if (assistant.image.result) {
  assistant.chat.sendMessage({
    content: [
      {
        type: 'image',
        source: { type: 'url', value: assistant.image.result.images[0].url },
      },
      { type: 'text', content: 'Write a short caption for this image.' },
    ],
  })
}
```

### 4. Only declared capabilities are constructed

`defineAssistant({ chat, image })` produces a client `assistant` with exactly
`assistant.chat` and `assistant.image` — no `assistant.audio`, `assistant.video`, etc.
Add or remove capability keys on the server definition to change what the
client can call; there's nothing else to keep in sync.

### 5. Sharing one connection across capabilities

All capabilities declared in one `defineAssistant` call share a single
`connection` passed to `useAssistant` — one endpoint, one adapter. Each
underlying sub-client (a `ChatClient` for `chat`, a `GenerationClient` per
one-shot capability) tags its own requests with the capability name, so the
single `handler` on the server can route correctly. This mirrors the shared
`connection` pattern already used by `useChat` / `useGenerateImage`
individually — see ai-core/chat-experience and ai-core/media-generation.

## Common Mistakes

### a. HIGH: Constructing adapters outside the capability callback

```typescript
// WRONG — adapter constructed eagerly at module load, defeats "inert" guarantee
const textAdapter = openaiText('gpt-5.5')
const blogAssistant = defineAssistant({
  chat: (req) => chat({ adapter: textAdapter, messages: req.messages }),
})

// CORRECT — construct inside the callback, per request
const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({ adapter: openaiText('gpt-5.5'), messages: req.messages }),
})
```

Adapter construction is cheap (it wraps config; the provider HTTP client is
created lazily), but constructing outside the callback breaks the
"`defineAssistant` is inert, safe to import into the client bundle"
guarantee — it now runs provider setup at import time.

### b. HIGH: Writing a custom handler that branches on capability manually

```typescript
// WRONG — reimplementing what `handler` already does
export const POST = async (request: Request) => {
  const body = await request.json()
  if (body.capability === 'chat') {
    return toServerSentEventsResponse(
      chat({ adapter, messages: body.messages }),
    )
  }
  // ...manual branching for every capability
}

// CORRECT — defineAssistant's handler already parses, routes, and serializes
export const POST = (request: Request) => blogAssistant.handler(request)
```

### c. HIGH: Passing `model` or top-level generation options to `useAssistant`

There is no `model`/`prompt` option on `useAssistant` itself. Model choice and
generation parameters belong inside the server callback
(`openaiImage('gpt-image-2')`, `openaiSpeech('tts-1')`, …). The client-side
options `useAssistant` accepts besides `connection` are `threadId`/`id`,
`chat: { tools, forwardedProps }` (`tools` here registers **client-executed**
tools' runtime implementations only — typing already comes from the server
callback), and a per-one-shot-capability `{ onResult, forwardedProps }` (a
result transform + extra request-body fields — not model/prompt).

```typescript
// WRONG — no model/prompt options on useAssistant
useAssistant(blogAssistant, { connection, model: 'gpt-5.5', prompt: '...' })

// CORRECT — model/prompt live in the server callback; useAssistant takes
// connection, threadId/id, chat.{tools,forwardedProps}, and per-capability
// { onResult, forwardedProps }
useAssistant(blogAssistant, {
  connection: fetchServerSentEvents('/api/assistant'),
})
```

### d. MEDIUM: Expecting `defineAssistant` to auto-chain results

```typescript
// WRONG — assuming the assistant remembers assistant.image.result automatically
assistant.chat.sendMessage('use the image I just generated')

// CORRECT — thread the result value through explicitly (see Core Pattern 2)
assistant.chat.sendMessage({
  content: [
    {
      type: 'image',
      source: { type: 'url', value: assistant.image.result.images[0].url },
    },
    { type: 'text', content: 'Use this image.' },
  ],
})
```

Chaining is manual by design (v1 non-goal: no shared artifact workspace or
auto-resolution of prior outputs).

### e. MEDIUM: Declaring a capability on the server but never checking it client-side

Every capability declared in `defineAssistant` is unconditionally present on
`assistant` — there's no need to guard with `assistant.image?.generate`. If a
capability is optional per-deployment, omit the key from the
`defineAssistant` config entirely rather than declaring it and ignoring it
on the client.

## Cross-References

- See also: **ai-core/chat-experience/SKILL.md** -- `assistant.chat` is the
  same `useChat` surface; streaming, tool rendering, and multimodal
  messages all apply unchanged.
- See also: **ai-core/media-generation/SKILL.md** -- `assistant.image` /
  `assistant.audio` / `assistant.speech` / `assistant.video` /
  `assistant.transcription` / `assistant.summarize` are each the same
  `useGeneration`-style surface documented there.
- See also: **ai-core/tool-calling/SKILL.md** -- Tools passed to the `chat`
  capability callback follow the same server/client tool patterns as a
  standalone `chat()` route.
- See also: **ai-core/custom-backend-integration/SKILL.md** -- The shared
  `connection` passed to `useAssistant` is the same `ConnectConnectionAdapter`
  used by `useChat` / `useGenerate*`.
