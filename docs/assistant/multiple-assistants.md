---
title: Multiple Assistants
id: multiple-assistants
order: 3
description: "Give each product surface its own assistant — a support page with chat only, a content studio with chat + image + speech — each with its own route, its own useAssistant, and its own system prompt. Learn when to split into several assistants versus one broad one."
keywords:
  - tanstack ai
  - assistant
  - defineAssistant
  - useAssistant
  - multiple assistants
  - system prompt
  - routes
---

**One `defineAssistant` per product surface.** An assistant bundles a *fixed* set of capabilities behind one endpoint with one system prompt. When different pages or features want different capability sets or different instructions, don't stretch a single assistant to cover them all — define one per surface. Each gets its own route and its own `useAssistant` on its own page.

A typical app ends up with a few:

| Surface | Capabilities | Why its own assistant |
|---|---|---|
| Customer **support** page | `chat` only | Tight, support-flavored system prompt; no image/speech to expose |
| **Content studio** page | `chat` + `image` + `speech` | A creative workflow that chains capabilities |
| Internal **dashboard** | `chat` + `summarize` | Different auth boundary; different instructions |

## Two assistants, two routes

Give each assistant its own module and its own handler. A small helper keeps the shared adapter config — the model choice and any provider options — in one place, so both assistants stay in sync without duplicating it:

```ts
// api/assistants.ts
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

// One place to change the model / provider options for every assistant.
const textModel = () => openaiText('gpt-5.5')

// Support: chat only, with a support-flavored system prompt.
export const supportAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: textModel(),
      messages: req.messages,
      systemPrompts: [
        'You are a customer-support agent for Acme. Be concise and friendly.',
      ],
    }),
})

// Studio: chat + image + speech, for a creative workflow.
export const studioAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: textModel(),
      messages: req.messages,
      systemPrompts: ['You are a creative copywriter.'],
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

// Two routes — one per assistant.
export const supportPOST = (request: Request) => supportAssistant.handler(request)
export const studioPOST = (request: Request) => studioAssistant.handler(request)
```

In a real app these are two route files — `/api/support` and `/api/studio` — each exporting its own `POST`. The `supportPOST` / `studioPOST` names above just let both live in one snippet.

## Two pages, two clients

Each page calls `useAssistant` against *its own* assistant and *its own* connection. The support page only ever sees `assistant.chat`, because that's all `supportAssistant` declared:

```tsx
// pages/SupportPage.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiText } from '@tanstack/ai-openai'

const textModel = () => openaiText('gpt-5.5')

// The same object your /api/support route exports.
const supportAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: textModel(),
      messages: req.messages,
      systemPrompts: [
        'You are a customer-support agent for Acme. Be concise and friendly.',
      ],
    }),
})

function SupportPage() {
  const assistant = useAssistant(supportAssistant, {
    connection: fetchServerSentEvents('/api/support'),
  })

  return (
    <div>
      <button onClick={() => assistant.chat.sendMessage('My order is late.')}>
        Ask support
      </button>
      {assistant.chat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.find((part) => part.type === 'text')?.content}
        </p>
      ))}
    </div>
  )
}
```

The studio page points at `/api/studio` and gets `assistant.chat`, `assistant.image`, and `assistant.speech`:

```tsx
// pages/StudioPage.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

const textModel = () => openaiText('gpt-5.5')

// The same object your /api/studio route exports.
const studioAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: textModel(),
      messages: req.messages,
      systemPrompts: ['You are a creative copywriter.'],
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

function StudioPage() {
  const assistant = useAssistant(studioAssistant, {
    connection: fetchServerSentEvents('/api/studio'),
  })

  return (
    <div>
      <button onClick={() => assistant.chat.sendMessage('Tagline for a fox plushie?')}>
        Write copy
      </button>
      <button
        onClick={() => assistant.image.generate({ prompt: 'a fox plushie' })}
      >
        Generate art
      </button>
      {assistant.image.result?.images[0]?.url && (
        <img src={assistant.image.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

Each page's `assistant` object is typed to exactly its assistant's capabilities — `SupportPage` has no `assistant.image` to misuse, and there's no way to accidentally call the support route with an image request.

## Two assistants on one page

Multiple assistants aren't only for *separate* pages. You can co-locate two **specialized** assistants in the same component — each keeping its own route, connection, auth boundary, and type surface — and compose them in one UI. The glue is the resolved `await` returns: every method hands its result straight back, so one assistant's output flows into the other's input without any reactive-state juggling.

Here a campaign builder pairs a **structured-output copy** assistant (its own `/api/copy` route) with a **media** assistant (its own `/api/media` route):

```tsx
// pages/CampaignBuilder.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const TaglineSchema = z.object({ headline: z.string(), subhead: z.string() })

