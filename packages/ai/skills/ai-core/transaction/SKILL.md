---
name: ai-core/transaction
description: >
  App-defined verb composition and server-composed transactions:
  defineTransaction() registers app-named verbs — chatVerb(callback) for
  conversational surfaces, verb({ input, execute }) for one-shot
  schema-validated work — behind one handler; useTransaction() consumes all
  declared verbs from a single client hook with no generics, types inferred
  from the server definition. A one-shot verb's execute can compose sibling
  verbs via ctx.call as live-streamed sub-runs of the same single request,
  with one abort scope.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:packages/ai/src/activities/transaction/index.ts'
  - 'TanStack/ai:packages/ai/src/activities/transaction/types.ts'
  - 'TanStack/ai:packages/ai-client/src/transaction-client.ts'
  - 'TanStack/ai:packages/ai-client/src/transaction-types.ts'
  - 'TanStack/ai:packages/ai-react/src/use-transaction.ts'
---

# Transaction

This skill builds on ai-core, ai-core/chat-experience, and
ai-core/media-generation. Read them first.

`defineTransaction` + `useTransaction` are a **composition layer**, not a new
activity or wire format. They wire together activities you already know
(`chat()`, `generateImage()`, `generateSpeech()`, …) behind one server
endpoint and one client hook, keyed by **app-named verbs** — `drafting`,
`heroImage`, `narration`, `blogPost` — not a fixed set of library nouns.
There are two verb kinds:

- `chatVerb(callback)` — conversational: message history in, streamed chat
  out. Client surface = the full `useChat` return. A definition may declare
  several chat verbs (e.g. `primaryChat` + `summaryChat`).
- `verb({ input, execute })` — one-shot: Standard-Schema-validated input in,
  typed result out. Client surface = `run(input)` / `result` /
  `isLoading` / `error` / `status` / `stop` / `reset` / `subRuns`.

A one-shot verb's `execute` receives `(req, ctx)`; `ctx.call(sibling, input)`
runs a sibling verb **inside the same request** as a live-streamed sub-run —
a server-composed **transaction** with one abort scope.

## Setup — Chat + Image + Composing Verb End-to-End

### Server: `defineTransaction` + a single `handler`

The definition is **inert** — `defineTransaction` only stores the verbs and
their names/kinds. It constructs nothing (no adapters, no connections) until
a request actually reaches `handler`, so it's safe to import into an
isomorphic module shared with the client.

```typescript
// src/lib/blog-transaction.ts — shared/isomorphic module
import { chat, generateImage } from '@tanstack/ai'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { openaiText, openaiImage } from '@tanstack/ai-openai/adapters'
import { z } from 'zod'
import { BlogPostSchema } from './schemas'

const drafting = chatVerb((req) =>
  chat({
    adapter: openaiText('gpt-5.5'),
    messages: req.messages,
    outputSchema: BlogPostSchema, // → typed structured output
    stream: true,
    threadId: req.threadId,
    runId: req.runId,
  }),
)

const heroImage = verb({
  input: z.object({ prompt: z.string() }), // validated at runtime, 400 + issues on mismatch
  execute: ({ input }) =>
    generateImage({ adapter: openaiImage('gpt-image-2'), prompt: input.prompt }),
})

// A transaction: composes the siblings above server-side via ctx.call.
const blogPost = verb({
  input: z.object({ topic: z.string() }),
  execute: async ({ input }, ctx) => {
    // ctx.call on a chat verb → { text, structured }; re-validate structured.
    const draft = await ctx.call(drafting, [
      { role: 'user', content: `Write a blog post about: ${input.topic}` },
    ])
    const parsed = BlogPostSchema.safeParse(draft.structured)
    if (!parsed.success) throw new Error('invalid draft')
    // ctx.call on a one-shot verb → its typed result.
    const hero = await ctx.call(heroImage, {
      prompt: `Hero image for "${parsed.data.title}"`,
    })
    return { post: parsed.data, hero } // → txn.blogPost.result on the client
  },
})

export const blogTransaction = defineTransaction({
  drafting,
  heroImage,
  blogPost,
})
```

```typescript
// src/routes/api.blog-studio.ts — server route, single handler
import { createFileRoute } from '@tanstack/react-router'
import { blogTransaction } from '../lib/blog-transaction'

export const Route = createFileRoute('/api/blog-studio')({
  server: {
    handlers: {
      POST: ({ request }) => blogTransaction.handler(request),
    },
  },
})
```

`handler` is the **only** thing the route needs to call. Internally it
routes by a `verb` discriminator carried in the request's `forwardedProps`:
chat verbs dispatch to the AG-UI `RunAgentInput` parsing path (same as a
standalone chat route); one-shot verbs get their forwarded props validated
against the verb's `input` schema (`400` with the validation issues on
failure) before `execute` runs. Unknown or undeclared verbs get a `400`
before any callback runs.

### Client: `useTransaction`

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { blogTransaction } from '../lib/blog-transaction'

