---
title: Plugin Overview
id: plugin-overview
order: 1
description: "A plugin endpoint declares plugins — app-named units of AI work like `drafting`, `heroImage`, or `narration` — behind ONE request handler, and hands you ONE typed client. Learn the plugin kinds (chat, generation, and the media factories), how the client infers everything from the server definition, and when to reach for a plugin endpoint instead of the single-capability hooks."
keywords:
  - tanstack ai
  - plugin
  - definePlugin
  - usePlugin
  - chatPlugin
  - generationPlugin
  - imagePlugin
  - chat
  - image generation
  - text-to-speech
---

**A plugin endpoint declares a set of _plugins_ — app-named units of AI work — behind a single request handler on the server, and gives you back a single typed client in the browser.** You declare the plugins once with `definePlugin()`; `usePlugin()` returns one object keyed by exactly the plugins you declared, all sharing one connection.

Plugin names are *your* domain language, not a fixed set of library nouns. A blog studio declares `drafting`, `heroImage`, and `narration`; a video tool might declare `storyboard`, `thumbnail`, and `voiceover`. The library doesn't care what you call them — it routes on the names you choose and types the client from them.

`definePlugin()` lives on the `/plugin` subpath of `@tanstack/ai`, and `usePlugin()` on the `/plugin` subpath of `@tanstack/ai-react` (Solid and Vue follow the same pattern; Svelte exports `createPlugin` from `@tanstack/ai-svelte/plugin`) — not the package root.

```ts group=overview-blog
// lib/blog-studio.ts — define once; the API route only calls `.handler`
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import {
  chatPlugin,
  definePlugin,
  imagePlugin,
  speechPlugin,
} from '@tanstack/ai/plugin'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

export const blogPlugin = definePlugin({
  // A conversational plugin: message history in, streamed chat out.
  drafting: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      systemPrompts: ['You are a seasoned staff writer.'],
    }),
  ),

  // A one-shot media plugin: a hero image from a typed prompt.
  heroImage: imagePlugin((req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.input.prompt,
    }),
  ),

  // A one-shot media plugin: narrate a piece of text.
  narration: speechPlugin((req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.input.text,
      voice: 'alloy',
    }),
  ),
})
```

```ts group=overview-blog
// routes/api.blog-studio.ts — thin server route
export const POST = (request: Request) => blogPlugin.handler(request)
```

That one route now serves conversational drafting, image generation, and narration. On the client, one hook drives all three:

```tsx group=overview-client
// routes/blog-studio.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import type { UIMessage } from '@tanstack/ai-react'
import { blogPlugin } from '../lib/blog-studio'

function BlogStudio() {
  const plugin = usePlugin(blogPlugin, {
    connection: fetchServerSentEvents('/api/blog-studio'),
  })

  return (
    <div>
      <button onClick={() => plugin.drafting.sendMessage('Hello!')}>Send</button>
      {plugin.drafting.messages.map((message: UIMessage) => (
        <p key={message.id}>
          {message.parts.find((part) => part.type === 'text')?.content}
        </p>
      ))}

      <button
        onClick={() =>
          plugin.heroImage.run({ prompt: 'a red fox in a snowy forest' })
        }
      >
        Generate image
      </button>
      {plugin.heroImage.result?.images[0]?.url && (
        <img src={plugin.heroImage.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

`plugin.drafting` behaves exactly like [`useChat`](../chat/streaming) — streaming, tool calls, and message parts all work the same way. Each one-shot plugin (`plugin.heroImage`, `plugin.narration`, ...) is a typed run/result surface: a `.run(input)` method — its `input` typed by the plugin's schema, its resolved value by the callback's return — plus reactive `.result`, `.isLoading`, `.error`, `.status`, `.stop()`, and `.reset()`.

Both `plugin.<oneShot>.run(input)` and `plugin.<chatPlugin>.sendMessage(...)` **resolve to their result**, so you can chain them with a single `await` — `run` resolves to the plugin's result (or `null`), and `sendMessage` resolves to the structured `final` (when the chat callback set `outputSchema`) or the messages array otherwise. Because each plugin is an independent surface, the client sequences a multi-step pipeline itself — see [Orchestration](./plugins).

## Sharing the definition with the client

`usePlugin` takes the **`definePlugin` value directly** — the same value the server route calls `.handler` on. There is no separate client stub to declare and keep in sync.

```ts group=overview-share
// lib/blog-studio.ts
import { chat } from '@tanstack/ai'
import { chatPlugin, definePlugin } from '@tanstack/ai/plugin'
import { openaiText } from '@tanstack/ai-openai'

