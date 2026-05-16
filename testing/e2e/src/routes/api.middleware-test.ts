import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import type { ChatMiddleware } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { SpanStatusCode } from '@opentelemetry/api'
import type {
  AttributeValue,
  Attributes,
  Context,
  Histogram,
  Meter,
  MetricOptions,
  Span,
  SpanContext,
  SpanStatus,
  Tracer,
} from '@opentelemetry/api'
import { z } from 'zod'
import { createTextAdapter } from '@/lib/providers'
import {
  getOtelCapture,
  recordOtelEvent,
  recordOtelException,
  recordOtelHistogram,
  recordOtelSpan,
  resetOtelCapture,
} from '@/lib/otel-capture'

// The otel capture endpoint is only useful during E2E runs. Gate both the
// POST 'otel' mode and the GET capture fetch behind this flag so the route
// cannot be used as an oracle in a production-like build.
const OTEL_TEST_ENABLED =
  process.env.E2E_TEST === '1' || process.env.NODE_ENV !== 'production'

const weatherTool = toolDefinition({
  name: 'get_weather',
  description: 'Get weather',
  inputSchema: z.object({ city: z.string() }),
}).server(async (args) =>
  JSON.stringify({ city: args.city, temperature: 72, condition: 'sunny' }),
)

const chunkTransformMiddleware: ChatMiddleware = {
  name: 'chunk-transform',
  onChunk(_ctx, chunk) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      return {
        ...chunk,
        delta: '[MW] ' + chunk.delta,
        content: '[MW] ' + (chunk.content || ''),
      }
    }
    return chunk
  },
}

const toolSkipMiddleware: ChatMiddleware = {
  name: 'tool-skip',
  onBeforeToolCall(_ctx, hookCtx) {
    if (hookCtx.toolName === 'get_weather') {
      return {
        type: 'skip' as const,
        result: JSON.stringify({ skipped: true, reason: 'middleware' }),
      }
    }
    return undefined
  },
}

// Minimal in-memory tracer/meter. Captures into a per-testId bucket so that
// the Playwright spec can fetch the recorded state via GET after the stream
// finishes. Not exported — only used to build otelMiddleware for the test.
function createCaptureTracer(captureId: string): Tracer {
  let spanSeq = 0
  const tracer: Tracer = {
    startSpan(name, options = {}, _ctx?: Context): Span {
      const id = `span-${spanSeq++}`
      const attrs: Record<string, AttributeValue> = {}
      for (const [k, v] of Object.entries(options.attributes ?? {})) {
        if (v !== undefined) attrs[k] = v as AttributeValue
      }
      recordOtelSpan(captureId, {
        id,
        name,
        kind: options.kind,
        attributes: attrs,
        status: SpanStatusCode.UNSET,
        events: [],
        exceptions: [],
        ended: false,
      })
      const status: SpanStatus = { code: SpanStatusCode.UNSET }
      let ended = false
      const span: Span = {
        spanContext(): SpanContext {
          return { traceId: 'capture-trace', spanId: id, traceFlags: 1 }
        },
        setAttribute(key, value) {
          attrs[key] = value as AttributeValue
          recordOtelSpan(captureId, { id, patch: { attributes: { ...attrs } } })
          return span
        },
        setAttributes(next) {
          for (const [k, v] of Object.entries(next)) {
            attrs[k] = v as AttributeValue
          }
          recordOtelSpan(captureId, { id, patch: { attributes: { ...attrs } } })
          return span
        },
        addEvent(eventName, eventAttrs) {
          recordOtelEvent(captureId, id, {
            name: eventName,
            attributes: eventAttrs as Attributes | undefined,
          })
          return span
        },
        addLink() {
          return span
        },
        addLinks() {
          return span
        },
        setStatus(next) {
          status.code = next.code
          status.message = next.message
          recordOtelSpan(captureId, {
            id,
            patch: { status: next.code, statusMessage: next.message },
          })
          return span
        },
        updateName(next) {
          recordOtelSpan(captureId, { id, patch: { name: next } })
          return span
        },
        end() {
          ended = true
          recordOtelSpan(captureId, { id, patch: { ended: true } })
        },
        isRecording() {
          return !ended
        },
        recordException(exception, exceptionAttrs) {
          recordOtelException(captureId, id, {
            exception: String(
              (exception as { message?: string } | undefined)?.message ??
                exception,
            ),
            attributes: exceptionAttrs as Attributes | undefined,
          })
        },
      }
      return span
    },
    // Minimal implementation — our middleware never calls startActiveSpan.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return tracer
}

function createCaptureMeter(captureId: string): Meter {
  const histogram = (name: string, options?: MetricOptions): Histogram => ({
    record(value: number, attributes?: Attributes) {
      recordOtelHistogram(captureId, {
        name,
        value,
        attributes,
        unit: options?.unit,
      })
    },
  })
  return {
    createHistogram: histogram,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Meter
}

export const Route = createFileRoute('/api/middleware-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal?.aborted) return new Response(null, { status: 499 })
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

        const fp = params.forwardedProps as Record<string, unknown>
        const scenario =
          typeof fp.scenario === 'string' ? fp.scenario : 'basic-text'
        const middlewareMode =
          typeof fp.middlewareMode === 'string' ? fp.middlewareMode : 'none'
        const testId: string | undefined =
          typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort: number | undefined =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined

        try {
          const adapterOptions = createTextAdapter(
            'openai',
            undefined,
            aimockPort,
            testId,
          )

          const middleware: Array<ChatMiddleware> = []

          if (middlewareMode === 'chunk-transform')
            middleware.push(chunkTransformMiddleware)
          if (middlewareMode === 'tool-skip')
            middleware.push(toolSkipMiddleware)
          if (middlewareMode === 'otel') {
            if (!OTEL_TEST_ENABLED) {
              return new Response(null, { status: 404 })
            }
            if (!testId) {
              return new Response(
                JSON.stringify({ error: 'otel mode requires testId' }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }
            resetOtelCapture(testId)
            middleware.push(
              otelMiddleware({
                tracer: createCaptureTracer(testId),
                meter: createCaptureMeter(testId),
                captureContent: true,
              }),
            )
          }

          const tools = scenario === 'with-tool' ? [weatherTool] : []

          const stream = chat({
            ...adapterOptions,
            messages: params.messages,
            tools,
            middleware,
            threadId: params.threadId,
            runId: params.runId,
            agentLoopStrategy: maxIterations(10),
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[api.middleware-test] Error:', error.message)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
      GET: async ({ request }) => {
        if (!OTEL_TEST_ENABLED) {
          return new Response(null, { status: 404 })
        }
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId')
        if (!testId) {
          return new Response(
            JSON.stringify({ error: 'testId query param required' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        return new Response(JSON.stringify(getOtelCapture(testId)), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
