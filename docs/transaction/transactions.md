---
title: Transactions
id: transaction-transactions
order: 2
description: "Compose verbs server-side with ctx.call: one client call runs a whole pipeline — draft a post, illustrate it, narrate it — as a SINGLE request, with every step streamed back live as a sub-run and one abort scope covering the lot. Learn the sub-run protocol, cancellation semantics, and error behavior."
keywords:
  - tanstack ai
  - transaction
  - ctx.call
  - sub-runs
  - defineTransaction
  - clientTransaction
  - useTransaction
  - abort
  - cancellation
---

**A transaction is a one-shot verb that composes its sibling verbs server-side.** Its `execute` receives a context `ctx`, and `ctx.call(siblingVerb, input)` runs that sibling *inside the same request* — the sub-run's stream is forwarded live to the client as tagged events, and the `await` resolves with the sibling's result for the next step to consume. One client call, one HTTP request, one abort scope for the entire pipeline.

This is the closest thing to transactional semantics this domain allows: you can't roll back tokens a model already generated, but you *can* treat the pipeline as a single unit of work — one call starts it, live progress streams out of it, cancelling it halts the orchestration and aborts the in-flight provider work, and the UI unwinds its partial state.

## The worked example: a blog studio

One click turns a topic into a finished post: draft the article as a typed object, then — in parallel — generate a hero image and record a voice-over, both derived from the validated draft. This is the [`blog-studio` example](https://github.com/TanStack/ai/blob/main/examples/ts-react-chat/src/routes/blog-studio.tsx) from the repository, condensed.

### Server: a `blogPost` verb that composes its siblings

```ts
// api/blog-studio.ts
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

export const BlogPostSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  body: z.string().describe('The full post as Markdown'),
})

// Conversational verb: writes the post as a typed object
// (structured output + streaming).
const drafting = chatVerb((req) =>
  chat({
    adapter: openaiText('gpt-5.5'),
    messages: req.messages,
    systemPrompts: ['You are a seasoned staff writer.'],
    outputSchema: BlogPostSchema,
    stream: true,
    threadId: req.threadId,
    runId: req.runId,
  }),
)

// One-shot verb: a hero image from a prompt.
const heroImage = verb({
  input: z.object({ prompt: z.string() }),
  execute: ({ input }) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: input.prompt,
      size: '1536x1024',
    }),
})

// One-shot verb: narrate a piece of text.
const narration = verb({
  input: z.object({ text: z.string() }),
  execute: ({ input }) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: input.text,
      voice: 'alloy',
    }),
})

// The transaction: one client call composes the three verbs above,
// entirely server-side.
const blogPost = verb({
  input: z.object({ topic: z.string() }),
  execute: async ({ input }, ctx) => {
    // 1. Draft the post. `ctx.call` on a chat verb resolves with the
    //    accumulated text and the structured output; re-validate it so a
    //    half-finished draft fails the run with a clear error.
    const draft = await ctx.call(drafting, [
      { role: 'user', content: `Write a blog post about: ${input.topic}` },
    ])
    const parsed = BlogPostSchema.safeParse(draft.structured)
    if (!parsed.success) {
      throw new Error(
        `Drafting did not produce a valid blog post: ${parsed.error.message}`,
      )
    }
    const post = parsed.data

    // 2. Illustrate and narrate in parallel, both derived from the
    //    validated draft.
    const [hero, audio] = await Promise.all([
      ctx.call(heroImage, {
        prompt: `Editorial hero image for "${post.title}". ${post.subtitle}.`,
      }),
      ctx.call(narration, { text: post.body }),
    ])

    // 3. The return value becomes the run's final result on the client
    //    (`txn.blogPost.result`).
    return { post, hero, audio }
  },
})

export const blogTransaction = defineTransaction({
  drafting,
  heroImage,
  narration,
  blogPost,
})

export const POST = (request: Request) => blogTransaction.handler(request)
```

`ctx.call` has two shapes, both typed end to end:

- **`ctx.call(oneShotVerb, input)`** validates `input` against the sibling's schema, runs its `execute`, and resolves with its result — typed as that verb's result type.
- **`ctx.call(chatVerbObj, messages)`** runs the chat verb's callback to completion server-side and resolves with `{ text, structured }` — the accumulated assistant text plus the structured output when the callback declared an `outputSchema`. `structured` arrives as `unknown`; re-validate it with `safeParse` (as above) rather than trusting the shape.

### Client: one call, live progress, typed result

```tsx
// components/BlogStudio.tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { clientTransaction } from '@tanstack/ai/transaction'
import type { blogTransaction } from './api/blog-studio'

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

  const { blogPost } = txn
  // One entry per `ctx.call` the server made, keyed by verb name.
  const draftingRun = blogPost.subRuns.find((run) => run.verb === 'drafting')
  const heroRun = blogPost.subRuns.find((run) => run.verb === 'heroImage')
  const narrationRun = blogPost.subRuns.find((run) => run.verb === 'narration')

  return (
    <div>
      <button
        disabled={blogPost.isLoading}
        onClick={() => {
          // ONE call. The server composes drafting → (illustrate ∥ narrate)
          // and streams every sub-run live into `blogPost.subRuns`; the final
          // `{ post, hero, audio }` lands in `blogPost.result`.
          void blogPost.run({ topic: 'The quiet comeback of urban foxes' })
        }}
      >
        Write the post
      </button>
      {blogPost.isLoading && (
        <button onClick={() => blogPost.stop()}>Stop</button>
      )}

      <ol>
        <li>Writing: {draftingRun?.status ?? 'pending'}</li>
        <li>Illustrating: {heroRun?.status ?? 'pending'}</li>
        <li>Recording voice-over: {narrationRun?.status ?? 'pending'}</li>
      </ol>

      {blogPost.result && (
        <article>
          <h1>{blogPost.result.post.title}</h1>
          <p>{blogPost.result.post.subtitle}</p>
        </article>
      )}
      {blogPost.error && <p>{blogPost.error.message}</p>}
    </div>
  )
}
```

`blogPost.result` is typed as `{ post, hero, audio } | null` — inferred from `execute`'s return type on the server definition, nothing re-declared on the client. (If your route builds the definition inside the handler, mirror it client-side as described in [Sharing the definition with the client](./overview#sharing-the-definition-with-the-client) — the mirrored bodies never execute in the browser.)

And because `heroImage` and `narration` are ordinary declared verbs, the *same* client can also drive them directly — `txn.heroImage.run({ prompt })` for a "regenerate hero image" button — without another endpoint or another definition. Server-composed and user-driven are two ways to call the same verbs.

## Watching sub-runs live

Everything a transaction does streams back over the single SSE response. Each `ctx.call` is wrapped in tagged `CUSTOM` events (the names live on `TRANSACTION_EVENTS`, exported from `@tanstack/ai/transaction`):

| Event | When |
|---|---|
| `transaction:sub-run:started` | A `ctx.call` began; carries `{ runId, parentRunId, verb, index }` |
| `transaction:sub-run:chunk` | A chunk of the sub-run's own stream, forwarded live |
| `transaction:sub-run:result` | The sub-run completed; carries its `result` |
| `transaction:sub-run:error` | The sub-run threw; carries its `message` |

You rarely touch these directly — the client demultiplexes them into `txn.<verb>.subRuns`, an array of live sub-run states in server start order:

```ts
interface TransactionSubRun {
  runId: string
  verb: string // the sub-verb's name in the definition
  index: number // 0-based server start order
  status: 'running' | 'success' | 'error'
  result: unknown // set once the sub-run completes
  text: string // accumulated streamed text, for chat-verb sub-runs
  error?: string
}
```

For chat-verb sub-runs, `text` accumulates the streamed assistant text as it arrives — a live word count or progress indicator falls out for free. One caveat from the worked example: when the chat callback declares an `outputSchema`, the streamed text is the structured output's partial JSON, so show progress by length (`${run.text.length} chars drafted`) rather than rendering it verbatim. The array resets when a new run starts, and `subRuns` is empty for verbs that don't compose siblings.

The verb's own return value travels as a terminal `generation:result` event and lands in `txn.<verb>.result` — the same place it lands for a simple, non-composing verb.

## One request, one abort scope

Because the entire pipeline is a single HTTP request, cancellation is one gesture end to end:

- **Client:** `txn.blogPost.stop()` aborts the fetch. The reactive surfaces unwind — `isLoading` drops, in-flight sub-runs stop updating.
- **Server:** the aborted request trips `req.signal` (also available as `ctx.signal` — both are the request's `AbortSignal`). `ctx.call` refuses to start new sub-runs once the signal is aborted, and chat sub-runs stop consuming their stream.
- **Providers:** pass the signal into the activities your verbs run so the upstream provider calls are cancelled too, not just orphaned:

```ts
import { chat } from '@tanstack/ai'
import { verb } from '@tanstack/ai/transaction'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const tagline = verb({
  input: z.object({ product: z.string() }),
  execute: async (req) => {
    // `chat()` takes an AbortController; chain it off the request signal so
    // a client disconnect / stop() aborts this provider call mid-flight.
    const abortController = new AbortController()
    req.signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
    const text = await chat({
      adapter: openaiText('gpt-5.5'),
      messages: [
        { role: 'user', content: `Write a tagline for ${req.input.product}` },
      ],
      stream: false,
      abortController,
    })
    return { tagline: text }
  },
})
```

The same applies inside a composing verb: `ctx.signal` is the one signal for the whole transaction, so every provider call at any depth hangs off the same scope. Cancel once, and the orchestration halts, in-flight sub-work aborts, and nothing keeps burning tokens in the background.

## Error behavior

A transaction fails as a unit:

- If a sub-run throws (or a `ctx.call` input fails its sibling's schema validation), the server emits `transaction:sub-run:error` for that sub-run and the error propagates out of `ctx.call` into your `execute` — unless you catch it. An uncaught error fails the whole run: the stream terminates with a `RUN_ERROR` event instead of `RUN_FINISHED`.
- On the client, the failed step shows up in `subRuns` with `status: 'error'` and its `error` message, `txn.<verb>.error` is set, and `txn.<verb>.result` stays `null`. Completed sub-runs keep their `success` status, so the UI can show exactly which step failed.
- Want a step to be best-effort instead? Wrap that `ctx.call` in `try`/`catch` inside `execute` and return a partial result — the run then finishes normally. The example above deliberately does *not* do this: a post without its image is a failed post.
- Validation failures of the *top-level* input (the object passed to `txn.<verb>.run(...)`) never reach `execute` at all — the handler responds `400` with the schema issues.

## Next

- [Transaction Overview](./overview) — the two verb kinds, client typing, tools, and structured output.
- [Scenarios](./scenarios) — one definition per product surface, and choosing between user-driven verbs, server-composed transactions, and plain `useChat`.