// One value, imported by BOTH the API route (calls `.handler`) and the
// page (passes it to `usePlugin`).
export const blogPlugin = definePlugin({
  drafting: chatPlugin((req) =>
    chat({ adapter: openaiText('gpt-5.5'), messages: req.messages }),
  ),
})
```

This works because `definePlugin` returns a value that carries, at runtime, the declared plugin **names** and their **kinds** (`chat` vs `one-shot`). `usePlugin` reads those to build the right client surface per plugin — a `ChatClient` for chat plugins, a `GenerationClient` for generation plugins — for whatever names you chose, with no kinds map to hand-maintain. The input/result/tool/schema *types* come from the value's type at compile time.

**Importing the definition into the browser is safe — it never leaks credentials.** `definePlugin()` is inert: none of the callbacks run and no adapter is constructed until a request actually reaches `handler` on the server. API keys are read from the server environment when `handler` runs; they are never present in code. Importing the value ships the (inert) adapter *code* to the client bundle, not any secret, and the callbacks never fire client-side.

The [`blog-studio` example](https://github.com/TanStack/ai/blob/main/examples/ts-react-chat/src/lib/blog-studio.ts) defines the plugin in one shared lib module and imports it from both the route and the page.

## The plugin kinds

### `chatPlugin(callback)` — conversational

The callback receives the parsed chat request (`messages`, `threadId`, `runId`, client-declared `tools`, `forwardedProps`, and the raw `request`) and returns the stream `chat()` produces. On the client it becomes the full chat surface: `sendMessage`, `messages`, tool calls, approvals, structured output.

### `generationPlugin({ input, execute })` — one-shot

`input` is a [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType, ...) describing the input; the handler validates every incoming request against it **at runtime** before `execute` runs (a mismatch gets a `400` with the validation issues — the callback never sees a malformed input). `execute` receives the validated `req` (with `input`, `threadId`, `runId`, an abort `signal`, and the raw `request`) and returns a `Promise` of the result, or an `AsyncIterable` of stream chunks. On the client it becomes the `run`/`result` surface.

You can declare **several plugins of the same kind** — including several chat plugins. Each gets its own conversation state, system prompt, and even model:

```ts group=overview-support
// api/support.ts
import { chat } from '@tanstack/ai'
import { chatPlugin, definePlugin } from '@tanstack/ai/plugin'
import { openaiText } from '@tanstack/ai-openai'

export const supportPlugin = definePlugin({
  // The main conversation the user sees.
  primaryChat: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      systemPrompts: [
        'You are a customer-support agent for Acme. Be concise and friendly.',
      ],
    }),
  ),
  // A second, independent chat surface: condense the ticket for handoff.
  summaryChat: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      systemPrompts: [
        'Summarize the conversation you are given as a terse handoff note.',
      ],
    }),
  ),
})

