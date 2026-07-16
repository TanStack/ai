import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  EventType,
  chat,
  generateImage,
  generateSpeech,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import {
  BLOG_STUDIO_SYSTEM_PROMPT,
  BlogPostSchema,
  forNarration,
  heroPromptFor,
} from './blog-studio'
import type {
  ImageGenerationResult,
  StreamChunk,
  TTSResult,
} from '@tanstack/ai'
import type { BlogPost } from './blog-studio'

// =============================================================================
// Blog Studio (server) — server-composed pipeline with SSE progress
// =============================================================================

export type BlogStudioStep = 'drafting' | 'heroImage' | 'narration'

/** CUSTOM event names emitted by `createBlogPostStreamFn`. */
export const BLOG_STUDIO_SERVER_EVENTS = {
  /** `{ step, status: 'started' | 'done' | 'error', result?, error? }` */
  STEP: 'pipeline:step',
  /** Final `{ post, hero, audio }` once every step has finished. */
  RESULT: 'pipeline:result',
} as const

export type BlogStudioStepEvent =
  | {
      step: BlogStudioStep
      status: 'started'
    }
  | {
      step: 'drafting'
      status: 'done'
      result: BlogPost
    }
  | {
      step: 'heroImage'
      status: 'done'
      result: ImageGenerationResult
    }
  | {
      step: 'narration'
      status: 'done'
      result: TTSResult
    }
  | {
      step: BlogStudioStep
      status: 'error'
      error: string
    }

export type BlogStudioResultEvent = {
  post: BlogPost
  hero: ImageGenerationResult
  audio: TTSResult
}

function pipelineCustom(name: string, value: unknown): StreamChunk {
  return {
    type: EventType.CUSTOM,
    name,
    value,
    timestamp: Date.now(),
  }
}

function stepEvent(value: BlogStudioStepEvent): StreamChunk {
  return pipelineCustom(BLOG_STUDIO_SERVER_EVENTS.STEP, value)
}

/**
 * Unbounded push channel so parallel steps can interleave progress events
 * into a single async iterable.
 */
function createEventChannel(): {
  push: (chunk: StreamChunk) => void
  close: () => void
  [Symbol.asyncIterator]: () => AsyncIterator<StreamChunk>
} {
  const queue: Array<StreamChunk> = []
  let notify: (() => void) | null = null
  let closed = false

  return {
    push(chunk) {
      if (closed) return
      queue.push(chunk)
      notify?.()
    },
    close() {
      closed = true
      notify?.()
    },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          for (;;) {
            const chunk = queue.shift()
            if (chunk !== undefined) return { value: chunk, done: false }
            if (closed) return { value: undefined, done: true }
            await new Promise<void>((resolve) => {
              notify = resolve
            })
            notify = null
          }
        },
      }
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

/**
 * One controller shared by the pipeline, provider calls, and the SSE
 * response body. Chains Start's request signal (client Stop / disconnect)
 * so abort propagates end to end.
 */
function linkAbortController(requestSignal: AbortSignal): AbortController {
  const abortController = new AbortController()
  if (requestSignal.aborted) {
    abortController.abort(requestSignal.reason)
  } else {
    requestSignal.addEventListener(
      'abort',
      () => abortController.abort(requestSignal.reason),
      { once: true },
    )
  }
  return abortController
}

/**
 * Server-side composition: draft → (hero ∥ narration).
 *
 * Streams:
 * - live structured-output chunks while drafting
 * - `pipeline:step` started/done/error for each step
 * - `pipeline:result` with the finished artifact
 *
 * Abort checks run only after `await` points — `signal.aborted` is live and
 * can flip while work is in flight; a check on a brand-new controller with
 * no await in between is always false.
 */
