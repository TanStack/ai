import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import type { Provider } from '@/lib/types'
import type {
  AttributeValue,
  Context,
  Span,
  SpanContext,
  SpanStatus,
  Tracer,
} from '@opentelemetry/api'
import { createImageAdapter } from '@/lib/media-providers'

interface CapturedSpan {
  name: string
  kind?: number
  attributes: Record<string, AttributeValue>
  status: SpanStatus
  ended: boolean
}

/**
 * Single-request in-memory tracer (mirrors `api.otel-usage.ts`). Everything
 * happens inside one POST, so spans collect into a local array returned in the
 * response body.
 */
function createLocalCaptureTracer(): {
  tracer: Tracer
  spans: Array<CapturedSpan>
} {
  const spans: Array<CapturedSpan> = []
  let spanSeq = 0
  const tracer: Tracer = {
    startSpan(name, options = {}, _ctx?: Context): Span {
      const id = `span-${spanSeq++}`
      const attributes: Record<string, AttributeValue> = {}
      for (const [k, v] of Object.entries(options.attributes ?? {})) {
        if (v !== undefined) attributes[k] = v
      }
      const captured: CapturedSpan = {
        name,
        kind: options.kind,
        attributes,
        status: { code: 0 },
        ended: false,
      }
      spans.push(captured)
      const span: Span = {
        spanContext(): SpanContext {
          return { traceId: 'otel-media-trace', spanId: id, traceFlags: 1 }
        },
        setAttribute(key, value) {
          captured.attributes[key] = value
          return span
        },
        setAttributes(next) {
          for (const [k, v] of Object.entries(next)) {
            captured.attributes[k] = v as AttributeValue
          }
          return span
        },
        addEvent() {
          return span
        },
        addLink() {
          return span
        },
        addLinks() {
          return span
        },
        setStatus(status) {
          captured.status = status
          return span
        },
        updateName(next) {
          captured.name = next
          return span
        },
        end() {
          captured.ended = true
        },
        isRecording() {
          return !captured.ended
        },
        recordException() {},
      }
      return span
    },
     
    startActiveSpan(...args: Array<any>) {
      const fn = args[args.length - 1] as (span: Span) => unknown
      const name = args[0] as string
      const span = tracer.startSpan(name, {})
      try {
        return fn(span)
      } finally {
        span.end()
      }
    },
  }
  return { tracer, spans }
}

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

          const testId = typeof data.testId === 'string' ? data.testId : undefined
          const aimockPort =
            typeof data.aimockPort === 'number' ? data.aimockPort : undefined
          const adapter = createImageAdapter(provider as Provider, aimockPort, testId)
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
