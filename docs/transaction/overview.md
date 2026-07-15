---
title: Transaction Overview
id: transaction-overview
order: 1
description: "A transaction endpoint declares verbs — app-named units of AI work like `drafting`, `heroImage`, or `narration` — behind ONE request handler, and hands you ONE typed client. Learn the two kinds of verbs, how the client infers everything from the server definition, and when to reach for a transaction endpoint instead of the single-capability hooks."
keywords:
  - tanstack ai
  - transaction
  - defineTransaction
  - clientTransaction
  - useTransaction
  - verbs
  - chat
  - image generation
  - text-to-speech
---

**A transaction endpoint declares _verbs_ — app-named units of AI work — behind a single request handler on the server, and gives you back a single typed client in the browser.** You declare the verbs once with `defineTransaction()`; `useTransaction()` returns one object keyed by exactly the verbs you declared, all sharing one connection. And because a verb can compose its siblings server-side, one client call can run a whole multi-step pipeline as a single request — a [transaction](./transactions).

Verb names are *your* domain language, not a fixed set of library nouns. A blog studio declares `drafting`, `heroImage`, `narration`, and `blogPost`; a video tool might declare `storyboard`, `thumbnail`, and `voiceover`. The library doesn't care what you call them — it routes on the names you choose and types the client from them.

`defineTransaction()` lives on the `/transaction` subpath of `@tanstack/ai`, and `useTransaction()` on the `/transaction` subpath of `@tanstack/ai-react` (Solid and Vue follow the same pattern; Svelte exports `createTransaction` from `@tanstack/ai-svelte/transaction`) — not the package root.

```ts
// api/blog-studio.ts
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

export const blogTransaction = defineTransaction({
  // A conversational verb: message history in, streamed chat out.
  drafting: chatVerb((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      systemPrompts: ['You are a seasoned staff writer.'],
    }),
  ),

  // A one-shot verb: schema-validated input in, typed result out.
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
      generateSpeech({
        adapter: openaiSpeech('tts-1'),
        text: input.text,
        voice: 'alloy',
      }),
  }),
})

export const POST = (request: Request) => blogTransaction.handler(request)
```

That one route now serves conversational drafting, image generation, and narration. On the client, one hook drives all three:

```tsx
// components/BlogStudio.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { clientTransaction } from '@tanstack/ai/transaction'
import type { blogTransaction } from './api/blog-studio'

// Type-only binding to the server definition — no provider imports in the
// browser bundle. See "Sharing the definition with the client" below.
const blogTxnDef = clientTransaction<typeof blogTransaction>({
  drafting: 'chat',
  heroImage: 'one-shot',
  narration: 'one-shot',
  blogPost: 'one-shot',
})

function BlogStudio() {
  const txn = useTransaction(blogTxnDef, {
    connection: fetchServerSentEvents('/api/blog-studio'),
  })

  return (
    <div>
      <button onClick={() => txn.drafting.sendMessage('Hello!')}>Send</button>
      {txn.drafting.messages.map((message) => (
        <p key={message.id}>
          {message.parts.find((part) => part.type === 'text')?.content}
        </p>
      ))}

      <button
        onClick={() =>
          txn.heroImage.run({ prompt: 'a red fox in a snowy forest' })
        }
      >
        Generate image
      </button>
      {txn.heroImage.result?.images[0]?.url && (
        <img src={txn.heroImage.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

`txn.drafting` behaves exactly like [`useChat`](../chat/streaming) — streaming, tool calls, and message parts all work the same way. Each one-shot verb (`txn.heroImage`, `txn.narration`, ...) is a typed run/result surface: a `.run(input)` method — its `input` typed by the verb's schema, its resolved value by `execute`'s return — plus reactive `.result`, `.isLoading`, `.error`, `.status`, `.stop()`, `.reset()`, and live [`.subRuns`](./transactions#watching-sub-runs-live).

Both `txn.<oneShot>.run(input)` and `txn.<chatVerb>.sendMessage(...)` **resolve to their result**, so you can chain them with a single `await` — `run` resolves to the verb's result (or `null`), and `sendMessage` resolves to the structured `final` (when the chat callback set `outputSchema`) or the messages array otherwise. When steps should be composed *server-side* instead — one request, one abort scope — declare a verb that calls its siblings with `ctx.call`; that's a [transaction](./transactions).

## The two kinds of verbs

**`chatVerb(callback)` — conversational.** The callback receives the parsed chat request (`messages`, `threadId`, `runId`, client-declared `tools`, `forwardedProps`, and the raw `request`) and returns the stream `chat()` produces. On the client it becomes the full chat surface: `sendMessage`, `messages`, tool calls, approvals, structured output.

**`verb({ input, execute })` — one-shot.** `input` is a [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType, ...) describing the input; the handler validates every incoming request against it **at runtime** before `execute` runs (a mismatch gets a `400` with the validation issues — the callback never sees a malformed input). `execute` receives the validated `req` (with `input`, `threadId`, `runId`, an abort `signal`, and the raw `request`) plus a composition context `ctx`, and returns a `Promise` of the result. On the client it becomes the `run`/`result` surface.

You can declare **several verbs of the same kind** — including several chat verbs. Each gets its own conversation state, system prompt, and even model:

```ts
// api/support.ts
import { chat } from '@tanstack/ai'
import { chatVerb, defineTransaction } from '@tanstack/ai/transaction'
import { openaiText } from '@tanstack/ai-openai'

