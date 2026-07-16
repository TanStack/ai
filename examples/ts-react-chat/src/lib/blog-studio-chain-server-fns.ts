import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  chain,
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
import type { InferChainOutput } from '@tanstack/ai'

// =============================================================================
// Blog Studio (chain) — the same draft → (hero ∥ narration) pipeline as
// `blog-studio-server-fns.ts`, composed with `chain()` instead of a
// hand-rolled generator. The chain runtime owns everything that file wires by
// hand: the run lifecycle, per-step `chain:step` progress events, live draft
// deltas, parallel interleaving, and abort propagation.
// =============================================================================

export const blogStudioChain = chain<{ topic: string }>()
  .step('draft', ({ topic }, ctx) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: [
        { role: 'user', content: `Write a blog post about: ${topic}` },
      ],
      systemPrompts: [BLOG_STUDIO_SYSTEM_PROMPT],
      outputSchema: BlogPostSchema,
      stream: true,
      abortController: ctx.abortController,
    }),
  )
  .parallel('media', {
    // Pass the draft through: a chain's final output is its last step's
    // output, so carrying `post` as a branch keeps it in the result
    // alongside the generated media.
    post: (post) => post,
    hero: (post) =>
      generateImage({
        adapter: openaiImage('gpt-image-2'),
        prompt: heroPromptFor(post),
        size: '1536x1024',
      }),
    narration: (post) =>
      generateSpeech({
        adapter: openaiSpeech('tts-1'),
        text: forNarration(post.body),
        voice: 'alloy',
      }),
  })

/** `{ post, hero, narration }` — the chain's `generation:result` payload,
 *  inferred from the chain itself so client narrowing stays honest. */
export type BlogStudioChainResult = InferChainOutput<typeof blogStudioChain>

/**
 * One controller shared by the chain, provider calls, and the SSE response
 * body. Chains Start's request signal (client Stop / disconnect) so abort
 * propagates end to end.
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
 * One server function: runs the chain and streams it back as a single
 * activity (RUN_STARTED, `chain:step` progress, live draft deltas,
 * `generation:result`, RUN_FINISHED). Pair with a client that reads the
 * Response body as SSE.
 */
export const createBlogPostChainFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ topic: z.string().min(1) }))
  .handler(({ data }) => {
    const abortController = linkAbortController(getRequest().signal)
    return toServerSentEventsResponse(
      blogStudioChain.stream({ topic: data.topic }, { abortController }),
      { abortController },
    )
  })