function BlogStudio() {
  const txn = useTransaction(blogTransaction, {
    connection: fetchServerSentEvents('/api/blog-studio'),
  })

  return (
    <div>
      <div>
        {txn.drafting.messages.map((message) => (
          <div key={message.id}>{message.role}</div>
        ))}
      </div>
      <button onClick={() => txn.drafting.sendMessage('Pitch me a topic')}>
        Ask
      </button>

      {/* ONE request runs the whole pipeline; sub-runs stream back live. */}
      <button
        onClick={() => void txn.blogPost.run({ topic: 'urban foxes' })}
        disabled={txn.blogPost.isLoading}
      >
        {txn.blogPost.isLoading ? 'Working…' : 'Write the post'}
      </button>
      {txn.blogPost.isLoading && (
        <button onClick={() => txn.blogPost.stop()}>Stop</button>
      )}
      <ol>
        {txn.blogPost.subRuns.map((run) => (
          <li key={run.runId}>
            {run.verb}: {run.status}
          </li>
        ))}
      </ol>
      {txn.blogPost.result && <h1>{txn.blogPost.result.post.title}</h1>}
    </div>
  )
}
```

`txn` is typed from the definition value passed in — **no generics** at the
call site (inference rides the definition's `'~verbs'` phantom type). Only
declared verbs appear on `txn`; referencing an undeclared key is a compile
error. A chat verb's surface is the full `useChat` return (`messages`,
`sendMessage`, `isLoading`, `error`, `status`, `stop`, `clear`,
`addToolResult`, `addToolApprovalResponse`, …, plus `partial`/`final` when
the callback declared `outputSchema`); a one-shot verb's surface is
`run(input)` (input typed by the verb's schema; resolves with the result or
`null`), `result`, `isLoading`, `error`, `status`, `stop`, `reset`, and
`subRuns`.

Vue/Solid have identical patterns with different hook imports
(e.g. `import { useTransaction } from '@tanstack/ai-solid/transaction'`);
Svelte exports `createTransaction` from `@tanstack/ai-svelte/transaction`.

## Core Patterns

### 1. Server-composed transactions: `ctx.call` + live `subRuns`

Inside a one-shot verb's `execute`, `ctx.call(sibling, input)` runs a sibling
verb as a tagged sub-run of the **same request**:

- `ctx.call(oneShotVerb, input)` → validates input against the sibling's
  schema, resolves with its typed result.
- `ctx.call(chatVerbObj, messagesArray)` → runs the chat callback to
  completion server-side, resolves with `{ text, structured }` (`structured`
  is `unknown` — re-validate with `safeParse`).

Every sub-run streams to the client live as `transaction:sub-run:*` CUSTOM
events (names on `TRANSACTION_EVENTS` from `@tanstack/ai/transaction`:
`SUB_RUN_STARTED` / `SUB_RUN_CHUNK` / `SUB_RUN_RESULT` / `SUB_RUN_ERROR`).
The client demultiplexes them into `txn.<verb>.subRuns`:
`{ runId, verb, index, status: 'running' | 'success' | 'error', result,
text, error? }` in server start order, reset on each new run. For chat
sub-runs `text` accumulates the streamed text — note that with an
`outputSchema` it's partial JSON, so show progress by length, don't render
it. `Promise.all` over multiple `ctx.call`s runs sub-work in parallel.

### 2. One request, one abort scope

`txn.<verb>.stop()` aborts the single fetch. Server-side, `req.signal`
(=== `ctx.signal`, the request's `AbortSignal`) trips: `ctx.call` refuses
new sub-runs and chat sub-runs stop draining. Chain the signal into
activities so provider work is cancelled too — `chat()` takes an
`abortController`, so hang one off the request signal:

```typescript
const narrate = verb({
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

Error semantics: a throwing sub-run emits `transaction:sub-run:error` and
rejects that `ctx.call`; uncaught, the run terminates with `RUN_ERROR`
(client: `txn.<verb>.error` set, `result` stays `null`, failed step marked
`status: 'error'` in `subRuns`, completed steps keep `'success'`). Catch a
`ctx.call` rejection inside `execute` to make a step best-effort.

### 3. Chat tools auto-type from the server callback; per-verb `tools` is only for client-executed runtime

Tools passed to `chat({ tools: [...] })` inside a chat verb's callback
automatically type that verb's `messages` tool-call/result parts — with
**no** client-side re-declaration needed for typing. Per-verb client options
are nested under `verbs` (so verb names can't collide with
`connection`/`id`/`threadId`):

```typescript
const txn = useTransaction(blogTransaction, {
  connection: fetchServerSentEvents('/api/blog-studio'),
  verbs: {
    // runtime only for client-executed (.client()) tools — types already
    // came from the server callback
    drafting: { tools: [showToast] },
  },
})
```

Each **one-shot** verb's entry accepts `{ onResult, forwardedProps }`:
`onResult` runs on the raw backend result and its return type becomes
`txn.<verb>.result`'s type (return nothing to keep the raw result); chat
verb entries accept `{ tools, forwardedProps }`.

```typescript
const txn = useTransaction(blogTransaction, {
  connection: fetchServerSentEvents('/api/blog-studio'),
  verbs: {
    heroImage: { onResult: (result) => result.images[0]?.url ?? null },
  },
})

txn.heroImage.result // string | null — the transform's return type
```

### 4. Structured output via `outputSchema` in a chat verb's callback

If a chat verb's callback passes `outputSchema` to `chat()`, that verb's
surface picks up typed `partial` (progressive `DeepPartial`) and `final`
(validated terminal object), and `sendMessage` resolves to the validated
final (or `null`) instead of the messages array. Omit `outputSchema` and
neither field is present on the type — same conditional shape as
`useChat({ outputSchema })`.

### 5. Client needs the definition's TYPE — use `clientTransaction`

`useTransaction` reads verb names/kinds at runtime and everything else at
the type level. Define the transaction on the server, export it (or export
a `ReturnType<typeof createTransaction>` type when the definition is built
per-request), then bind it on the client with `clientTransaction`:

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

The generic is supplied via `import type` — erased from the bundle — so
provider SDKs never ship to the browser. The kinds map is checked
exhaustively against the server definition. When the definition truly has
no provider imports, a shared isomorphic `defineTransaction` module also
works (see `examples/ts-react-chat` blog-studio routes).

### 6. Only declared verbs are constructed; one shared connection

`defineTransaction({ drafting, heroImage })` produces a client with exactly
`txn.drafting` and `txn.heroImage`. All verbs share the single `connection`
passed to `useTransaction` — one endpoint, one adapter. Each underlying
sub-client (a `ChatClient` per chat verb, a `GenerationClient` per one-shot
verb) tags its own requests with the verb name so the single `handler` can
route.

## Common Mistakes

### a. HIGH: Writing a custom handler that branches on verb manually

```typescript
// WRONG — reimplementing what `handler` already does
export const POST = async (request: Request) => {
  const body = await request.json()
  if (body.forwardedProps.verb === 'drafting') {
    return toServerSentEventsResponse(chat({ adapter, messages: body.messages }))
  }
  // ...manual branching for every verb
}

// CORRECT — defineTransaction's handler already parses, validates, routes,
// and serializes
export const POST = (request: Request) => blogTransaction.handler(request)
```

### b. HIGH: Passing `model` or generation options to `useTransaction`

There is no `model`/`prompt` option on `useTransaction`. Model choice and
generation parameters belong inside the server verbs
(`openaiImage('gpt-image-2')`, …). Besides `connection`, the client options
are `id`/`threadId` and the nested `verbs` map: chat verbs take
`{ tools, forwardedProps }`, one-shot verbs `{ onResult, forwardedProps }`.

```typescript
// WRONG — no model/prompt options, and per-verb options are not top-level
useTransaction(blogTransaction, { connection, model: 'gpt-5.5' })

// CORRECT
useTransaction(blogTransaction, {
  connection: fetchServerSentEvents('/api/blog-studio'),
  verbs: { heroImage: { onResult: (r) => r.images[0]?.url ?? null } },
})
```

### c. HIGH: Trusting `ctx.call(chatVerb, ...)`'s `structured` without re-validating

`structured` is `unknown` (the callback's schema validated the stream, but a
stopped/failed generation can leave it `null` or partial). Always
`safeParse` it and throw on failure so the transaction fails with a clear
`RUN_ERROR` instead of returning a half-built result.

### d. MEDIUM: Client-side orchestration when the pipeline should be one request

```typescript
// WORKS, but: N requests, N abort scopes, intermediate values round-trip
// through the browser
const draft = await txn.drafting.sendMessage(topic)
await txn.heroImage.run({ prompt: draft.title })

// TRANSACTIONAL — declare a composing verb; ONE request, live subRuns, one
// stop() for the whole pipeline
await txn.blogPost.run({ topic })
```

Client-side chaining is right when the *user* drives each step (regenerate
buttons, editable intermediate state). Server-side `ctx.call` is right when
one gesture should produce the finished artifact or fail as a unit.

### e. MEDIUM: Forgetting to propagate `req.signal` into provider calls

`stop()` aborts the fetch and halts orchestration, but a provider call not
chained to `req.signal` (e.g. via `chat()`'s `abortController`) keeps
burning tokens server-side until it completes. Thread the signal into every
activity a verb runs.

## Cross-References

- See also: **ai-core/chat-experience/SKILL.md** -- a chat verb's surface is
  the same `useChat` surface; streaming, tool rendering, and multimodal
  messages all apply unchanged.
- See also: **ai-core/media-generation/SKILL.md** -- one-shot verbs
  typically wrap the generation activities documented there
  (`generateImage`, `generateSpeech`, …).
- See also: **ai-core/tool-calling/SKILL.md** -- Tools passed to a chat
  verb's callback follow the same server/client tool patterns as a
  standalone `chat()` route.
- See also: **ai-core/custom-backend-integration/SKILL.md** -- The shared
  `connection` passed to `useTransaction` is the same
  `ConnectConnectionAdapter` used by `useChat` / `useGenerate*`.
