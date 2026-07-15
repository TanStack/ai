---
title: Scenarios
id: transaction-scenarios
order: 3
description: "One transaction definition per product surface — a support page with a single chat verb, a content studio with drafting + image + narration — each with its own route, its own useTransaction, and its own system prompts. Plus the decision guide: user-driven verbs, server-composed transactions, or plain useChat?"
keywords:
  - tanstack ai
  - transaction
  - defineTransaction
  - useTransaction
  - multiple endpoints
  - system prompt
  - routes
---

**One `defineTransaction` per product surface.** A transaction definition bundles a set of verbs behind one endpoint. When different pages or features want different verb sets, different instructions, or different auth, don't stretch a single definition to cover them all — define one per surface. Each gets its own route and its own `useTransaction` on its own page.

A typical app ends up with a few:

| Surface | Verbs | Why its own definition |
|---|---|---|
| Customer **support** page | `supportChat` | Tight, support-flavored system prompt; nothing else to expose |
| **Content studio** page | `drafting` + `heroImage` + `narration` + `blogPost` | A creative workflow, including a server-composed [transaction](./transactions) |
| Internal **dashboard** | `analystChat` + `weeklyDigest` | Different auth boundary; different instructions |

## Two definitions, two routes

Give each definition its own module and its own handler. A small helper keeps the shared adapter config — the model choice and any provider options — in one place, so the surfaces stay in sync without duplicating it:

```ts
// api/transactions.ts
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

// One place to change the model / provider options for every surface.
const textModel = () => openaiText('gpt-5.5')

// Support: a single chat verb, with a support-flavored system prompt.
export const supportTransaction = defineTransaction({
  supportChat: chatVerb((req) =>
    chat({
      adapter: textModel(),
      messages: req.messages,
      systemPrompts: [
        'You are a customer-support agent for Acme. Be concise and friendly.',
      ],
    }),
  ),
})

// Studio: drafting + image + narration, for a creative workflow.
export const studioTransaction = defineTransaction({
  drafting: chatVerb((req) =>
    chat({
      adapter: textModel(),
      messages: req.messages,
      systemPrompts: ['You are a creative copywriter.'],
    }),
  ),
  heroImage: verb({
    input: z.object({ prompt: z.string() }),
    execute: ({ input }) =>
      generateImage({
        adapter: openaiImage('gpt-image-2'),
        prompt: input.prompt,
      }),
  }),
  narration: verb({
    input: z.object({ text: z.string() }),
    execute: ({ input }) =>
      generateSpeech({ adapter: openaiSpeech('tts-1'), text: input.text }),
  }),
})

// Two routes — one per definition.
export const supportPOST = (request: Request) =>
  supportTransaction.handler(request)
export const studioPOST = (request: Request) =>
  studioTransaction.handler(request)
```

In a real app these are two route files — `/api/support` and `/api/studio` — each exporting its own `POST`. The `supportPOST` / `studioPOST` names above just let both live in one snippet.

## Two pages, two clients

Each page calls `useTransaction` against *its own* definition and *its own* connection. The support page only ever sees `txn.supportChat`, because that's all `supportTransaction` declared:

```tsx
// pages/SupportPage.tsx
import { chat } from '@tanstack/ai'
import { chatVerb, defineTransaction } from '@tanstack/ai/transaction'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { openaiText } from '@tanstack/ai-openai'

// The same definition your server route exports — share it from one module
// in a real app; repeated here so this snippet type-checks on its own.
const supportTransaction = defineTransaction({
  supportChat: chatVerb((req) =>
    chat({ adapter: openaiText('gpt-5.5'), messages: req.messages }),
  ),
})

function SupportPage() {
  const txn = useTransaction(supportTransaction, {
    connection: fetchServerSentEvents('/api/support'),
  })

  return (
    <div>
      <button onClick={() => txn.supportChat.sendMessage('My order is late.')}>
        Ask support
      </button>
      {txn.supportChat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.find((part) => part.type === 'text')?.content}
        </p>
      ))}
    </div>
  )
}
```

The studio page points at `/api/studio` and gets `txn.drafting`, `txn.heroImage`, and `txn.narration`:

