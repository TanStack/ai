import { SpanStatusCode, context } from '@opentelemetry/api'
import type { Attributes, Span, Tracer } from '@opentelemetry/api'

export async function recordSpan<T>({
  tracer,
  name,
  attributes,
  fn,
}: {
  tracer: Tracer
  name: string
  attributes?: Attributes | PromiseLike<Attributes>
  fn: (span: Span) => Promise<T>
}) {
  return tracer.startActiveSpan(
    name,
    { attributes: await attributes },
    async (span) => {
      const ctx = context.active()

      try {
        const result = await context.with(ctx, () => fn(span))

        return result
      } catch (error) {
        try {
          recordSpanError(span, error)
        } finally {
          span.end()
        }

        throw error
      }
    },
  )
}

export function recordSpanError(span: Span, error: unknown) {
  if (error instanceof Error) {
    span.recordException({
      name: error.name,
      message: error.message,
      stack: error.stack,
    })
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    })
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR })
  }
}
