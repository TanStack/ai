import opentelemetry from '@opentelemetry/api'
import type { Tracer } from '@opentelemetry/api'

export function getTracer(tracer?: Tracer) {
  return tracer ?? opentelemetry.trace.getTracer('tanstack-ai')
}