export const POST = (request: Request) => supportPlugin.handler(request)
```

On the client, `plugin.primaryChat` and `plugin.summaryChat` are two fully independent chat surfaces — separate `messages`, separate `sendMessage` — behind the same endpoint.

The handler discriminates each incoming request by a `plugin` field the client sends, routes it to the matching callback, and streams the result back over Server-Sent Events. Undeclared plugin names get a `400` before any callback runs.

## Media factories

The six **media factories** are `generationPlugin` with the input schema and result type pre-bound for one media activity — so `plugin.<name>.run(input)` is typed input → output end to end without you writing a schema:

| Factory | Input | Result |
|---|---|---|
| `imagePlugin` | `{ prompt, numberOfImages?, size?, modelOptions? }` | `ImageGenerationResult` |
| `videoPlugin` | `{ prompt, size?, duration?, modelOptions? }` | `VideoJobResult` |
| `audioPlugin` | `{ prompt, duration?, modelOptions? }` | `AudioGenerationResult` |
| `speechPlugin` | `{ text, voice?, format?, speed?, modelOptions? }` | `TTSResult` |
| `transcriptionPlugin` | `{ audio, language?, prompt?, responseFormat?, modelOptions? }` | `TranscriptionResult` |
| `summarizePlugin` | `{ text, maxLength?, style?, focus?, modelOptions? }` | `SummarizationResult` |

Each takes a single callback `(req) => result` — `req.input` is already typed to that media contract. Wire the callback to the matching `generate*` / `summarize` activity:

```ts group=overview-media
// api/studio.ts
import {
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
  summarize,
} from '@tanstack/ai'
import {
  definePlugin,
  imagePlugin,
  speechPlugin,
  summarizePlugin,
  transcriptionPlugin,
  videoPlugin,
} from '@tanstack/ai/plugin'
import {
  openaiImage,
  openaiSpeech,
  openaiSummarize,
  openaiTranscription,
  openaiVideo,
} from '@tanstack/ai-openai'

export const studioPlugin = definePlugin({
  poster: imagePlugin((req) =>
    generateImage({ adapter: openaiImage('gpt-image-2'), prompt: req.input.prompt }),
  ),
  teaser: videoPlugin((req) =>
    generateVideo({ adapter: openaiVideo('sora-2'), prompt: req.input.prompt }),
  ),
  voiceover: speechPlugin((req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.input.text,
      voice: req.input.voice ?? 'alloy',
    }),
  ),
  captions: transcriptionPlugin((req) =>
    generateTranscription({
      adapter: openaiTranscription('whisper-1'),
      audio: req.input.audio,
    }),
  ),
  recap: summarizePlugin((req) =>
    summarize({ adapter: openaiSummarize('gpt-5.5'), text: req.input.text }),
  ),
})

export const POST = (request: Request) => studioPlugin.handler(request)
```

`audioPlugin` follows the same shape for music / sound-effect generation via a provider that supports it. When you need a shape the factories don't cover, drop down to `generationPlugin({ input, execute })` and pass your own schema — the factories are just that call with the media contract filled in.

On the client, each is the same typed run/result surface as any generation plugin:

```tsx group=overview-media-client
// components/Poster.tsx
import { generateImage } from '@tanstack/ai'
import { definePlugin, imagePlugin } from '@tanstack/ai/plugin'
import { openaiImage } from '@tanstack/ai-openai'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'

// The same definition your server route exports — share it from one module in
// a real app; repeated here so this snippet type-checks on its own.
const studioPlugin = definePlugin({
  poster: imagePlugin((req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.input.prompt,
    }),
  ),
})

