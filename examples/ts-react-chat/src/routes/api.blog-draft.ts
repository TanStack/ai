import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { BLOG_STUDIO_SYSTEM_PROMPT, BlogPostSchema } from '../lib/blog-studio'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Draft-only endpoint for the hooks-based Blog Studio. Returns a streaming
 * structured-output chat so `useChat({ outputSchema })` can drive the client
 * draft step before image/speech fan-out.
 */
export const Route = createFileRoute('/api/blog-draft')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Attach the listener first, then re-check aborted so a race between
        // an early check and addEventListener can't drop the abort.
        const abortController = new AbortController()
        const onAbort = () => abortController.abort()
        request.signal.addEventListener('abort', onAbort, { once: true })
        if (request.signal.aborted) {
          onAbort()
          return new Response(null, { status: 499 })
        }

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        try {
          const stream = chat({
            adapter: openaiText('gpt-5.5'),
            messages: params.messages,
            systemPrompts: [BLOG_STUDIO_SYSTEM_PROMPT],
            outputSchema: BlogPostSchema,
            stream: true,
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          }) as AsyncIterable<StreamChunk>
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          console.error('[api/blog-draft] Error:', error)
          return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
