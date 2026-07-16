---
title: Orchestration
id: plugin-orchestration
order: 2
description: "Sequence plugins into a pipeline from the client: draft a post, then — in parallel — illustrate and narrate it, each derived from the finished draft. One endpoint, one typed client, orchestrated in the browser with plain `await` and `Promise.all`. Each step drives its own reactive surface; each can be retried, cancelled, or re-run on its own."
keywords:
  - tanstack ai
  - plugin
  - orchestration
  - pipeline
  - definePlugin
  - usePlugin
  - client-side
  - Promise.all
---

**A plugin endpoint hands you one typed client with an independent surface per plugin — so a multi-step pipeline is orchestrated on the _client_, with plain `await` and `Promise.all`.** The client calls each plugin, awaits its result, and feeds it into the next step. There is no server-side composition: each plugin is its own request, so each can be retried, cancelled, or re-run on its own, and the UI fills in as each step finishes.

> **Server-side composition is coming.** A future `workflowPlugin` will let one client call run a whole pipeline as a *single* server request — one abort scope, intermediate values that never round-trip through the browser, live sub-run progress. Until then, orchestrate on the client as shown below; it's the right default for most pipelines anyway, because every step stays independently retryable.

## The worked example: a blog studio

One submission turns a topic into a finished post: draft the article as a typed object, then — in parallel — generate a hero image and record a voice-over, both derived from the validated draft. This is the [`blog-studio` example](https://github.com/TanStack/ai/blob/main/examples/ts-react-chat/src/routes/blog-studio.tsx) from the repository, condensed.

### Server: three independent plugins behind one endpoint

```ts group=orchestration
// lib/blog-studio.ts
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
  body: z.string().describe('The full post as Markdown'),
})

export const blogPlugin = definePlugin({
  // Conversational plugin: writes the post as a typed object
  // (structured output + streaming). `sendMessage` resolves to the validated
  // `BlogPost`, so the client can derive the next steps' inputs from it.
  drafting: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      systemPrompts: ['You are a seasoned staff writer.'],
      outputSchema: BlogPostSchema,
      stream: true,
      threadId: req.threadId,
      runId: req.runId,
    }),
  ),

  // One-shot media plugin: a landscape hero image from a prompt.
  heroImage: imagePlugin((req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.input.prompt,
      size: '1536x1024',
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

```ts group=orchestration
// routes/api.blog-studio.ts
export const POST = (request: Request) => blogPlugin.handler(request)
```

### Client: draft, then illustrate and narrate in parallel

The page imports the `blogPlugin` value directly and sequences the steps itself. `drafting.sendMessage(...)` resolves to the validated `BlogPost` (because the callback declared `outputSchema`), so the hero-image prompt and the narration text are derived from the finished draft. The two media plugins then run in parallel:

```tsx group=orchestration-client
// routes/blog-studio.tsx
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import {
  chatPlugin,
  definePlugin,
  imagePlugin,
  speechPlugin,
} from '@tanstack/ai-plugin-toolkit'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { z } from 'zod'

const BlogPostSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  body: z.string(),
})

