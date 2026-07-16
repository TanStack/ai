---
title: Assistant Scenarios
id: assistant-scenarios
order: 2
description: "Journey-style recipes for chaining assistant capabilities: a sequential pipeline (image → chat → speech) and a one-endpoint content workflow (draft → hero image → audio version). See why an assistant beats wiring separate hooks when steps feed each other."
keywords:
  - tanstack ai
  - assistant
  - useAssistant
  - pipeline
  - content workflow
  - chaining capabilities
  - multimodal
---

**These are point A → point B recipes.** Each one takes a concrete goal and walks the full flow across an assistant's capabilities. The thread running through both: because every capability hangs off the same `assistant` object, the output of one step is right there — typed — for the next step to consume. Wiring the same flow with separate `useChat` / `useGenerateImage` / `useGenerateSpeech` hooks means three connections, three client objects, and manually shuttling values between them.

If you only need one capability, you don't need any of this — reach for the single hook. See [When should you reach for an assistant?](./overview#when-should-you-reach-for-an-assistant) on the overview.

## Recipe 1 — Sequential pipeline

**Goal:** generate an image, have the model write copy *about* that image, then narrate the copy aloud — each step awaiting the last and threading its result forward.

Declare all three capabilities in one assistant on the server:

```ts
// api/assistant.ts
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

export const studioAssistant = defineAssistant({
  chat: (req) =>
    chat({ adapter: openaiText('gpt-5.5'), messages: req.messages }),
  image: (req) => {
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
    })
  },
  speech: (req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.text,
      voice: req.voice,
    }),
})

export const POST = (request: Request) => studioAssistant.handler(request)
```

On the client, the whole pipeline is one function. Each `await` resolves when that step finishes, and its result is on the same `assistant` object for the next step to read:

```tsx
// components/Pipeline.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const studioAssistant = defineAssistant({
  chat: (req) =>
    chat({ adapter: openaiText('gpt-5.5'), messages: req.messages }),
  image: (req) => {
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
    })
  },
  speech: (req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.text,
      voice: req.voice,
    }),
})

function Pipeline() {
  const assistant = useAssistant(studioAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  async function run(subject: string) {
    // 1. Generate an image — the result comes straight back from the await.
    const image = await assistant.image.generate({ prompt: subject })
    const imageUrl = image?.images[0]?.url
    if (!imageUrl) return

    // 2. Hand the image to chat and ask for copy about it.
    //    sendMessage resolves to the messages (no outputSchema here).
    const messages = await assistant.chat.sendMessage({
      content: [
        { type: 'image', source: { type: 'url', value: imageUrl } },
        { type: 'text', content: 'Write a short, punchy caption for this image.' },
      ],
    })

    // 3. Pull the reply text out of the returned messages and narrate it.
    const caption = messages
      .at(-1)
      ?.parts.find((part) => part.type === 'text')?.content
    if (!caption) return

    await assistant.speech.generate({ text: caption })
  }

  return (
    <div>
      <button onClick={() => run('a red fox in a snowy forest')}>
        Run pipeline
      </button>
      {assistant.image.result?.images[0]?.url && (
        <img src={assistant.image.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

**Why an assistant here:** each step's `await` hands back its own result — `const image = await assistant.image.generate(...)`, `const messages = await assistant.chat.sendMessage(...)` — and you thread that returned value straight into the next call. No reactive-state reads between steps: the image URL feeds chat as [multimodal input](../media/image-generation#image-conditioned-generation), and the chat reply (pulled from the returned `messages`) feeds speech — all typed, all on one connection. With three separate hooks you'd hand-carry each value across three independent clients and manage three connections. The reactive `assistant.image.result` / `assistant.chat.messages` are still there for *rendering* (see the JSX below); the pipeline just doesn't need them. See [Text-to-Speech](../media/text-to-speech#playing-audio-in-the-browser) for turning `assistant.speech.result?.audio` into playable audio.

## Recipe 2 — Content workflow (CMS)

**Goal:** a "content" assistant powering a mini CMS. From one prompt it (a) drafts a blog post as a **typed object** (`title` + `body`) via structured-output chat, (b) generates a hero image from the drafted title, and (c) produces an audio version of the body via speech — all behind **one endpoint**.

The server declares the structured-output `chat`, plus `image` and `speech`:

```ts
// api/content.ts
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const BlogPostSchema = z.object({
  title: z.string(),
  body: z.string(),
})

export const contentAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: BlogPostSchema,
      stream: true,
    }),
  image: (req) => {
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
    })
  },
  speech: (req) =>
    generateSpeech({ adapter: openaiSpeech('tts-1'), text: req.text }),
})

export const POST = (request: Request) => contentAssistant.handler(request)
```

The client orchestrates the workflow off the typed `final` object — `assistant.chat.final` is narrowed to `{ title: string; body: string } | null` because the `chat` callback declared `outputSchema`:

```tsx
// components/ContentStudio.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const BlogPostSchema = z.object({
  title: z.string(),
  body: z.string(),
})

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const contentAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: BlogPostSchema,
      stream: true,
    }),
  image: (req) => {
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
    })
  },
  speech: (req) =>
    generateSpeech({ adapter: openaiSpeech('tts-1'), text: req.text }),
})

function ContentStudio() {
  const assistant = useAssistant(contentAssistant, {
    connection: fetchServerSentEvents('/api/content'),
  })

  async function publish(topic: string) {
    // (a) Draft the post as a typed object — sendMessage resolves to the
    //     validated `final` because the chat callback declared outputSchema.
    const draft = await assistant.chat.sendMessage(
      `Write a short blog post about ${topic}.`,
    ) // { title: string; body: string } | null
    if (!draft) return

    // (b) Generate a hero image from the drafted title.
    await assistant.image.generate({ prompt: `Hero image for: ${draft.title}` })

    // (c) Produce an audio version of the body.
    await assistant.speech.generate({ text: draft.body })
  }

  return (
    <div>
      <button onClick={() => publish('urban foxes')}>Draft + illustrate + narrate</button>
      {/* Live progress while the draft streams in */}
      <h2>{assistant.chat.partial.title ?? 'Drafting…'}</h2>
      <p>{assistant.chat.partial.body}</p>
      {assistant.image.result?.images[0]?.url && (
        <img src={assistant.image.result.images[0].url} alt={assistant.chat.final?.title ?? ''} />
      )}
    </div>
  )
}
```

**Why an assistant here:** `sendMessage` resolves to the validated structured `final` — `const draft = await assistant.chat.sendMessage(...)` hands you the typed `{ title, body }` object directly, which you thread into the next calls (`draft.title` becomes the image prompt, `draft.body` becomes the speech text). These are ordinary typed property reads on the awaited return, not values you serialized out of one hook and back into another, and not a reactive-state read after the await. The entire workflow ships as a single endpoint (`/api/content`) with one auth boundary and one connection, which is exactly the shape a content-management feature wants. Because the `chat` callback declares `outputSchema`, you also get `assistant.chat.partial` for a live preview while the draft streams — see [Structured Outputs: Streaming UIs](../structured-outputs/streaming).

## Next

- [Multiple Assistants](./multiple-assistants) — when different pages or features each need their own assistant.
- [Assistant Overview](./overview) — the full capability + typing reference.
- [Client Tools](../tools/client-tools) — run tool implementations in the browser inside `assistant.chat`.
