---
name: ai-core/plugin
description: >
  App-defined plugin registry: definePlugin() registers app-named plugins —
  chatPlugin(callback) for conversational surfaces, generationPlugin({ input,
  execute }) for one-shot schema-validated work, plus ready-made media
  factories (imagePlugin, videoPlugin, audioPlugin, speechPlugin,
  transcriptionPlugin, summarizePlugin) — behind one handler; usePlugin()
  consumes all declared plugins from a single client hook with flat options
  and no generics, types inferred from the server definition.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:packages/ai-plugin-toolkit/src/index.ts'
  - 'TanStack/ai:packages/ai-plugin-toolkit/src/types.ts'
  - 'TanStack/ai:packages/ai-plugin-toolkit/src/media.ts'
  - 'TanStack/ai:packages/ai-client/src/plugin-client.ts'
  - 'TanStack/ai:packages/ai-client/src/plugin-types.ts'
  - 'TanStack/ai:packages/ai-react/src/use-plugin.ts'
---

# Plugin

This skill builds on ai-core, ai-core/chat-experience, and
ai-core/media-generation. Read them first.

`definePlugin` + `usePlugin` are a **registry layer**, not a new activity or
wire format. They wire together activities you already know (`chat()`,
`generateImage()`, `generateSpeech()`, …) behind one server endpoint and one
client hook, keyed by **app-named plugins** — `drafting`, `heroImage`,
`narration` — not a fixed set of library nouns. There are two plugin kinds:

- `chatPlugin(callback)` — conversational: message history in, streamed chat
  out. Client surface = the full `useChat` return. A definition may declare
  several chat plugins (e.g. `primaryChat` + `summaryChat`).
- `generationPlugin({ input, execute })` — one-shot: Standard-Schema-validated
  input in, typed result out. Client surface = `run(input)` / `result` /
  `isLoading` / `error` / `status` / `stop` / `reset`.

For common media activities, six factory functions wrap `generationPlugin`
with the input/result contract pre-bound so you don't hand-roll a schema:
`imagePlugin`, `videoPlugin`, `audioPlugin`, `speechPlugin`,
`transcriptionPlugin`, `summarizePlugin`.

A `generationPlugin`'s `execute` receives a single `req` argument (parsed
input + the raw `Request`) — there is **no** second `ctx` argument, and a
plugin cannot invoke a sibling plugin server-side. Each plugin runs its own
request, independently. Orchestrating multiple plugins into one pipeline
(e.g. "draft, then illustrate, then narrate") is the client's job — see
Pattern 1. **Server-side composition is coming via a future `workflowPlugin`.**

## Setup — Chat + Media Plugins End-to-End

### Server: `definePlugin` + a single `handler`

The definition is **inert** — `definePlugin` only stores the plugins and
their names/kinds. It constructs nothing (no adapters, no connections) until
a request actually reaches `handler`, so it's safe to import into an
isomorphic module shared with the client — the client binds directly off the
same value (see Client binding, below); there is no separate client stub.

```typescript
// src/lib/blog-studio.ts — shared module: server definition
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import {
  chatPlugin,
  definePlugin,
  imagePlugin,
  speechPlugin,
} from '@tanstack/ai-plugin-toolkit'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

export const BlogPostSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  body: z.string(),
})

export const blogPlugin = definePlugin({
  // Conversational plugin: writes the post as a typed object
  // (structured output + streaming).
  drafting: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: BlogPostSchema, // → typed structured output
      stream: true,
      threadId: req.threadId,
      runId: req.runId,
    }),
  ),

  // One-shot media plugin: a hero image from a prompt. `imagePlugin`
  // pre-binds `req.input` to `{ prompt, numberOfImages?, size?,
  // modelOptions? }` and the result to `ImageGenerationResult`.
  heroImage: imagePlugin((req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.input.prompt,
    }),
  ),

  // One-shot media plugin: narrate a piece of text.
  narration: speechPlugin((req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.input.text,
      voice: 'alloy',
    }),
  ),
})
```

```typescript
// src/routes/api.blog-studio.ts — server route, single handler
import { createFileRoute } from '@tanstack/react-router'
import { blogPlugin } from '../lib/blog-studio'