// Copy: structured-output chat, its own /api/copy route.
const copyAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: TaglineSchema,
      stream: true,
    }),
})

// Media: image + speech, its own /api/media route.
const mediaAssistant = defineAssistant({
  image: (req) => {
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({ adapter: openaiImage('gpt-image-2'), prompt: req.prompt })
  },
  speech: (req) =>
    generateSpeech({ adapter: openaiSpeech('tts-1'), text: req.text }),
})

function CampaignBuilder() {
  const copy = useAssistant(copyAssistant, {
    connection: fetchServerSentEvents('/api/copy'),
  })
  const media = useAssistant(mediaAssistant, {
    connection: fetchServerSentEvents('/api/media'),
  })

  async function build(brief: string) {
    // One assistant drafts the copy...
    const tagline = await copy.chat.sendMessage(`Write a tagline for: ${brief}`)
    if (!tagline) return
    // ...the other turns it into art and audio. Two routes, one workflow.
    await media.image.generate({ prompt: tagline.headline })
    await media.speech.generate({ text: tagline.subhead })
  }

  return (
    <div>
      <button onClick={() => build('a cozy coffee subscription')}>
        Build campaign
      </button>
      <h2>{copy.chat.partial.headline ?? 'Drafting…'}</h2>
      {media.image.result?.images[0]?.url && (
        <img src={media.image.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

Each assistant keeps its own connection, route, auth boundary, and type surface: `copy` has no `.image` and `media` has no `.chat`, so neither can misuse the other's capabilities or route. Yet they compose cleanly in one component, because each method resolves to its result — `copy.chat.sendMessage` hands back the validated `{ headline, subhead }` (its callback declared `outputSchema`), which threads directly into `media.image.generate` and `media.speech.generate`. The reactive fields (`copy.chat.partial`, `media.image.result`) are still there for rendering.

Contrast this with a single broad assistant that declared all three capabilities behind **one** route: that's the right choice when the capabilities truly share a connection and boundary — see [Scenarios](./scenarios) for that one-assistant chaining shape. Reach for two assistants on one page when the capabilities need to appear together but have **different boundaries** — separate routes, auth, or models — that you don't want to collapse into one endpoint.

## Split, or one broad assistant?

Both are valid. Choose by how the capabilities actually relate:

**Split into multiple assistants when:**

- **Different product surfaces.** A support widget and a content studio are different features with different users — separate assistants keep their prompts, capabilities, and routes independent.
- **Different capability sets.** If support never needs image generation, don't expose it there. A narrower assistant is a narrower attack surface and a simpler client type.
- **Different auth or rate-limit boundaries.** Separate routes let you guard `/api/support` and `/api/studio` independently.

**Use one broad assistant when:**

- **The capabilities are always used together** on the same page or in the same workflow — that's exactly the [pipeline / content-workflow](./scenarios) shape, where one capability feeds the next.
- **They share a system prompt and auth boundary.** If splitting would just duplicate the same configuration twice, keep it as one.

**Co-locate multiple assistants on one page when:** the capabilities need to appear together in the same UI but have **different boundaries** — separate routes, auth, or models. This is the middle ground between the two options above: separate assistants (so each keeps its own boundary and type surface), composed in one component via their resolved `await` returns (see [Two assistants on one page](#two-assistants-on-one-page)).

The rule of thumb: **split by surface, not by capability count.** A single page that happens to use three capabilities is one assistant; three pages that each use chat are three assistants. And when one page needs two *different* boundaries side by side, that's two assistants on one page.

## Next

- [Assistant Overview](./overview) — capabilities, typing, and when to reach for an assistant at all.
- [Scenarios](./scenarios) — chaining capabilities within a single assistant.
