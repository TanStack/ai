import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { getReproImage } from '@/lib/image-tool-repro'

/**
 * Repro endpoint for https://github.com/TanStack/ai/issues/363
 *
 * Uses a single server tool (`getReproImage`) that returns a multimodal
 * content-part array. The system prompt forces the model to declare whether it
 * could actually SEE the returned image, giving a crisp pass/fail signal.
 */
const SYSTEM_PROMPT = `You are a vision QA assistant. You have one tool: getReproImage(), which returns an image.

When the user asks you to inspect the image, follow these steps exactly:
1. Call the getReproImage tool.
2. Look at what the tool returned.
3. If you can actually SEE an image, begin your reply with "VISIBLE:" followed by the exact number printed in the image.
4. If the tool result was only text, JSON, or base64 data that you cannot view as an image, begin your reply with "NOT-VISIBLE:" and explain that you only received data you could not view.

Never guess the number. Only report a number you can actually read in an image. If you cannot see an image, you must say NOT-VISIBLE.`

export const Route = createFileRoute('/api/image-tool-repro')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

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
            adapter: openaiText('gpt-4o'),
            tools: [getReproImage],
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(5),
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({ error: error.message || 'An error occurred' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