export const supportTransaction = defineTransaction({
  // The main conversation the user sees.
  primaryChat: chatVerb((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      systemPrompts: [
        'You are a customer-support agent for Acme. Be concise and friendly.',
      ],
    }),
  ),
  // A second, independent chat surface: condense the ticket for handoff.
  summaryChat: chatVerb((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      systemPrompts: [
        'Summarize the conversation you are given as a terse handoff note.',
      ],
    }),
  ),
})

export const POST = (request: Request) => supportTransaction.handler(request)
```

On the client, `txn.primaryChat` and `txn.summaryChat` are two fully independent chat surfaces — separate `messages`, separate `sendMessage` — behind the same endpoint.

`defineTransaction()` itself is **inert**: none of these callbacks run, and no adapter is constructed, until a request actually reaches `handler`. The handler discriminates each incoming request by a `verb` field the client sends, routes it to the matching callback, and streams the result back over Server-Sent Events. Undeclared verbs get a `400` before any callback runs.

## Sharing the definition with the client

`useTransaction` needs the definition's **type** to build the typed client — verb names and kinds at runtime, input/result/tool/schema types at compile time.

The recommended pattern is **`clientTransaction<typeof serverDef>({ kinds })`**: define the transaction once on the server (export it, or export a `ReturnType<typeof createTransaction>` type when the definition is built per-request), then bind it on the client with a verb-name → kind map. The generic is supplied via `import type` — erased from the bundle, so provider SDKs never ship to the browser. The kinds map is checked exhaustively against the server definition, so drift fails at compile time.

```tsx
import type { blogTransaction } from './api/blog-studio'
import { clientTransaction } from '@tanstack/ai/transaction'

const blogTxnDef = clientTransaction<typeof blogTransaction>({
  drafting: 'chat',
  heroImage: 'one-shot',
  narration: 'one-shot',
  blogPost: 'one-shot',
})
```

When the definition truly has no provider imports — a shared isomorphic module works fine — you can also export one `defineTransaction(...)` value and pass it to both `handler` and `useTransaction` directly. The [`blog-studio` example](https://github.com/TanStack/ai/blob/main/examples/ts-react-chat/src/routes/blog-studio.tsx) uses `clientTransaction` end to end.

## When should you reach for a transaction endpoint?

A transaction endpoint is not "a better `useChat`." It earns its place when you have **two or more verbs that live on the same surface** — a page, a workflow, a pipeline — or when the server should compose steps into a single request. If you need exactly one chat box or one image button, the single hook is simpler and there is nothing to gain from the extra layer.

| Your situation | Reach for | Why |
|---|---|---|
| One page needs chat **and** images **and** narration | A transaction endpoint | One connection, one typed client, one route to deploy and secure |
| One verb's output feeds the next (draft a post → illustrate it → narrate it) as a single unit of work | A [transaction](./transactions) | Server-side composition via `ctx.call`: one request, live sub-run streaming, one abort scope |
| The user drives each step by hand (regenerate the image, re-narrate) | The same verbs, called directly from the client | `txn.heroImage.run(...)` — same endpoint, same types |
| A page that only sends chat messages | [`useChat`](../chat/streaming) | No second verb to share — the transaction layer adds nothing |
| A page that only generates images | [`useGenerateImage`](../media/generation-hooks) | Same — a single hook is the whole story |

**The honest tradeoff:** a transaction endpoint centralizes routing and typing across verbs, but it also couples them into one definition and one endpoint. If two features never appear together and want different auth or system prompts, don't force them into one definition — give each surface its own (see [Scenarios](./scenarios)).

## Typed chat verbs: tools and structured output

A chat verb inherits `useChat`'s full type inference, driven entirely by what its server callback passes to `chat()` — you don't re-declare anything on the client.

**Callback tools auto-type the verb's `messages`.** Pass `tools` to `chat()` in the callback and the tool-call/result parts on `txn.<verb>.messages` are typed from those tools, with nothing to register on the client:

```tsx
// components/WeatherChat.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { chat, toolDefinition } from '@tanstack/ai'
import { chatVerb, defineTransaction } from '@tanstack/ai/transaction'
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
const weatherTransaction = defineTransaction({
  primaryChat: chatVerb((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      tools: [getWeather],
    }),
  ),
})

