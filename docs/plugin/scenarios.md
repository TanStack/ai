---
title: Scenarios
id: plugin-scenarios
order: 3
description: "One plugin definition per product surface — a support page with a single chat plugin, a content studio with drafting + image + narration — each with its own route, its own usePlugin, and its own system prompts. Plus the decision guide: a single hook, a plugin endpoint, or client-orchestrated pipeline?"
keywords:
  - tanstack ai
  - plugin
  - definePlugin
  - usePlugin
  - multiple endpoints
  - system prompt
  - routes
---

**One `definePlugin` per product surface.** A plugin definition bundles a set of plugins behind one endpoint. When different pages or features want different plugin sets, different instructions, or different auth, don't stretch a single definition to cover them all — define one per surface. Each gets its own route and its own `usePlugin` on its own page.

A typical app ends up with a few:

| Surface | Plugins | Why its own definition |
|---|---|---|
| Customer **support** page | `supportChat` | Tight, support-flavored system prompt; nothing else to expose |
| **Content studio** page | `drafting` + `heroImage` + `narration` | A creative workflow, orchestrated on the client |
| Internal **dashboard** | `analystChat` + `weeklyDigest` | Different auth boundary; different instructions |

## Two definitions, two routes

Give each definition its own module and its own handler. A small helper keeps the shared adapter config — the model choice and any provider options — in one place, so the surfaces stay in sync without duplicating it:

```ts
// api/plugins.ts
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import {
  chatPlugin,
  definePlugin,
  imagePlugin,
  speechPlugin,
} from '@tanstack/ai-plugin-toolkit'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

// One place to change the model / provider options for every surface.
const textModel = () => openaiText('gpt-5.5')

// Support: a single chat plugin, with a support-flavored system prompt.
export const supportPlugin = definePlugin({
  supportChat: chatPlugin((req) =>
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
export const studioPlugin = definePlugin({
  drafting: chatPlugin((req) =>
    chat({
      adapter: textModel(),
      messages: req.messages,
      systemPrompts: ['You are a creative copywriter.'],
    }),
  ),
  heroImage: imagePlugin((req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.input.prompt,
    }),
  ),
  narration: speechPlugin((req) =>
    generateSpeech({ adapter: openaiSpeech('tts-1'), text: req.input.text }),
  ),
})

// Two routes — one per definition.
export const supportPOST = (request: Request) => supportPlugin.handler(request)
export const studioPOST = (request: Request) => studioPlugin.handler(request)
```

In a real app these are two route files — `/api/support` and `/api/studio` — each exporting its own `POST`. The `supportPOST` / `studioPOST` names above just let both live in one snippet.

## Two pages, two clients

Each page calls `usePlugin` against *its own* definition value and *its own* connection. The support page only ever sees `plugin.supportChat`, because that's all `supportPlugin` declared:

```tsx
// pages/SupportPage.tsx
import { chat } from '@tanstack/ai'
import { chatPlugin, definePlugin } from '@tanstack/ai-plugin-toolkit'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { openaiText } from '@tanstack/ai-openai'

// The same definition your server route exports — share it from one module
// in a real app; repeated here so this snippet type-checks on its own.
const supportPlugin = definePlugin({
  supportChat: chatPlugin((req) =>
    chat({ adapter: openaiText('gpt-5.5'), messages: req.messages }),
  ),
})

function SupportPage() {
  const plugin = usePlugin(supportPlugin, {
    connection: fetchServerSentEvents('/api/support'),
  })

  return (
    <div>
      <button
        onClick={() => plugin.supportChat.sendMessage('My order is late.')}
      >
        Ask support
      </button>
      {plugin.supportChat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.find((part) => part.type === 'text')?.content}
        </p>
      ))}
    </div>
  )
}
```

The studio page points at `/api/studio` and gets `plugin.drafting`, `plugin.heroImage`, and `plugin.narration`:

