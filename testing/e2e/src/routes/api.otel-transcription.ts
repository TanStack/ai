import { createFileRoute } from '@tanstack/react-router'
import { generateTranscription } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import type { Provider } from '@/lib/types'
import { createTranscriptionAdapter } from '@/lib/media-providers'
import { createLocalCaptureTracer } from '@/lib/otel-local-tracer'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function recordFromBody(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new Error('Invalid request body')
  }

  const data = body.forwardedProps ?? body.data ?? body
  if (!isRecord(data)) {
    throw new Error('Invalid request body')
  }

  return data
}

/**
 * Drives `generateTranscription` with `otelMiddleware` against the whisper
 * aimock fixture (which reports an audio `duration`), and returns the captured
 * spans. End-to-end proof that a duration-billed activity surfaces the
 * self-describing billed quantity on its span:
 * `tanstack.ai.usage.billed_quantity` + `tanstack.ai.usage.billed_unit`.
 */
export const Route = createFileRoute('/api/otel-transcription')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())

        try {
          const body: unknown = await request.json()
          const data = recordFromBody(body)
          const audio = data.audio
          const provider = data.provider
          if (typeof audio !== 'string' || typeof provider !== 'string') {
            throw new Error('Missing required fields: audio/provider')
          }

          const testId =
            typeof data.testId === 'string' ? data.testId : undefined
          const aimockPort =
            typeof data.aimockPort === 'number' ? data.aimockPort : undefined
          const adapter = createTranscriptionAdapter(
            provider as Provider,
            aimockPort,
            testId,
          )
          const { tracer, spans } = createLocalCaptureTracer()

          await generateTranscription({
            adapter,
            audio,
            middleware: [otelMiddleware({ tracer })],
          })

          return new Response(JSON.stringify({ ok: true, spans }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