async function* createBlogPostPipeline(
  topic: string,
  abortController: AbortController,
): AsyncGenerator<StreamChunk> {
  const { signal } = abortController
  const runId = `blog-server-${Date.now()}`
  const threadId = 'blog-studio-server'

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }

  try {
    // ── 1. Draft (streamed structured output) ─────────────────────────────
    yield stepEvent({ step: 'drafting', status: 'started' })

    const draftStream = chat({
      adapter: openaiText('gpt-5.5'),
      messages: [
        { role: 'user', content: `Write a blog post about: ${topic}` },
      ],
      systemPrompts: [BLOG_STUDIO_SYSTEM_PROMPT],
      outputSchema: BlogPostSchema,
      stream: true,
      abortController,
    })

    let post: BlogPost | undefined
    for await (const chunk of draftStream) {
      // After each streamed chunk (async gap) — abort may have landed.
      throwIfAborted(signal)
      // Forward live draft chunks; skip nested run lifecycle so our outer
      // RUN_* stay authoritative for this server-fn response.
      if (
        chunk.type !== EventType.RUN_STARTED &&
        chunk.type !== EventType.RUN_FINISHED &&
        chunk.type !== EventType.RUN_ERROR
      ) {
        yield chunk
      }
      if (
        chunk.type === EventType.CUSTOM &&
        chunk.name === 'structured-output.complete'
      ) {
        const value = chunk.value
        // Prefer the validated object from the orchestrator; re-parse so a
        // malformed payload can't proceed as a half-typed draft.
        if (isRecord(value)) {
          const parsed = BlogPostSchema.safeParse(value.object)
          if (parsed.success) post = parsed.data
        }
      }
    }

    throwIfAborted(signal)

    if (!post) {
      const message = 'Drafting did not produce a structured blog post'
      yield stepEvent({ step: 'drafting', status: 'error', error: message })
      throw new Error(message)
    }

    yield stepEvent({ step: 'drafting', status: 'done', result: post })

    // ── 2. Hero + narration in parallel ───────────────────────────────────
    // Image/speech activities don't take AbortSignal; on abort we stop
    // consuming the channel and throw. Close the channel so `for await`
    // unblocks even if providers are still finishing.
    const channel = createEventChannel()
    const closeChannelOnAbort = () => channel.close()
    signal.addEventListener('abort', closeChannelOnAbort, { once: true })

    channel.push(stepEvent({ step: 'heroImage', status: 'started' }))
    channel.push(stepEvent({ step: 'narration', status: 'started' }))

    const work = Promise.all([
      generateImage({
        adapter: openaiImage('gpt-image-2'),
        prompt: heroPromptFor(post),
        size: '1536x1024',
      }).then(
        (hero) => {
          throwIfAborted(signal)
          channel.push(
            stepEvent({ step: 'heroImage', status: 'done', result: hero }),
          )
          return hero
        },
        (err: unknown) => {
          if (isAbortError(err) || signal.aborted) throw err
          const message =
            err instanceof Error ? err.message : 'Image generation failed'
          channel.push(
            stepEvent({ step: 'heroImage', status: 'error', error: message }),
          )
          throw err
        },
      ),
      generateSpeech({
        adapter: openaiSpeech('tts-1'),
        text: forNarration(post.body),
        voice: 'alloy',
      }).then(
        (audio) => {
          throwIfAborted(signal)
          channel.push(
            stepEvent({ step: 'narration', status: 'done', result: audio }),
          )
          return audio
        },
        (err: unknown) => {
          if (isAbortError(err) || signal.aborted) throw err
          const message =
            err instanceof Error ? err.message : 'Speech generation failed'
          channel.push(
            stepEvent({ step: 'narration', status: 'error', error: message }),
          )
          throw err
        },
      ),
    ]).finally(() => {
      signal.removeEventListener('abort', closeChannelOnAbort)
      channel.close()
    })

    for await (const chunk of channel) {
      throwIfAborted(signal)
      yield chunk
    }

    const [hero, audio] = await work
    throwIfAborted(signal)

    yield pipelineCustom(BLOG_STUDIO_SERVER_EVENTS.RESULT, {
      post,
      hero,
      audio,
    } satisfies BlogStudioResultEvent)

    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
      timestamp: Date.now(),
    }
  } catch (err) {
    if (signal.aborted || isAbortError(err)) {
      yield {
        type: EventType.RUN_ERROR,
        message: 'Aborted',
        timestamp: Date.now(),
      }
      return
    }
    const message = err instanceof Error ? err.message : 'Pipeline failed'
    yield {
      type: EventType.RUN_ERROR,
      message,
      timestamp: Date.now(),
    }
  }
}

/**
 * One server function: composes draft → (hero ∥ narration) and streams step
 * progress over SSE. Pair with a client that reads the Response body as SSE.
 *
 * Abort sources (merged into one controller):
 * - the HTTP request signal (`getRequest().signal` — client Stop / disconnect)
 * - SSE body cancel via `toServerSentEventsResponse({ abortController })`
 *
 * Note: Start 1.159 does not put `signal` on the handler ctx; client `signal`
 * is honored by aborting the underlying fetch/request, which trips
 * `getRequest().signal`.
 */
export const createBlogPostStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ topic: z.string().min(1) }))
  .handler(({ data }) => {
    const abortController = linkAbortController(getRequest().signal)
    return toServerSentEventsResponse(
      createBlogPostPipeline(data.topic, abortController),
      { abortController },
    )
  })

/** One-shot regenerate — same models as the pipeline, no streaming. */
export const regenerateBlogHeroFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ prompt: z.string().min(1) }))
  .handler(({ data }) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: data.prompt,
      size: '1536x1024',
    }),
  )

export const regenerateBlogNarrationFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ text: z.string().min(1) }))
  .handler(({ data }) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: data.text,
      voice: 'alloy',
    }),
  )