```tsx
// pages/StudioPage.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { studioPlugin } from '../api/plugins'

function StudioPage() {
  const plugin = usePlugin(studioPlugin, {
    connection: fetchServerSentEvents('/api/studio'),
  })

  return (
    <div>
      <button
        onClick={() => plugin.drafting.sendMessage('Tagline for a fox plushie?')}
      >
        Write copy
      </button>
      <button onClick={() => plugin.heroImage.run({ prompt: 'a fox plushie' })}>
        Generate art
      </button>
      {plugin.heroImage.result?.images[0]?.url && (
        <img src={plugin.heroImage.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

Each page's `plugin` object is typed to exactly its definition's plugins — `SupportPage` has no `plugin.heroImage` to misuse, and there's no way to accidentally call the support route with an image request. Because `usePlugin` takes the `definePlugin` value directly, there is no separate client stub to keep in sync (see [Sharing the definition with the client](./overview#sharing-the-definition-with-the-client)).

## Split, or one broad definition?

Both are valid. Choose by how the plugins actually relate:

**Split into multiple definitions when:**

- **Different product surfaces.** A support widget and a content studio are different features with different users — separate definitions keep their prompts, plugins, and routes independent.
- **Different plugin sets.** If support never needs image generation, don't expose it there. A narrower definition is a narrower attack surface and a simpler client type.
- **Different auth or rate-limit boundaries.** Separate routes let you guard `/api/support` and `/api/studio` independently.

**Use one broad definition when:**

- **The plugins are always used together** on the same page or in the same workflow — especially when one plugin's output feeds the next. Siblings must live in the same definition to share one endpoint and one typed client.
- **They share a system prompt and auth boundary.** If splitting would just duplicate the same configuration twice, keep it as one.

The rule of thumb: **split by surface, not by plugin count.** A single page that happens to use four plugins is one definition; three pages that each use chat are three definitions.

## A single hook, a plugin endpoint, or a client-orchestrated pipeline?

The same feature can be built three ways. Pick by *how many kinds of AI work the surface has* and *who sequences them*:

**Just `useChat` (or a single generation hook)** when there's exactly one kind of AI work on the page. A chat box is a chat box — the plugin layer adds a definition and a routing discriminator and nothing else. Reach for `definePlugin` only once a second plugin shows up.

**A plugin endpoint, driven step by step** when the *user* orchestrates: each step is its own gesture — draft in the chat, then click "illustrate", then click "narrate", regenerate any step at will. Each step is its own request and can be retried independently. This is the loosest coupling: steps can be abandoned halfway, reordered, or repeated.

**A plugin endpoint with a client-orchestrated pipeline** when the steps form a sequence but you kick it off with one action: the client `await`s `drafting.sendMessage(...)`, then fires `heroImage.run(...)` and `narration.run(...)` in `Promise.all`, deriving each input from the finished draft. One endpoint, one typed client, orchestrated in the browser — each step still independently retryable. See [Orchestration](./plugins).

| | `useChat` / single hook | Plugin endpoint, user-driven | Plugin endpoint, client-orchestrated |
|---|---|---|---|
| Orchestrated by | — (single step) | The user, click by click | The client, in one handler |
| Requests | One per interaction | One per step | One per step (sequenced in code) |
| Cancel | Per request | Per step | Per step; or `stop()` each surface |
| Failure | Per request | Per step; earlier steps keep their results | Per step; you compose fail-fast vs. best-effort |
| Best for | A page with one AI feature | Exploratory, editable workflows | One-action pipelines with a definite finished artifact |

> A future `workflowPlugin` will add a fourth option — running the whole pipeline as a *single* server request (one abort scope, intermediate values that stay on the server, live sub-run progress). Until it lands, orchestrate on the client.

These compose: a blog studio declares `drafting`, `heroImage`, and `narration` in one definition — the client runs them as a pipeline for the first pass *and* lets the user drive the same plugins directly for "regenerate" touch-ups. One definition and one endpoint for both.

## Next

- [Plugin Overview](./overview) — the plugin kinds, client typing, and when to reach for a plugin endpoint at all.
- [Orchestration](./plugins) — sequencing plugins into a pipeline from the client.
- [Client Tools](../tools/client-tools) — run tool implementations in the browser inside a chat plugin.
