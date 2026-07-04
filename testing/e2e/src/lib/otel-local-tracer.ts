import type {
  AttributeValue,
  Context,
  Span,
  SpanContext,
  SpanStatus,
  Tracer,
} from '@opentelemetry/api'

export interface LocalCapturedSpan {
  name: string
  kind?: number
  attributes: Record<string, AttributeValue>
  status: SpanStatus
  ended: boolean
}

/**
 * Single-request in-memory tracer shared by the `api.otel-*` routes. Unlike
 * the per-testId capture in `otel-capture.ts` (used by
 * `api.middleware-test.ts`), everything in those routes happens inside one
 * POST, so spans collect into a local array returned directly in the response
 * body.
 */
export function createLocalCaptureTracer(): {
  tracer: Tracer
  spans: Array<LocalCapturedSpan>
} {
  const spans: Array<LocalCapturedSpan> = []
  let spanSeq = 0
  const tracer: Tracer = {
    startSpan(name, options = {}, _ctx?: Context): Span {
      const id = `span-${spanSeq++}`
      const attributes: Record<string, AttributeValue> = {}
      for (const [k, v] of Object.entries(options.attributes ?? {})) {
        if (v !== undefined) attributes[k] = v
      }
      const captured: LocalCapturedSpan = {
        name,
        kind: options.kind,
        attributes,
        status: { code: 0 },
        ended: false,
      }
      spans.push(captured)
      const span: Span = {
        spanContext(): SpanContext {
          return { traceId: 'otel-local-trace', spanId: id, traceFlags: 1 }
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

    // Minimal implementation — otelMiddleware never calls startActiveSpan.
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
  return { tracer, spans }
}