export const Route = createFileRoute('/api/blog-studio')({
  server: {
    handlers: {
      POST: ({ request }) => blogPlugin.handler(request),
    },
  },
})
```

`handler` is the **only** thing the route needs to call. Internally it
routes by a `plugin` discriminator carried in the request's `forwardedProps`:
chat plugins dispatch to the AG-UI `RunAgentInput` parsing path (same as a
standalone chat route); generation plugins get their forwarded props
validated against the plugin's `input` schema (`400` with the validation
issues on failure) before `execute` runs. Unknown or undeclared plugins get
a `400` before any callback runs.

### Client: `usePlugin` — binds off the definition value directly

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { blogPlugin } from '../lib/blog-studio'

function BlogStudio() {
  const plugin = usePlugin(blogPlugin, {
    connection: fetchServerSentEvents('/api/blog-studio'),
    heroImage: { onResult: (result) => result.images[0] ?? null },
  })

  return (
    <div>
      <div>
        {plugin.drafting.messages.map((message) => (
          <div key={message.id}>{message.role}</div>
        ))}
      </div>
      <button
        onClick={async () => {
          const draft = await plugin.drafting.sendMessage('Pitch me a topic')
          if (!draft) return
          await Promise.all([
            plugin.heroImage.run({ prompt: draft.title }),
            plugin.narration.run({ text: draft.body }),
          ])
        }}
      >
        Write the post
      </button>
      {plugin.drafting.isLoading && (
        <button onClick={() => plugin.drafting.stop()}>Stop</button>
      )}
      {plugin.drafting.final && <h1>{plugin.drafting.final.title}</h1>}
    </div>
  )
}
```

