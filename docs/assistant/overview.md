---
title: Assistant Overview
id: assistant-overview
order: 1
description: "An assistant bundles several AI capabilities — chat, image, speech, and more — behind ONE endpoint and hands you ONE typed client. Learn when to reach for an assistant instead of the single-capability hooks, and how to define and drive one."
keywords:
  - tanstack ai
  - assistant
  - defineAssistant
  - useAssistant
  - multi-capability
  - chat
  - image generation
  - text-to-speech
---

**An assistant bundles multiple AI capabilities — `chat`, `image`, `speech`, and more — behind a single request handler on the server, and gives you back a single typed client on the browser.** You declare the capabilities once with `defineAssistant()`; `useAssistant()` returns one `assistant` object keyed by exactly the capabilities you declared, all sharing one connection.

`defineAssistant()` lives on the `/assistant` subpath of `@tanstack/ai`, and `useAssistant()` on the `/assistant` subpath of `@tanstack/ai-react` (Solid, Vue, and Svelte follow the same pattern) — not the package root.

```ts
// api/assistant.ts
import { chat, generateImage } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiText } from '@tanstack/ai-openai'

export const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({ adapter: openaiText('gpt-5.5'), messages: req.messages }),
  image: (req) => {
    // `req.prompt` arrives as `unknown` — narrow it before use.
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
    })
  },
})

export const POST = (request: Request) => blogAssistant.handler(request)
```

That one route now serves both chat and image generation. On the client, one hook drives both:

```tsx
// components/Assistant.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat, generateImage } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiText } from '@tanstack/ai-openai'

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const blogAssistant = defineAssistant({
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
})

function Assistant() {
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  return (
    <div>
      <button onClick={() => assistant.chat.sendMessage('Hello!')}>Send</button>
      {assistant.chat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.find((part) => part.type === 'text')?.content}
        </p>
      ))}

      <button
        onClick={() =>
          assistant.image.generate({ prompt: 'a red fox in a snowy forest' })
        }
      >
        Generate image
      </button>
      {assistant.image.result?.images[0]?.url && (
        <img src={assistant.image.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

`assistant.chat` behaves exactly like [`useChat`](../chat/streaming) — streaming, tool calls, and message parts all work the same way. Each one-shot capability (`assistant.image`, `assistant.speech`, ...) behaves like its matching single hook ([`useGenerateImage`](../media/image-generation#hook-api), and so on): a `.generate(input)` method plus reactive `.result`, `.isLoading`, and `.error`.

Both `assistant.<oneshot>.generate(input)` and `assistant.chat.sendMessage(...)` **resolve to their result**, so you can chain them with a single `await` — `generate` resolves to the generation result (or `null`), and `sendMessage` resolves to the structured `final` (when the chat callback set `outputSchema`) or the messages array otherwise (`const result = await assistant.image.generate(...)`). The reactive `.result` / `.messages` / `.partial` / `.final` remain for rendering. → Chaining these awaited returns is exactly where an assistant pays off; see [Scenarios](./scenarios).

## When should you reach for an assistant?

An assistant is not "a better `useChat`." It earns its place only when you have **two or more capabilities that live on the same surface** — a page, a workflow, a pipeline. If you need exactly one capability, the single hook is simpler and there is nothing to gain from the extra layer.

| Your situation | Reach for | Why |
|---|---|---|
| One page needs chat **and** image **and** speech | An assistant | One connection, one client object, one route to deploy and secure |
| One capability feeds the next (generate an image → write copy about it → narrate it) | An assistant | Typed handoffs between capabilities on the same `assistant` object |
| A multi-step content pipeline behind one endpoint | An assistant | The whole workflow is one deployable unit with one auth boundary |
| A page that only sends chat messages | [`useChat`](../chat/streaming) | No second capability to share — the assistant layer adds nothing |
| A page that only generates images | [`useGenerateImage`](../media/generation-hooks) | Same — a single hook is the whole story |

**The honest tradeoff:** an assistant centralizes routing and typing across capabilities, but it also couples them into one definition and one endpoint. If two features never appear together and want different auth or system prompts, don't force them into one assistant — give each its own (see [Multiple Assistants](./multiple-assistants)). Reach for an assistant when capabilities *share* something (a connection, a page, or each other's output); keep them separate when they don't.

## Defining capabilities (server)

Each capability is a plain callback: `(req) => <activity call>`. The `chat` capability returns the stream `chat()` produces; one-shot capabilities (`image`, `speech`, `audio`, `video`, `transcription`, `summarize`) return either a `Promise` of their result or — with `stream: true` — an `AsyncIterable`. Every key is optional; the client only ever sees the capabilities you declare.

`defineAssistant()` itself is inert: none of these callbacks run, and no adapter is constructed, until a request actually reaches `blogAssistant.handler`. The handler discriminates each incoming request by capability — routed there by the client — parses it into the matching request shape (`AssistantChatRequest`, `AssistantImageRequest`, `AssistantSpeechRequest`, ...), and streams whatever the callback returns back over Server-Sent Events.

Because one-shot request fields such as `req.prompt` arrive as `unknown` from the wire, narrow them with a `typeof` check (as above) before handing them to the adapter — never assume the shape.

## Typed chat: tools and structured output

The `chat` capability inherits `useChat`'s full type inference, driven entirely by what the server callback passes to `chat()` — you don't re-declare anything on the client.

**Callback tools auto-type `assistant.chat.messages`.** Pass `tools` to `chat()` in the server callback and the tool-call/result parts on `assistant.chat.messages` are typed from those tools, with nothing to register on the client:

```tsx
// components/WeatherChat.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat, toolDefinition } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
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

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      tools: [getWeather],
    }),
})