function WeatherChat() {
  const txn = useTransaction(weatherTransaction, {
    connection: fetchServerSentEvents('/api/weather'),
  })

  const weatherCall = txn.primaryChat.messages
    .at(-1)
    ?.parts.find(
      (part) => part.type === 'tool-call' && part.name === 'get_weather',
    )

  return (
    <div>
      <button
        onClick={() =>
          txn.primaryChat.sendMessage('What is the weather in Denver?')
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

No tools option was passed to `useTransaction` — `weatherCall.output` is still narrowed to `{ tempF: number; conditions: string }`, inferred entirely from `tools: [getWeather]` on the server callback.

**Per-verb `tools` are only for client-executed tools.** A [client tool](../tools/client-tools)'s `.client()` implementation runs in the browser, so its code can't cross the wire. The server callback sees only the tool's *definition* (for typing and to tell the model it exists); the client registers the runtime implementation under the verb's entry in the nested `verbs` option. Types still come from the server callback either way:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { chat, toolDefinition } from '@tanstack/ai'
import { chatVerb, defineTransaction } from '@tanstack/ai/transaction'
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
const toastTransaction = defineTransaction({
  primaryChat: chatVerb((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      tools: [showToastDef], // definition only — the client executes it
    }),
  ),
})

function useToastChat() {
  return useTransaction(toastTransaction, {
    connection: fetchServerSentEvents('/api/toast'),
    verbs: {
      primaryChat: { tools: [showToast] },
    },
  })
}
```

**`outputSchema` → typed `partial` / `final`.** If a chat verb's callback passes an `outputSchema` to `chat()`, that verb's surface picks up a progressively-parsed `partial` (`DeepPartial`) and a validated terminal `final` — the same inference [`useChat({ outputSchema })`](../structured-outputs/streaming) gives you:

```tsx
// components/BlogOutlineForm.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { chat } from '@tanstack/ai'
import { chatVerb, defineTransaction } from '@tanstack/ai/transaction'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const BlogOutlineSchema = z.object({
  title: z.string(),
  sections: z.array(z.string()),
})

// The same definition your server route exports — share it from one module in
// a real app; repeated here so this snippet type-checks on its own.
const outlineTransaction = defineTransaction({
  drafting: chatVerb((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: BlogOutlineSchema,
      stream: true,
    }),
  ),
})

function BlogOutlineForm() {
  const txn = useTransaction(outlineTransaction, {
    connection: fetchServerSentEvents('/api/outline'),
  })

  return (
    <div>
      <button
        onClick={() =>
          txn.drafting.sendMessage('Outline a blog post about red foxes')
        }
      >
        Generate outline
      </button>
      <p>Title: {txn.drafting.partial.title ?? '…'}</p>
      <ul>
        {txn.drafting.partial.sections?.map((section, i) => (
          <li key={i}>{section}</li>
        ))}
      </ul>
      {txn.drafting.final && (
        <pre>{JSON.stringify(txn.drafting.final, null, 2)}</pre>
      )}
    </div>
  )
}
```

`partial` and `final` only exist on the type when the callback declares `outputSchema` — omit it and the verb's surface has no such fields, exactly like `useChat` without `outputSchema`. See [Structured Outputs](../structured-outputs/overview) for the full story.

## Transforming one-shot results

Each one-shot verb's entry in the nested `verbs` option accepts an `onResult` transform. It runs on the raw backend result before it lands on `txn.<verb>.result`, and **its return type becomes that verb's `result` type**. Use it to reshape a result once, at the hook, instead of deriving it in every component that reads it:

```tsx
// components/CoverArt.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { generateImage } from '@tanstack/ai'
import { defineTransaction, verb } from '@tanstack/ai/transaction'
import { openaiImage } from '@tanstack/ai-openai'
import { z } from 'zod'

const coverTransaction = defineTransaction({
  heroImage: verb({
    input: z.object({ prompt: z.string() }),
    execute: ({ input }) =>
      generateImage({
        adapter: openaiImage('gpt-image-2'),
        prompt: input.prompt,
      }),
  }),
})

function CoverArt() {
  const txn = useTransaction(coverTransaction, {
    connection: fetchServerSentEvents('/api/cover'),
    verbs: {
      // `result` is the raw `ImageGenerationResult`; the return type flows
      // through to `txn.heroImage.result`.
      heroImage: { onResult: (result) => result.images[0]?.url ?? null },
    },
  })

  return (
    <div>
      <button onClick={() => txn.heroImage.run({ prompt: 'a red fox' })}>
        Generate
      </button>
      {/* `txn.heroImage.result` is now `string | null`, not the raw result */}
      {txn.heroImage.result && <img src={txn.heroImage.result} alt="" />}
    </div>
  )
}
```

Return `undefined` (or nothing) from `onResult` to keep the raw result. Each verb's entry also takes `forwardedProps` to merge extra fields into that verb's request body. The per-verb options are nested under `verbs` (rather than spread at the top level) so your verb names can never collide with `connection` / `id` / `threadId`.

## Which page do I read?

| You want to… | Read |
|---|---|
| Compose verbs server-side — one client call runs a whole pipeline as a single request with live progress and one abort scope | [Transactions](./transactions) |
| Give different pages or features their own verb sets, routes, and system prompts — and decide between user-driven verbs, server-composed transactions, and plain `useChat` | [Scenarios](./scenarios) |
| Understand the underlying chat surface (streaming, tools, message parts) | [Chat: Streaming](../chat/streaming) |
| Drive a single capability without a transaction endpoint | [Media & Generation Hooks](../media/generation-hooks) |