`plugin` is typed from the definition value passed in — **no generics** at
the call site (inference rides the definition's `'~plugins'` phantom type).
Only declared plugins appear on `plugin`; referencing an undeclared key is a
compile error. A chat plugin's surface is the full `useChat` return
(`messages`, `sendMessage`, `isLoading`, `error`, `status`, `stop`, `clear`,
`addToolResult`, `addToolApprovalResponse`, …, plus `partial`/`final` when the
callback declared `outputSchema`); a generation plugin's surface is
`run(input)` (input typed by the plugin's schema; resolves with the result or
`null`), `result`, `isLoading`, `error`, `status`, `stop`, and `reset`.

Vue/Solid have identical patterns with different hook imports
(e.g. `import { usePlugin } from '@tanstack/ai-solid/plugin'`); Svelte
exports `createPlugin` from `@tanstack/ai-svelte/plugin`.

## Client binding — no `clientPlugin`, no kinds map

There is no `clientPlugin` stub and nothing to declare a second time on the
client. `definePlugin` returns `{ plugins, pluginKinds, handler, '~plugins' }`
— `pluginKinds` (a runtime `Record<name, 'chat' | 'one-shot'>`) is present on
the value itself, so `usePlugin(def, options)` reads it at runtime to decide
`ChatClient` vs `GenerationClient` per entry, for any set of names. Import the
same `blogPlugin` value on both the server route and the client component;
there's nothing else to define or keep in sync.

## Core Patterns

### 1. Client-side orchestration — sequencing plugins yourself

Because `execute` has no way to call a sibling plugin, a multi-step pipeline
("draft, then illustrate and narrate in parallel") is orchestrated on the
client with plain `await`/`Promise.all`:

```typescript
async function orchestrate(topic: string) {
  const draft = await plugin.drafting.sendMessage(
    `Write a blog post about: ${topic}`,
  )
  if (!draft) return // drafting failed or was stopped before completing

  await Promise.all([
    plugin.heroImage.run({ prompt: heroPromptFor(draft) }),
    plugin.narration.run({ text: forNarration(draft.body) }),
  ])
}
```

Each step drives its own reactive surface (`isLoading`/`result`/`error`), so
the UI fills in as each request finishes — you don't need a single combined
loading flag unless you want one (`drafting.isLoading || heroImage.isLoading
|| narration.isLoading`). This is also what lets a "Regenerate hero image" /
"Re-narrate" button re-run just one plugin without repeating the whole
pipeline.

This is **N requests, N independent abort scopes** — call each surface's own
`stop()` (there's no single "stop everything" call; call `stop()` on each
plugin surface you started). Server-side composition — one request, one
abort scope, live sub-run streaming — is coming later via a dedicated
`workflowPlugin`; it doesn't exist yet.

### 2. Chat tools auto-type from the server callback; per-plugin options are flat

Tools passed to `chat({ tools: [...] })` inside a chat plugin's callback
automatically type that plugin's `messages` tool-call/result parts — with
**no** client-side re-declaration needed for typing. Per-plugin client
options sit as flat top-level keys on the options object (alongside
`connection`/`id`/`threadId`), _not_ nested under a `plugins`/`verbs` map —
this is what lets `usePlugin` avoid a second generic:

```typescript
const plugin = usePlugin(blogPlugin, {
  connection: fetchServerSentEvents('/api/blog-studio'),
  // runtime only for client-executed (.client()) tools — types already
  // came from the server callback
  drafting: { tools: [showToast] },
})
```

Each **generation** plugin's entry accepts `{ onResult, forwardedProps }`:
`onResult` runs on the raw backend result and its return type becomes
`plugin.<name>.result`'s type (return nothing to keep the raw result); chat
plugin entries accept `{ tools, forwardedProps }`.

```typescript
const plugin = usePlugin(blogPlugin, {
  connection: fetchServerSentEvents('/api/blog-studio'),
  heroImage: { onResult: (result) => result.images[0]?.url ?? null },
})

plugin.heroImage.result // string | null — the transform's return type
```

Because the map is flat, a plugin literally named `connection`, `id`, or
`threadId` would collide with the reserved config keys — pick app names that
avoid those (`drafting`, `heroImage`, `narration`, not `connection`).

### 3. Structured output via `outputSchema` in a chat plugin's callback

If a chat plugin's callback passes `outputSchema` to `chat()`, that plugin's
surface picks up typed `partial` (progressive `DeepPartial`) and `final`
(validated terminal object), and `sendMessage` resolves to the validated
final (or `null`) instead of the messages array. Omit `outputSchema` and
neither field is present on the type — same conditional shape as
`useChat({ outputSchema })`.

### 4. Media factories over `generationPlugin`

`imagePlugin`, `videoPlugin`, `audioPlugin`, `speechPlugin`,
`transcriptionPlugin`, and `summarizePlugin` are thin wrappers: each is
`generationPlugin({ input: <fixed schema>, execute: callback })` with the
input contract and result type pre-bound to the corresponding media
activity, so `plugin.<name>.run(input)` is fully typed end to end without you
writing a Zod schema.

| Factory               | `req.input` shape (all fields on the object)                                              | Result type             |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------- |
| `imagePlugin`         | `{ prompt, numberOfImages?, size?, modelOptions? }`                                       | `ImageGenerationResult` |
| `videoPlugin`         | `{ prompt, size?, duration?, modelOptions? }`                                             | `VideoJobResult`        |
| `audioPlugin`         | `{ prompt, duration?, modelOptions? }`                                                    | `AudioGenerationResult` |
| `speechPlugin`        | `{ text, voice?, format?, speed?, modelOptions? }`                                        | `TTSResult`             |
| `transcriptionPlugin` | `{ audio, language?, prompt?, responseFormat?, modelOptions? }` (`audio` = base64 string) | `TranscriptionResult`   |
| `summarizePlugin`     | `{ text, maxLength?, style?, focus?, modelOptions? }`                                     | `SummarizationResult`   |

```typescript
import { transcriptionPlugin } from '@tanstack/ai-plugin-toolkit'
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

const transcript = transcriptionPlugin((req) =>
  generateTranscription({
    adapter: openaiTranscription('whisper-1'),
    audio: req.input.audio,
    language: req.input.language,
  }),
)
```

When none of the six shapes fit, fall back to `generationPlugin({ input, execute })`
directly with your own Standard Schema (Zod, Valibot, ArkType, …).

### 5. Only declared plugins are constructed; one shared connection

`definePlugin({ drafting, heroImage })` produces a client with exactly
`plugin.drafting` and `plugin.heroImage`. All plugins share the single
`connection` passed to `usePlugin` — one endpoint, one adapter. Each
underlying sub-client (a `ChatClient` per chat plugin, a `GenerationClient`
per generation plugin) tags its own requests with the plugin name so the
single `handler` can route.

### 6. `.run()` — calling a plugin directly, in-process

Every plugin (chat or generation) also has a `.run()`, sibling to `.handler`.
Where `.handler` parses an HTTP `Request` and streams an SSE `Response`,
`.run()` executes the plugin's logic **directly, in-process**, and resolves
with the typed result itself — no `Request` required, no `Response` produced.
Reach for it from a script, a server action, a cron job, or a test — anywhere
you want the value, not an HTTP round trip.

Keep the factory's return value in a `const` before handing it to
`definePlugin`; that same const is the typed handle you call `.run()` on:

```typescript
import { generateImage } from '@tanstack/ai'
import { definePlugin, imagePlugin } from '@tanstack/ai-plugin-toolkit'
import { openaiImage } from '@tanstack/ai-openai'

const heroImage = imagePlugin((req) =>
  generateImage({ adapter: openaiImage('gpt-image-2'), prompt: req.input.prompt }),
)

export const blogPlugin = definePlugin({ heroImage })

const img = await heroImage.run({ prompt: 'a cat wearing sunglasses' })
```

- **Generation plugins** — `.run()` resolves to `Promise<TResult>`, the same
  type `execute` returns (draining the terminal `generation:result` when
  `execute` streams).
- **Chat plugins** — `.run()` collects the callback's stream and resolves to
  `Promise<{ text, structured }>`: `text` is the accumulated assistant reply;
  `structured` is the validated `outputSchema` result, or `null` when the
  callback declared none.

`.run()` accepts **three input forms**, discriminated at runtime:

1. **Raw input** — the plugin's own typed input (generation) or a message
   array (chat): `heroImage.run({ prompt })`, `drafting.run(messages)`. The
   typed happy path shown above.
2. **A `Request`** — `heroImage.run(request)` reads and parses the body
   itself, the same path `.handler` uses.
3. **An already-parsed request body** — the AG-UI envelope object, when
   something upstream already parsed it for you.

Don't reach through `definePlugin`'s return value for this (e.g.
`blogPlugin['~plugins'].heroImage`) — `'~plugins'` is a type-only carrier for
client inference, never meant to be read at runtime. Call `.run()` on the
same named `const` you passed into `definePlugin`.

## Common Mistakes

### a. HIGH: Writing a custom handler that branches on plugin manually

```typescript
// WRONG — reimplementing what `handler` already does
export const POST = async (request: Request) => {
  const body = await request.json()
  if (body.forwardedProps.plugin === 'drafting') {
    return toServerSentEventsResponse(
      chat({ adapter, messages: body.messages }),
    )
  }
  // ...manual branching for every plugin
}

// CORRECT — definePlugin's handler already parses, validates, routes,
// and serializes
export const POST = (request: Request) => blogPlugin.handler(request)
```

### b. HIGH: Passing `model` or generation options to `usePlugin`

There is no `model`/`prompt` option on `usePlugin`. Model choice and
generation parameters belong inside the server plugins
(`openaiImage('gpt-image-2')`, …). Besides `connection`/`id`/`threadId`, the
client options are one flat entry per plugin name: chat plugins take
`{ tools, forwardedProps }`, generation plugins `{ onResult, forwardedProps }`.

```typescript
// WRONG — no model/prompt options, and per-plugin options aren't nested
// under a verbs/plugins map
usePlugin(blogPlugin, { connection, model: 'gpt-5.5' })

// CORRECT — flat, per-plugin-name options
usePlugin(blogPlugin, {
  connection: fetchServerSentEvents('/api/blog-studio'),
  heroImage: { onResult: (r) => r.images[0]?.url ?? null },
})
```

### c. HIGH: Expecting `execute` to compose a sibling plugin server-side

```typescript
// WRONG — there is no second `ctx` argument, and no ctx.call
const blogPost = generationPlugin({
  input: z.object({ topic: z.string() }),
  execute: async (req, ctx) => {
    const draft = await ctx.call(drafting, [...]) // ctx does not exist
    return draft
  },
})

// CORRECT — one arg; orchestrate sibling plugins on the client instead
// (Pattern 1), or wait for workflowPlugin once it ships
const heroImage = imagePlugin((req) => generateImage({ ... }))
```

### d. MEDIUM: Forgetting to propagate `req.signal` into provider calls

`stop()` aborts that plugin's fetch, but a provider call not chained to
`req.signal` (e.g. via `chat()`'s `abortController`) keeps burning tokens
server-side until it completes. Thread the signal into every activity a
plugin runs:

```typescript
const narrate = generationPlugin({
  input: z.object({ text: z.string() }),
  execute: (req) => {
    const abortController = new AbortController()
    req.signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
    return chat({
      adapter: openaiText('gpt-5.5'),
      messages: [{ role: 'user', content: req.input.text }],
      stream: false,
      abortController, // stop() / disconnect cancels the provider call
    })
  },
})
```

## Cross-References

- See also: **ai-core/chat-experience/SKILL.md** -- a chat plugin's surface
  is the same `useChat` surface; streaming, tool rendering, and multimodal
  messages all apply unchanged.
- See also: **ai-core/media-generation/SKILL.md** -- the media factories
  wrap the generation activities documented there (`generateImage`,
  `generateSpeech`, …); a plain `generationPlugin` can wrap any of them too.
- See also: **ai-core/tool-calling/SKILL.md** -- Tools passed to a chat
  plugin's callback follow the same server/client tool patterns as a
  standalone `chat()` route.
- See also: **ai-core/custom-backend-integration/SKILL.md** -- The shared
  `connection` passed to `usePlugin` is the same `ConnectConnectionAdapter`
  used by `useChat` / `useGenerate*`.