function WeatherChat() {
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  const weatherCall = assistant.chat.messages
    .at(-1)
    ?.parts.find(
      (part) => part.type === 'tool-call' && part.name === 'get_weather',
    )

  return (
    <div>
      <button
        onClick={() =>
          assistant.chat.sendMessage('What is the weather in Denver?')
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

No `chat: { tools }` option was passed to `useAssistant` — `weatherCall.output` is still narrowed to `{ tempF: number; conditions: string }`, inferred entirely from `tools: [getWeather]` on the server callback.

**`chat: { tools }` is optional — you need it only for client-executed tools.** A [client tool](../tools/client-tools)'s `.client()` implementation runs in the browser, so its code can't cross the wire. The server callback sees only the tool's *definition* (for typing and to tell the model it exists); the client registers the runtime implementation via `chat: { tools }`. Types still come from the server callback either way:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat, toolDefinition } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
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

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      tools: [showToastDef], // definition only — the client executes it
    }),
})

function useAssistantWithClientTool() {
  return useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
    chat: { tools: [showToast] },
  })
}
```

**`outputSchema` → typed `assistant.chat.partial` / `.final`.** If the `chat` callback passes an `outputSchema` to `chat()`, `assistant.chat` picks up a progressively-parsed `partial` (`DeepPartial`) and a validated terminal `final` — the same inference [`useChat({ outputSchema })`](../structured-outputs/streaming) gives you:

```tsx
// components/BlogOutlineForm.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { chat } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const BlogOutlineSchema = z.object({
  title: z.string(),
  sections: z.array(z.string()),
})

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: BlogOutlineSchema,
      stream: true,
    }),
})

function BlogOutlineForm() {
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  return (
    <div>
      <button
        onClick={() =>
          assistant.chat.sendMessage('Outline a blog post about red foxes')
        }
      >
        Generate outline
      </button>
      <p>Title: {assistant.chat.partial.title ?? '…'}</p>
      <ul>
        {assistant.chat.partial.sections?.map((section, i) => (
          <li key={i}>{section}</li>
        ))}
      </ul>
      {assistant.chat.final && (
        <pre>{JSON.stringify(assistant.chat.final, null, 2)}</pre>
      )}
    </div>
  )
}
```

`partial` and `final` only exist on the type when the `chat` callback declares `outputSchema` — omit it and `assistant.chat` has no such fields, exactly like `useChat` without `outputSchema`. See [Structured Outputs](../structured-outputs/overview) for the full story.

## Which page do I read?

| You want to… | Read |
|---|---|
| Chain capabilities end-to-end — run one after another and thread each result into the next (a pipeline, a content workflow) | [Scenarios](./scenarios) |
| Give different pages or features their own capability sets, routes, and system prompts | [Multiple Assistants](./multiple-assistants) |
| Understand the underlying chat surface (streaming, tools, message parts) | [Chat: Streaming](../chat/streaming) |
| Drive a single capability without an assistant | [Media & Generation Hooks](../media/generation-hooks) |