```tsx
// pages/StudioPage.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { studioTransaction } from '../api/transactions'

function StudioPage() {
  const txn = useTransaction(studioTransaction, {
    connection: fetchServerSentEvents('/api/studio'),
  })

  return (
    <div>
      <button
        onClick={() => txn.drafting.sendMessage('Tagline for a fox plushie?')}
      >
        Write copy
      </button>
      <button
        onClick={() => txn.heroImage.run({ prompt: 'a fox plushie' })}
      >
        Generate art
      </button>
      {txn.heroImage.result?.images[0]?.url && (
        <img src={txn.heroImage.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

Each page's `txn` object is typed to exactly its definition's verbs — `SupportPage` has no `txn.heroImage` to misuse, and there's no way to accidentally call the support route with an image request. (When a route builds its definition inside the handler, bind the client with `clientTransaction` as described in [Sharing the definition with the client](./overview#sharing-the-definition-with-the-client).)

## Split, or one broad definition?

Both are valid. Choose by how the verbs actually relate:

**Split into multiple definitions when:**

- **Different product surfaces.** A support widget and a content studio are different features with different users — separate definitions keep their prompts, verbs, and routes independent.
- **Different verb sets.** If support never needs image generation, don't expose it there. A narrower definition is a narrower attack surface and a simpler client type.
- **Different auth or rate-limit boundaries.** Separate routes let you guard `/api/support` and `/api/studio` independently.

**Use one broad definition when:**

- **The verbs are always used together** on the same page or in the same workflow — especially when a composing verb needs to `ctx.call` them: siblings must live in the same definition to be composed into a [transaction](./transactions).
- **They share a system prompt and auth boundary.** If splitting would just duplicate the same configuration twice, keep it as one.

The rule of thumb: **split by surface, not by verb count.** A single page that happens to use four verbs is one definition; three pages that each use chat are three definitions.

## User-driven verbs, server-composed transactions, or just `useChat`?

The same pipeline can be built three ways. Pick by *who orchestrates* and *what the unit of work is*:

**Just `useChat` (or a single generation hook)** when there's exactly one kind of AI work on the page. A chat box is a chat box — the transaction layer adds a definition, a routing discriminator, and nothing else. Reach for `defineTransaction` only once a second verb shows up.

**User-driven verbs** when the *user* orchestrates: each step is its own gesture — draft in the chat, then click "illustrate", then click "narrate", regenerate any step at will. The client chains awaited returns (`const messages = await txn.drafting.sendMessage(...)`, then `await txn.heroImage.run(...)`), each step is its own request, and each can be retried independently. This is the loosest coupling: steps can be abandoned halfway, reordered, or repeated.

**A server-composed transaction** when the pipeline is *one unit of work* from the user's point of view: one click should produce the finished artifact or fail as a whole. Declare a composing verb and let `ctx.call` run the steps server-side — one request, live sub-run progress, one abort scope, intermediate values that never round-trip through the browser, and a single typed result. See [Transactions](./transactions).

| | `useChat` / single hook | User-driven verbs | Server-composed transaction |
|---|---|---|---|
| Orchestrated by | — (single step) | The client, step by step | The server, inside `execute` |
| Requests | One per interaction | One per step | **One for the whole pipeline** |
| Cancel | Per request | Per step | One `stop()` aborts everything |
| Intermediate values | — | Round-trip through the browser | Stay on the server (streamed live as sub-runs) |
| Failure | Per request | Per step; earlier steps keep their results | The run fails as a unit (unless `execute` catches) |
| Best for | A page with one AI feature | Exploratory, editable workflows | One-click pipelines with a definite finished artifact |

These compose: the blog studio in [Transactions](./transactions) declares `blogPost` (the one-click transaction) *alongside* `heroImage` and `narration` — the same one-shot verbs the transaction composes are also driven directly by the user for "regenerate" buttons. Server-composed for the first pass, user-driven for the touch-ups, one definition and one endpoint for both.

## Next

- [Transaction Overview](./overview) — the two verb kinds, client typing, and when to reach for a transaction endpoint at all.
- [Transactions](./transactions) — composing verbs with `ctx.call`: sub-runs, abort semantics, and error behavior.
- [Client Tools](../tools/client-tools) — run tool implementations in the browser inside a chat verb.
