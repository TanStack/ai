import { describe, it, expect } from 'vitest'
import { SpanStatusCode } from '@opentelemetry/api'
import { otelMiddleware } from '../../src/middlewares/otel'
import { createFakeTracer, makeCtx } from './fake-otel'

describe('otelMiddleware — root span lifecycle', () => {
  it('creates a root span on onStart and closes it on onFinish', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    expect(spans).toHaveLength(1)
    expect(spans[0]!.name).toBe('chat gpt-4o')
    expect(spans[0]!.ended).toBe(false)
    expect(spans[0]!.attributes['gen_ai.system']).toBe('openai')
    expect(spans[0]!.attributes['gen_ai.operation.name']).toBe('chat')
    expect(spans[0]!.attributes['gen_ai.request.model']).toBe('gpt-4o')

    await mw.onFinish?.(ctx, { finishReason: 'stop', duration: 10, content: '' })
    expect(spans[0]!.ended).toBe(true)
    expect(spans[0]!.status.code).toBe(SpanStatusCode.UNSET)
  })
})
