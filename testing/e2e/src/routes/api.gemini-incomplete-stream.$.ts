import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createGeminiChat } from '@tanstack/ai-gemini'

const model = 'gemini-2.5-flash'

const textChunk = (text: string, finishReason?: string) => ({
  candidates: [
    {
      content: { role: 'model', parts: [{ text }] },
      index: 0,
      ...(finishReason && { finishReason }),
    },
  ],
  modelVersion: model,
})

/**
 * POST /api/gemini-incomplete-stream/cut runs chat() against this same route
 * as the Gemini upstream. The upstream sends one chunk of text and then ends
 * the body with no finishReason, as when a proxy drops the stream.
 * POST /api/gemini-incomplete-stream/complete sends a finishReason too.
 */
export const Route = createFileRoute('/api/gemini-incomplete-stream/$')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const [scenario, ...upstreamPath] = (params._splat ?? '').split('/')
        if (upstreamPath.length > 0) {
          const chunks =
            scenario === 'upstream-complete'
              ? [textChunk('partial'), textChunk('', 'STOP')]
              : [textChunk('partial')]
          return new Response(
            chunks
              .map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`)
              .join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        }

        const origin = new URL(request.url).origin
        const adapter = createGeminiChat(model, 'test-placeholder', {
          httpOptions: {
            baseUrl: `${origin}/api/gemini-incomplete-stream/upstream-${scenario}`,
          },
        })
        const result = {
          events: new Array<string>(),
          text: '',
          finishCount: 0,
          errorCount: 0,
          errorCode: '',
        }
        for await (const event of chat({
          threadId: 'gemini-incomplete-stream',
          adapter,
          messages: [{ role: 'user', content: 'Reply' }],
          debug: false,
          middleware: [
            {
              name: 'observe',
              onFinish: () => {
                result.finishCount++
              },
              onError: () => {
                result.errorCount++
              },
            },
          ],
        })) {
          result.events.push(event.type)
          if (event.type === 'TEXT_MESSAGE_CONTENT') result.text += event.delta
          if (event.type === 'RUN_ERROR') result.errorCode = event.code ?? ''
        }
        return Response.json(result)
      },
    },
  },
})
