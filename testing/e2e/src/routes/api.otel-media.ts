import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import type { Provider } from '@/lib/types'
import { createImageAdapter } from '@/lib/media-providers'
import { createLocalCaptureTracer } from '@/lib/otel-local-tracer'
import { recordFromBody } from '@/lib/request-body'

/**
 * Drives `generateImage` with `otelMiddleware` against the same aimock mount
 * the image-gen feature tests use, and returns the captured spans. End-to-end
 * proof that the unified middleware emits a `gen_ai.*` span tagged
 * `image_generation` for a non-chat activity — the same `otelMiddleware` value
 * used for chat, passed through the media `middleware` slot.
 */
export const Route = createFileRoute('/api/otel-media')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())

        try {
          const body: unknown = await request.json()
          const data = recordFromBody(body)
          const prompt = data.prompt
          const provider = data.provider
          if (typeof prompt !== 'string' || typeof provider !== 'string') {
            throw new Error('Missing required fields: prompt/provider')
          }

          const testId =
            typeof data.testId === 'string' ? data.testId : undefined
          const aimockPort =
            typeof data.aimockPort === 'number' ? data.aimockPort : undefined
          const adapter = createImageAdapter(
            provider as Provider,
            aimockPort,
            testId,
          )
          const { tracer, spans } = createLocalCaptureTracer()

          await generateImage({
            adapter,
            prompt,
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
