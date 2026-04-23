import { describe, it, expect } from 'vitest'
import { SpanStatusCode } from '@opentelemetry/api'
import { otelMiddleware } from '../../src/middlewares/otel'
import { EventType } from '../../src/types'
import { createFakeTracer, createFakeMeter, makeCtx } from './fake-otel'

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

describe('otelMiddleware — token histogram', () => {
  it('records input and output token histograms on onUsage', async () => {
    const { tracer } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    await mw.onUsage?.(ctx, { promptTokens: 100, completionTokens: 50, totalTokens: 150 })

    const tokenRecords = records.filter((r) => r.name === 'gen_ai.client.token.usage')
    expect(tokenRecords).toHaveLength(2)
    expect(tokenRecords.find((r) => r.attributes!['gen_ai.token.type'] === 'input')!.value).toBe(100)
    expect(tokenRecords.find((r) => r.attributes!['gen_ai.token.type'] === 'output')!.value).toBe(50)

    // Cardinality guard: response.id must NOT appear on metric attributes.
    for (const r of tokenRecords) {
      expect(r.attributes!['gen_ai.response.id']).toBeUndefined()
    }
  })

  it('sets gen_ai.usage.* attributes on the iteration span', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    await mw.onUsage?.(ctx, { promptTokens: 100, completionTokens: 50, totalTokens: 150 })

    expect(spans[1]!.attributes['gen_ai.usage.input_tokens']).toBe(100)
    expect(spans[1]!.attributes['gen_ai.usage.output_tokens']).toBe(50)
  })

  it('skips metrics when meter is not provided', async () => {
    const { tracer } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    // Should not throw:
    await mw.onUsage?.(ctx, { promptTokens: 100, completionTokens: 50, totalTokens: 150 })
  })
})

describe('otelMiddleware — duration histogram and rollup', () => {
  it('records duration histogram on onFinish and rolls up tokens onto root', async () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    await mw.onUsage?.(ctx, { promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    await mw.onChunk?.(ctx, {
      type: EventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'r',
      model: 'gpt-4o',
      timestamp: 0,
      finishReason: 'stop',
    })
    await mw.onFinish?.(ctx, {
      finishReason: 'stop',
      duration: 1250,
      content: '',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })

    const durationRecords = records.filter((r) => r.name === 'gen_ai.client.operation.duration')
    expect(durationRecords).toHaveLength(1)
    expect(durationRecords[0]!.value).toBe(1.25)
    expect(durationRecords[0]!.attributes!['gen_ai.response.model']).toBe('gpt-4o')
    expect(durationRecords[0]!.attributes!['error.type']).toBeUndefined()

    const root = spans[0]!
    expect(root.attributes['gen_ai.usage.input_tokens']).toBe(100)
    expect(root.attributes['gen_ai.usage.output_tokens']).toBe(50)
    expect(root.attributes['tanstack.ai.iterations']).toBe(1)
    expect(root.ended).toBe(true)
  })
})

describe('otelMiddleware — tool spans', () => {
  it('creates a tool span as child of the iteration span', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx({ hasTools: true, toolNames: ['get_weather'] })

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })

    const iterSpan = spans[1]!
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: { id: 'tc-1', type: 'function', function: { name: 'get_weather', arguments: '{}' } } as any,
      tool: undefined,
      args: { city: 'NYC' },
      toolName: 'get_weather',
      toolCallId: 'tc-1',
    })

    const toolSpan = spans[2]!
    expect(toolSpan.name).toBe('execute_tool get_weather')
    expect(toolSpan.parent).toBe(iterSpan)
    expect(toolSpan.attributes['gen_ai.tool.name']).toBe('get_weather')
    expect(toolSpan.attributes['gen_ai.tool.call.id']).toBe('tc-1')
    expect(toolSpan.attributes['gen_ai.tool.type']).toBe('function')
    expect(toolSpan.ended).toBe(false)

    await mw.onAfterToolCall?.(ctx, {
      toolCall: { id: 'tc-1' } as any,
      tool: undefined,
      toolName: 'get_weather',
      toolCallId: 'tc-1',
      ok: true,
      duration: 42,
      result: { temp: 72 },
    })

    expect(toolSpan.ended).toBe(true)
    expect(toolSpan.attributes['tanstack.ai.tool.outcome']).toBe('success')
  })

  it('records exception and error outcome on tool failure', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx({ hasTools: true })

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: { id: 'tc-2', type: 'function', function: { name: 'broken', arguments: '{}' } } as any,
      tool: undefined,
      args: {},
      toolName: 'broken',
      toolCallId: 'tc-2',
    })
    const toolSpan = spans[2]!
    await mw.onAfterToolCall?.(ctx, {
      toolCall: { id: 'tc-2' } as any,
      tool: undefined,
      toolName: 'broken',
      toolCallId: 'tc-2',
      ok: false,
      duration: 5,
      error: new Error('boom'),
    })

    expect(toolSpan.attributes['tanstack.ai.tool.outcome']).toBe('error')
    expect(toolSpan.exceptions).toHaveLength(1)
    expect((toolSpan.exceptions[0]!.exception as Error).message).toBe('boom')
    expect(toolSpan.status.code).toBe(SpanStatusCode.ERROR)
  })
})