function Poster() {
  const plugin = usePlugin(studioPlugin, {
    connection: fetchServerSentEvents('/api/studio'),
  })

  return (
    <div>
      {/* `run`'s input is typed to `{ prompt; numberOfImages?; size?; ... }` */}
      <button onClick={() => plugin.poster.run({ prompt: 'a red fox', size: '1024x1024' })}>
        Generate
      </button>
      {plugin.poster.result?.images[0]?.url && (
        <img src={plugin.poster.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

## Typed chat plugins: tools and structured output

A chat plugin inherits `useChat`'s full type inference, driven entirely by what its server callback passes to `chat()` — you don't re-declare anything on the client.

**Callback tools auto-type the plugin's `messages`.** Pass `tools` to `chat()` in the callback and the tool-call/result parts on `plugin.<name>.messages` are typed from those tools, with nothing to register on the client:

```tsx
// components/WeatherChat.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { chat, toolDefinition } from '@tanstack/ai'
import { chatPlugin, definePlugin } from '@tanstack/ai/plugin'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const getWeatherDef = toolDefinition({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ tempF: z.number(), conditions: z.string() }),
})

const getWeather = getWeatherDef.server(async ({ city }) => {
  return { tempF: 72, conditions: `Sunny in ${city}` }
})

// The same definition your server route exports — share it from one module in
// a real app; repeated here so this snippet type-checks on its own.
const weatherPlugin = definePlugin({
  primaryChat: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      tools: [getWeather],
    }),
  ),
})

function WeatherChat() {
  const plugin = usePlugin(weatherPlugin, {
    connection: fetchServerSentEvents('/api/weather'),
  })

  const weatherCall = plugin.primaryChat.messages
    .at(-1)
    ?.parts.find(
      (part) => part.type === 'tool-call' && part.name === 'get_weather',
    )

  return (
    <div>
      <button
        onClick={() =>
          plugin.primaryChat.sendMessage('What is the weather in Denver?')
        }
      >
        Ask
      </button>
      {weatherCall?.type === 'tool-call' && weatherCall.output && (
        <p>{weatherCall.output.conditions}</p>
      )}
    </div>
  )
}
```

No tools option was passed to `usePlugin` — `weatherCall.output` is still narrowed to `{ tempF: number; conditions: string }`, inferred entirely from `tools: [getWeather]` on the server callback.

**Per-plugin `tools` are only for client-executed tools.** A [client tool](../tools/client-tools)'s `.client()` implementation runs in the browser, so its code can't cross the wire. The server callback sees only the tool's *definition* (for typing and to tell the model it exists); the client registers the runtime implementation under the plugin's entry in the flat options. Types still come from the server callback either way:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { chat, toolDefinition } from '@tanstack/ai'
import { chatPlugin, definePlugin } from '@tanstack/ai/plugin'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const showToastDef = toolDefinition({
  name: 'show_toast',
  description: 'Show a browser notification',
  inputSchema: z.object({ message: z.string() }),
})

const showToast = showToastDef.client((input) => {
  console.log(input.message)
  return { ok: true }
})

// The same definition your server route exports — share it from one module in
// a real app; repeated here so this snippet type-checks on its own.
const toastPlugin = definePlugin({
  primaryChat: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      tools: [showToastDef], // definition only — the client executes it
    }),
  ),
})

function useToastChat() {
  return usePlugin(toastPlugin, {
    connection: fetchServerSentEvents('/api/toast'),
    // Per-plugin options are keyed by the plugin's declared name.
    primaryChat: { tools: [showToast] },
  })
}
```

**`outputSchema` → typed `partial` / `final`.** If a chat plugin's callback passes an `outputSchema` to `chat()`, that plugin's surface picks up a progressively-parsed `partial` (`DeepPartial`) and a validated terminal `final` — the same inference [`useChat({ outputSchema })`](../structured-outputs/streaming) gives you:

```tsx
// components/BlogOutlineForm.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { chat } from '@tanstack/ai'
import { chatPlugin, definePlugin } from '@tanstack/ai/plugin'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const BlogOutlineSchema = z.object({
  title: z.string(),
  sections: z.array(z.string()),
})

// The same definition your server route exports — share it from one module in
// a real app; repeated here so this snippet type-checks on its own.
const outlinePlugin = definePlugin({
  drafting: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: BlogOutlineSchema,
      stream: true,
    }),
  ),
})