// The same definition your server route exports — share it from one module in
// a real app; repeated here so this snippet type-checks on its own.
const blogPlugin = definePlugin({
  drafting: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: BlogPostSchema,
      stream: true,
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

function BlogStudio() {
  const plugin = usePlugin(blogPlugin, {
    connection: fetchServerSentEvents('/api/blog-studio'),
  })
  const { drafting, heroImage, narration } = plugin

  // Client-side orchestration: draft the post, then illustrate and narrate in
  // parallel — both derived from the completed draft.
  async function orchestrate(topic: string) {
    drafting.clear()
    heroImage.reset()
    narration.reset()

    const draft = await drafting.sendMessage(`Write a blog post about: ${topic}`)
    if (!draft) return // drafting failed or was stopped before completing

    await Promise.all([
      heroImage.run({
        prompt: `Editorial hero image for "${draft.title}". ${draft.subtitle}.`,
      }),
      narration.run({ text: draft.body }),
    ])
  }

  const isRunning = drafting.isLoading || heroImage.isLoading || narration.isLoading

  return (
    <div>
      <button disabled={isRunning} onClick={() => void orchestrate('urban foxes')}>
        Write the post
      </button>
      {isRunning && (
        <button
          onClick={() => {
            drafting.stop()
            heroImage.stop()
            narration.stop()
          }}
        >
          Stop
        </button>
      )}

      {/* Each step drives its own reactive surface — the UI fills in as work
          finishes, no shared pipeline state to thread through. */}
      <ol>
        <li>Writing: {drafting.isLoading ? 'active' : drafting.final ? 'done' : 'pending'}</li>
        <li>Illustrating: {heroImage.isLoading ? 'active' : heroImage.result ? 'done' : 'pending'}</li>
        <li>Recording voice-over: {narration.isLoading ? 'active' : narration.result ? 'done' : 'pending'}</li>
      </ol>

      {drafting.final && (
        <article>
          <h1>{drafting.final.title}</h1>
          <p>{drafting.final.subtitle}</p>
          {heroImage.result?.images[0]?.url && (
            <img src={heroImage.result.images[0].url} alt="" />
          )}
        </article>
      )}
    </div>
  )
}
```

`drafting.final` is typed as `BlogPost | null` — inferred from the callback's `outputSchema`, nothing re-declared on the client. `heroImage.result` is typed as `ImageGenerationResult | null`, from `imagePlugin`'s result contract. The `await drafting.sendMessage(...)` return value is the same validated `BlogPost`, so `draft.title` / `draft.body` are fully typed when you build the next steps' inputs.

## Each step is independent

Because there is no server-side pipeline, the three plugins are genuinely independent surfaces. That's the whole point of client-side orchestration:

- **Retry a single step.** If narration fails but the draft and image are fine, call `narration.run(...)` again — the other steps keep their results. Nothing re-runs that you didn't ask to.
- **Re-run on demand.** The same plugins the pipeline used can be driven directly by the user. A "Regenerate hero image" button is just `heroImage.run({ prompt })` again with a prompt derived from the current post — same endpoint, same types, no second definition.
- **Reorder or skip.** The client decides the sequence. Draft-then-illustrate, illustrate-then-draft, or draft-only — it's ordinary control flow.

## Cancellation

Each surface has its own `stop()` (see the "Stop" button in the example above, which calls `drafting.stop()`, `heroImage.stop()`, and `narration.stop()` together). Because each step is its own request, cancelling is per-step — abort the drafting stream, or the image run, or all of them at once.

Server-side, each plugin's `execute` / chat callback receives the request's `AbortSignal` (as `req.signal`). Pass it into the activities you run so a client `stop()` aborts the upstream provider call too, rather than orphaning it:

```ts
import { chat } from '@tanstack/ai'
import { generationPlugin } from '@tanstack/ai-plugin-toolkit'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const tagline = generationPlugin({
  input: z.object({ product: z.string() }),
  execute: async (req) => {
    // `chat()` takes an AbortController; chain it off the request signal so a
    // client disconnect / stop() aborts this provider call mid-flight.
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

## Error behavior

Client-side orchestration means failures are **per step**, and you decide how to compose them:

- A failed step sets that plugin's `.error` and leaves its `.result` at `null`; the other steps keep their results. The UI can show exactly which step failed and offer a retry for just that one.
- Because you write the sequence, "fail the whole thing" vs. "best-effort" is your choice. `await drafting.sendMessage(...)` resolving to `null` (failed / stopped) is a natural place to bail before the parallel media steps — the example returns early. Wrap an individual `run` in `try`/`catch` to make it best-effort instead.
- Top-level input to a generation plugin is validated against its schema **before** `execute` runs — a mismatch is a `400` with the validation issues, and the callback never sees a malformed input.

## Next

- [Plugin Overview](./overview) — the plugin kinds, client typing, tools, and structured output.
- [Scenarios](./scenarios) — one definition per product surface, and choosing between a plugin endpoint, client orchestration, and plain `useChat`.