describe('otelMiddleware — captureContent', () => {
  it('captureContent=true emits gen_ai.*.message events with redact applied on iteration span', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({
      tracer,
      captureContent: true,
      redact: (s) => s.replace(/\d+/g, '[NUM]'),
    })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, {
      messages: [
        { role: 'user', content: 'Hello 42 world' },
        { role: 'assistant', content: 'Hi 7 there' },
      ],
      systemPrompts: ['Be helpful 99'],
      tools: [],
    })

    const iter = spans[1]!
    const userEvt = iter.events.find((e) => e.name === 'gen_ai.user.message')
    const sysEvt = iter.events.find((e) => e.name === 'gen_ai.system.message')
    const asstEvt = iter.events.find((e) => e.name === 'gen_ai.assistant.message')
    expect(userEvt!.attributes!['content']).toBe('Hello [NUM] world')
    expect(sysEvt!.attributes!['content']).toBe('Be helpful [NUM]')
    expect(asstEvt!.attributes!['content']).toBe('Hi [NUM] there')
  })

  it('captureContent=false emits no message events', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, {
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompts: [],
      tools: [],
    })

    const iter = spans[1]!
    expect(iter.events.filter((e) => e.name.startsWith('gen_ai.'))).toHaveLength(0)
  })

  it('multimodal ContentPart arrays become placeholder-tagged strings', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer, captureContent: true })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'look at this' },
            { type: 'image', source: { type: 'base64', data: '...' } },
          ] as any,
        },
      ],
      systemPrompts: [],
      tools: [],
    })

    const userEvt = spans[1]!.events.find((e) => e.name === 'gen_ai.user.message')!
    expect(userEvt.attributes!['content']).toBe('look at this [image]')
  })
})

describe('otelMiddleware — error and abort paths', () => {
  it('onError sets ERROR status, records exception, adds error.type to duration histogram', async () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    const err = new Error('rate limited')
    ;(err as any).name = 'RateLimitError'
    await mw.onError?.(ctx, { error: err, duration: 200 })

    const root = spans[0]!
    expect(root.status.code).toBe(SpanStatusCode.ERROR)
    expect(root.exceptions).toHaveLength(1)
    expect(root.ended).toBe(true)

    const iter = spans[1]!
    expect(iter.status.code).toBe(SpanStatusCode.ERROR)
    expect(iter.ended).toBe(true)
    expect(iter.exceptions).toHaveLength(1)

    const durationRecords = records.filter((r) => r.name === 'gen_ai.client.operation.duration')
    expect(durationRecords[0]!.attributes!['error.type']).toBe('RateLimitError')
  })

  it('onAbort sets ERROR status and cancelled reason', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    ctx.phase = 'beforeModel'
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    await mw.onAbort?.(ctx, { reason: 'user stop', duration: 80 })

    expect(spans[0]!.status.code).toBe(SpanStatusCode.ERROR)
    expect(spans[0]!.attributes['gen_ai.completion.reason']).toBe('cancelled')
    expect(spans[0]!.ended).toBe(true)
  })
})