function BlogOutlineForm() {
  const plugin = usePlugin(outlinePlugin, {
    connection: fetchServerSentEvents('/api/outline'),
  })

  return (
    <div>
      <button
        onClick={() =>
          plugin.drafting.sendMessage('Outline a blog post about red foxes')
        }
      >
        Generate outline
      </button>
      <p>Title: {plugin.drafting.partial.title ?? '…'}</p>
      <ul>
        {plugin.drafting.partial.sections?.map((section, i) => (
          <li key={i}>{section}</li>
        ))}
      </ul>
      {plugin.drafting.final && (
        <pre>{JSON.stringify(plugin.drafting.final, null, 2)}</pre>
      )}
    </div>
  )
}
```

`partial` and `final` only exist on the type when the callback declares `outputSchema` — omit it and the plugin's surface has no such fields, exactly like `useChat` without `outputSchema`. See [Structured Outputs](../structured-outputs/overview) for the full story.

## Transforming one-shot results

Each generation plugin's entry in the flat options accepts an `onResult` transform. It runs on the raw backend result before it lands on `plugin.<name>.result`, and **its return type becomes that plugin's `result` type**. Use it to reshape a result once, at the hook, instead of deriving it in every component that reads it:

```tsx
// components/CoverArt.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { generateImage } from '@tanstack/ai'
import { definePlugin, imagePlugin } from '@tanstack/ai/plugin'
import { openaiImage } from '@tanstack/ai-openai'

const coverPlugin = definePlugin({
  heroImage: imagePlugin((req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.input.prompt,
    }),
  ),
})

function CoverArt() {
  const plugin = usePlugin(coverPlugin, {
    connection: fetchServerSentEvents('/api/cover'),
    // `result` is the raw `ImageGenerationResult`; the return type flows
    // through to `plugin.heroImage.result`.
    heroImage: { onResult: (result) => result.images[0]?.url ?? null },
  })

  return (
    <div>
      <button onClick={() => plugin.heroImage.run({ prompt: 'a red fox' })}>
        Generate
      </button>
      {/* `plugin.heroImage.result` is now `string | null`, not the raw result */}
      {plugin.heroImage.result && <img src={plugin.heroImage.result} alt="" />}
    </div>
  )
}
```

Return `undefined` (or nothing) from `onResult` to keep the raw result. Each plugin's entry also takes `forwardedProps` to merge extra fields into that plugin's request body. Options are **flat** — one entry per plugin name, alongside the reserved `connection` / `id` / `threadId` keys, which are excluded from the per-name map so a plugin name can never collide with them.

## When should you reach for a plugin endpoint?

A plugin endpoint is not "a better `useChat`." It earns its place when you have **two or more plugins that live on the same surface** — a page, a workflow, a pipeline. If you need exactly one chat box or one image button, the single hook is simpler and there is nothing to gain from the extra layer.

| Your situation | Reach for | Why |
|---|---|---|
| One page needs chat **and** images **and** narration | A plugin endpoint | One connection, one typed client, one route to deploy and secure |
| One plugin's output feeds the next (draft a post → illustrate it → narrate it) | A plugin endpoint, [orchestrated on the client](./plugins) | The client `await`s each plugin and sequences them; same endpoint, same types |
| The user drives each step by hand (regenerate the image, re-narrate) | The same plugins, called directly from the client | `plugin.heroImage.run(...)` — same endpoint, same types |
| A page that only sends chat messages | [`useChat`](../chat/streaming) | No second plugin to share — the plugin layer adds nothing |
| A page that only generates images | [`useGenerateImage`](../media/generation-hooks) | Same — a single hook is the whole story |

**The honest tradeoff:** a plugin endpoint centralizes routing and typing across plugins, but it also couples them into one definition and one endpoint. If two features never appear together and want different auth or system prompts, don't force them into one definition — give each surface its own (see [Scenarios](./scenarios)).

## Which page do I read?

| You want to… | Read |
|---|---|
| Sequence plugins into a pipeline — draft a post, then illustrate and narrate it — with client-side orchestration | [Orchestration](./plugins) |
| Give different pages or features their own plugin sets, routes, and system prompts | [Scenarios](./scenarios) |
| Understand the underlying chat surface (streaming, tools, message parts) | [Chat: Streaming](../chat/streaming) |
| Drive a single capability without a plugin endpoint | [Media & Generation Hooks](../media/generation-hooks) |
