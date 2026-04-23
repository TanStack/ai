import { describe, it, expect } from 'vitest'
import { SpanStatusCode } from '@opentelemetry/api'
import { otelMiddleware } from '../../src/middlewares/otel'
import { EventType } from '../../src/types'
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

describe('otelMiddleware — iteration span lifecycle', () => {
  it('opens an iteration span on onConfig(beforeModel) and closes it on RUN_FINISHED chunk', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()
    ctx.phase = 'init'

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'

    await mw.onConfig?.(ctx, {
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompts: [],
      tools: [],
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 512,
    })

    const [rootSpan, iterSpan] = spans
    expect(spans).toHaveLength(2)
    expect(iterSpan!.parent).toBe(rootSpan)
    expect(iterSpan!.name).toBe('chat gpt-4o')
    expect(iterSpan!.ended).toBe(false)

    await mw.onChunk?.(ctx, {
      type: EventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'r-1',
      model: 'gpt-4o',
      timestamp: Date.now(),
      finishReason: 'stop',
    })
    expect(iterSpan!.ended).toBe(true)
    expect(iterSpan!.attributes['gen_ai.response.finish_reasons']).toEqual(['stop'])

    await mw.onFinish?.(ctx, { finishReason: 'stop', duration: 10, content: '' })
    expect(rootSpan!.ended).toBe(true)
  })

  it('opens a fresh iteration span for each onConfig(beforeModel)', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    await mw.onChunk?.(ctx, {
      type: EventType.RUN_FINISHED, threadId: 't-1', runId: 'r-1', model: 'gpt-4o', timestamp: 0, finishReason: 'tool_calls',
    })
    ctx.iteration = 1
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    await mw.onChunk?.(ctx, {
      type: EventType.RUN_FINISHED, threadId: 't-1', runId: 'r-2', model: 'gpt-4o', timestamp: 0, finishReason: 'stop',
    })
    await mw.onFinish?.(ctx, { finishReason: 'stop', duration: 10, content: '' })

    // 1 root + 2 iteration spans
    expect(spans).toHaveLength(3)
    expect(spans[1]!.ended).toBe(true)
    expect(spans[2]!.ended).toBe(true)
  })
})
