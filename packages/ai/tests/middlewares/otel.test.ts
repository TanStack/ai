import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { otelMiddleware } from '../../src/middlewares/otel'
import { usageAttributes } from '../../src/middlewares/usage-attributes'
import {
  createFakeTracer,
  createFakeMeter,
  makeCtx,
  makeToolCall,
  type FakeSpan,
} from './fake-otel'
import type { TokenUsage } from '../../src/types'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
  ChatMiddlewareConfig,
} from '../../src/activities/chat/middleware/types'
import type {
  GenerationActivity,
  GenerationMiddlewareContext,
} from '../../src/activities/middleware/types'
import { ev } from '../test-utils'

/**
 * Build a minimal base GenerationMiddlewareContext for the media-activity unit
 * tests below. Mirrors what `createGenerationContext` produces inside the media
 * runners — only the fields otelMiddleware reads need realistic values.
 */
function makeGenCtx(
  overrides: Partial<GenerationMiddlewareContext> = {},
): GenerationMiddlewareContext {
  return {
    requestId: 'req-1',
    activity: 'image',
    provider: 'openai',
    model: 'gpt-image-1',
    source: 'server',
    context: undefined,
    createId: (prefix: string) => `${prefix}-1`,
    ...overrides,
  }
}

async function runToIterationStart(
  mw: ChatMiddleware,
  ctx: ChatMiddlewareContext,
  config: Partial<ChatMiddlewareConfig> = {},
) {
  await mw.onStart?.(ctx)
  ctx.phase = 'beforeModel'
  await mw.onConfig?.(ctx, {
    messages: [],
    systemPrompts: [],
    tools: [],
    ...config,
  })
}

class RateLimitError extends Error {
  override name = 'RateLimitError'
}

describe('otelMiddleware — root span lifecycle', () => {
  it('creates a root span on onStart and closes it on onFinish', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    expect(spans).toHaveLength(1)
    expect(spans[0]!.name).toBe('chat gpt-4o')
    expect(spans[0]!.ended).toBe(false)
    expect(spans[0]!.kind).toBe(SpanKind.INTERNAL)
    expect(spans[0]!.attributes['gen_ai.system']).toBe('openai')
    // `gen_ai.operation.name` is intentionally NOT set on the root span —
    // see the matching comment in otel.ts. Only iteration spans carry it.
    expect(spans[0]!.attributes['gen_ai.operation.name']).toBeUndefined()
    expect(spans[0]!.attributes['gen_ai.request.model']).toBe('gpt-4o')

    await mw.onFinish?.(ctx, {
      finishReason: 'stop',
      duration: 10,
      content: '',
    })
    expect(spans[0]!.ended).toBe(true)
    expect(spans[0]!.status.code).toBe(SpanStatusCode.UNSET)
  })
})

describe('otelMiddleware — iteration span lifecycle', () => {
  it('opens an iteration span on onConfig(beforeModel) and keeps it open through RUN_FINISHED', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()
    ctx.phase = 'init'

    await runToIterationStart(mw, ctx, {
      messages: [{ role: 'user', content: 'hi' }],
      // Provider-native spellings: OpenAI Responses uses snake_case `top_p`
      // and `max_output_tokens`, not the camelCase `topP` / `maxTokens`.
      modelOptions: { temperature: 0.7, top_p: 0.9, max_output_tokens: 512 },
    })

    const [rootSpan, iterSpan] = spans
    expect(spans).toHaveLength(2)
    expect(iterSpan!.parent).toBe(rootSpan)
    expect(iterSpan!.name).toBe('chat gpt-4o #0')
    expect(iterSpan!.kind).toBe(SpanKind.CLIENT)
    expect(iterSpan!.ended).toBe(false)
    // Sampling options are sourced from provider-native modelOptions, whose
    // key spellings vary per provider. The middleware reads a union of known
    // spellings so the gen_ai semantic attributes populate regardless.
    expect(iterSpan!.attributes['gen_ai.request.temperature']).toBe(0.7)
    expect(iterSpan!.attributes['gen_ai.request.top_p']).toBe(0.9)
    expect(iterSpan!.attributes['gen_ai.request.max_tokens']).toBe(512)

    await mw.onChunk?.(ctx, { ...ev.runFinished('stop'), model: 'gpt-4o' })
    // The iteration span stays open across RUN_FINISHED so tool spans can
    // nest under it and onUsage still has a target. It closes on onFinish.
    expect(iterSpan!.ended).toBe(false)
    expect(iterSpan!.attributes['gen_ai.response.finish_reasons']).toEqual([
      'stop',
    ])
    expect(iterSpan!.attributes['gen_ai.response.model']).toBe('gpt-4o')

    await mw.onFinish?.(ctx, {
      finishReason: 'stop',
      duration: 10,
      content: '',
    })
    expect(iterSpan!.ended).toBe(true)
    expect(rootSpan!.ended).toBe(true)
  })

  it('reads sampling attributes from Ollama-nested modelOptions.options', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()
    ctx.phase = 'init'

    await runToIterationStart(mw, ctx, {
      messages: [{ role: 'user', content: 'hi' }],
      // Ollama nests sampling under `options` and caps output via `num_predict`.
      modelOptions: {
        options: { temperature: 0.2, top_p: 0.8, num_predict: 256 },
      },
    })

    const iterSpan = spans[1]
    expect(iterSpan!.attributes['gen_ai.request.temperature']).toBe(0.2)
    expect(iterSpan!.attributes['gen_ai.request.top_p']).toBe(0.8)
    expect(iterSpan!.attributes['gen_ai.request.max_tokens']).toBe(256)
  })

  it('reads camelCase sampling spellings (Gemini/OpenRouter)', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()
    ctx.phase = 'init'

    await runToIterationStart(mw, ctx, {
      messages: [{ role: 'user', content: 'hi' }],
      // Gemini uses `topP` / `maxOutputTokens`; OpenRouter uses
      // `maxCompletionTokens`.
      modelOptions: { temperature: 0.5, topP: 0.95, maxOutputTokens: 1024 },
    })

    const iterSpan = spans[1]
    expect(iterSpan!.attributes['gen_ai.request.temperature']).toBe(0.5)
    expect(iterSpan!.attributes['gen_ai.request.top_p']).toBe(0.95)
    expect(iterSpan!.attributes['gen_ai.request.max_tokens']).toBe(1024)
  })

  it('opens a fresh iteration span for each onConfig(beforeModel) and closes the previous one', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onChunk?.(ctx, ev.runFinished('tool_calls'))
    // First iteration span still open at this point.
    expect(spans[1]!.ended).toBe(false)
    ctx.iteration = 1
    await mw.onConfig?.(ctx, { messages: [], systemPrompts: [], tools: [] })
    // Opening the 2nd iteration closes the 1st.
    expect(spans[1]!.ended).toBe(true)
    await mw.onChunk?.(ctx, ev.runFinished('stop'))
    await mw.onFinish?.(ctx, {
      finishReason: 'stop',
      duration: 10,
      content: '',
    })

    expect(spans).toHaveLength(3)
    expect(spans[1]!.ended).toBe(true)
    expect(spans[2]!.ended).toBe(true)
    expect(spans[1]!.name).toBe('chat gpt-4o #0')
    expect(spans[2]!.name).toBe('chat gpt-4o #1')
  })
})

describe('otelMiddleware — token histogram', () => {
  it('sets usage attributes on the iteration span from RUN_FINISHED chunk.usage without recording a histogram', async () => {
    // The chat runner always follows onChunk(RUN_FINISHED) with runOnUsage, so
    // histogram recording lives in onUsage alone to avoid double-counting.
    // onChunk is responsible only for the per-iteration span attributes.
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onChunk?.(ctx, {
      ...ev.runFinished('stop'),
      model: 'gpt-4o',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })

    expect(spans[1]!.attributes['gen_ai.usage.input_tokens']).toBe(100)
    expect(spans[1]!.attributes['gen_ai.usage.output_tokens']).toBe(50)
    expect(
      records.filter((r) => r.name === 'gen_ai.client.token.usage'),
    ).toHaveLength(0)
  })

  it('records token histograms from onUsage in production hook order (after RUN_FINISHED)', async () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    // Production order: onChunk(RUN_FINISHED) fires first, then runOnUsage.
    // This test is the regression guard for the "onUsage no-op" bug.
    await runToIterationStart(mw, ctx)
    await mw.onChunk?.(ctx, { ...ev.runFinished('stop'), model: 'gpt-4o' })
    await mw.onUsage?.(ctx, {
      promptTokens: 42,
      completionTokens: 17,
      totalTokens: 59,
    })

    const tokenRecords = records.filter(
      (r) => r.name === 'gen_ai.client.token.usage',
    )
    expect(tokenRecords).toHaveLength(2)
    expect(
      tokenRecords.find((r) => r.attributes!['gen_ai.token.type'] === 'input')!
        .value,
    ).toBe(42)
    // Iteration span is still open, so usage attrs land on it.
    expect(spans[1]!.attributes['gen_ai.usage.input_tokens']).toBe(42)
    expect(spans[1]!.attributes['gen_ai.usage.output_tokens']).toBe(17)
  })

  it('records token histogram even if onUsage fires after the iteration span is gone', async () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    await mw.onStart?.(ctx)
    await mw.onUsage?.(ctx, {
      promptTokens: 5,
      completionTokens: 3,
      totalTokens: 8,
    })
    expect(
      records.filter((r) => r.name === 'gen_ai.client.token.usage'),
    ).toHaveLength(2)
    // Falls back to the root span for attribute assignment.
    expect(spans[0]!.attributes['gen_ai.usage.input_tokens']).toBe(5)
  })

  it('skips metrics when meter is not provided', async () => {
    const { tracer } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    // Should not throw:
    await mw.onUsage?.(ctx, {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })
})

describe('otelMiddleware — duration histogram and rollup', () => {
  it('records duration histogram on onFinish and rolls up tokens onto root', async () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onUsage?.(ctx, {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
    await mw.onChunk?.(ctx, { ...ev.runFinished('stop'), model: 'gpt-4o' })
    await mw.onFinish?.(ctx, {
      finishReason: 'stop',
      duration: 1250,
      content: '',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })

    const durationRecords = records.filter(
      (r) => r.name === 'gen_ai.client.operation.duration',
    )
    expect(durationRecords).toHaveLength(1)
    expect(durationRecords[0]!.value).toBe(1.25)
    // `gen_ai.response.model` is intentionally absent from the duration
    // histogram attrs (high-cardinality for per-request custom models).
    expect(
      durationRecords[0]!.attributes!['gen_ai.response.model'],
    ).toBeUndefined()
    expect(durationRecords[0]!.attributes!['error.type']).toBeUndefined()
    // Histogram options are forwarded to the meter (unit/description).
    expect(durationRecords[0]!.options?.unit).toBe('s')
    const tokenRecord = records.find(
      (r) => r.name === 'gen_ai.client.token.usage',
    )
    expect(tokenRecord?.options?.unit).toBe('{token}')

    const root = spans[0]!
    expect(root.attributes['gen_ai.usage.input_tokens']).toBe(100)
    expect(root.attributes['gen_ai.usage.output_tokens']).toBe(50)
    expect(root.attributes['tanstack.ai.iterations']).toBe(1)
    expect(root.ended).toBe(true)
  })
})

describe('otelMiddleware — full usage emission', () => {
  // Everything `TokenUsage` carries beyond input/output tokens: cost,
  // totals, cache/reasoning breakdowns, duration-based billing, and the
  // upstream cost split. Backends like PostHog consume `gen_ai.usage.cost`
  // directly; without it they re-derive cost from their own price tables
  // and lose cache discounts / gateway markup (OpenRouter).
  const fullUsage = {
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 165,
    promptTokensDetails: { cachedTokens: 80, cacheWriteTokens: 10 },
    completionTokensDetails: { reasoningTokens: 15 },
    durationSeconds: 2.5,
    cost: 0.0123,
    costDetails: {
      upstreamCost: 0.01,
      upstreamInputCost: 0.004,
      upstreamOutputCost: 0.006,
    },
  }

  const expectFullUsageAttrs = (span: FakeSpan) => {
    expect(span.attributes['gen_ai.usage.input_tokens']).toBe(100)
    expect(span.attributes['gen_ai.usage.output_tokens']).toBe(50)
    expect(span.attributes['gen_ai.usage.total_tokens']).toBe(165)
    expect(span.attributes['gen_ai.usage.cost']).toBe(0.0123)
    expect(span.attributes['gen_ai.usage.cache_read.input_tokens']).toBe(80)
    expect(span.attributes['gen_ai.usage.cache_creation.input_tokens']).toBe(10)
    expect(span.attributes['gen_ai.usage.reasoning.output_tokens']).toBe(15)
    expect(span.attributes['tanstack.ai.usage.duration_seconds']).toBe(2.5)
    expect(span.attributes['tanstack.ai.usage.upstream_cost']).toBe(0.01)
    expect(span.attributes['tanstack.ai.usage.upstream_input_cost']).toBe(0.004)
    expect(span.attributes['tanstack.ai.usage.upstream_output_cost']).toBe(
      0.006,
    )
  }

  it('emits cost, totals, and detail breakdowns from RUN_FINISHED chunk.usage', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onChunk?.(ctx, {
      ...ev.runFinished('stop'),
      model: 'gpt-4o',
      usage: fullUsage,
    })

    expectFullUsageAttrs(spans[1]!)
  })

  it('emits cost, totals, and detail breakdowns from onUsage', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onUsage?.(ctx, fullUsage)

    expectFullUsageAttrs(spans[1]!)
  })

  it('rolls up cost, totals, and detail breakdowns onto the root span on onFinish', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onChunk?.(ctx, { ...ev.runFinished('stop'), model: 'gpt-4o' })
    await mw.onFinish?.(ctx, {
      finishReason: 'stop',
      duration: 1250,
      content: '',
      usage: fullUsage,
    })

    expectFullUsageAttrs(spans[0]!)
  })

  it('omits optional usage attributes when the provider does not report them', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onUsage?.(ctx, {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })

    const span = spans[1]!
    expect(span.attributes['gen_ai.usage.input_tokens']).toBe(100)
    expect(span.attributes['gen_ai.usage.output_tokens']).toBe(50)
    expect(span.attributes['gen_ai.usage.total_tokens']).toBe(150)
    expect(span.attributes['gen_ai.usage.cost']).toBeUndefined()
    expect(
      span.attributes['gen_ai.usage.cache_read.input_tokens'],
    ).toBeUndefined()
    expect(
      span.attributes['gen_ai.usage.cache_creation.input_tokens'],
    ).toBeUndefined()
    expect(
      span.attributes['gen_ai.usage.reasoning.output_tokens'],
    ).toBeUndefined()
    expect(
      span.attributes['tanstack.ai.usage.duration_seconds'],
    ).toBeUndefined()
    expect(span.attributes['tanstack.ai.usage.upstream_cost']).toBeUndefined()
    expect(
      span.attributes['tanstack.ai.usage.upstream_input_cost'],
    ).toBeUndefined()
    expect(
      span.attributes['tanstack.ai.usage.upstream_output_cost'],
    ).toBeUndefined()
  })

  it('emits zero-valued usage fields instead of dropping them', async () => {
    // cost 0 is a real report (OpenRouter free models), and the OpenRouter
    // extractor deliberately preserves it. Pin that the presence guard is
    // `!== undefined`, not truthiness — a truthy guard would drop zeros.
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onUsage?.(ctx, {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cost: 0,
      promptTokensDetails: { cachedTokens: 0 },
    })

    const span = spans[1]!
    expect(span.attributes['gen_ai.usage.cost']).toBe(0)
    expect(span.attributes['gen_ai.usage.cache_read.input_tokens']).toBe(0)
  })
})

describe('otelMiddleware — tool spans', () => {
  it('creates a tool span as child of the iteration span (including after RUN_FINISHED)', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx({ hasTools: true, toolNames: ['get_weather'] })

    await runToIterationStart(mw, ctx)
    const iterSpan = spans[1]!
    // Real flow: RUN_FINISHED(tool_calls) fires before onBeforeToolCall.
    // Tool span must still nest under the iteration span.
    await mw.onChunk?.(ctx, {
      ...ev.runFinished('tool_calls'),
      model: 'gpt-4o',
    })
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-1', function: { name: 'get_weather' } }),
      tool: undefined,
      args: { city: 'NYC' },
      toolName: 'get_weather',
      toolCallId: 'tc-1',
    })

    const toolSpan = spans[2]!
    expect(toolSpan.name).toBe('execute_tool get_weather')
    expect(toolSpan.parent).toBe(iterSpan)
    expect(toolSpan.kind).toBe(SpanKind.INTERNAL)
    expect(toolSpan.attributes['gen_ai.tool.name']).toBe('get_weather')
    expect(toolSpan.attributes['gen_ai.tool.call.id']).toBe('tc-1')
    expect(toolSpan.attributes['gen_ai.tool.type']).toBe('function')
    expect(toolSpan.ended).toBe(false)

    await mw.onAfterToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-1' }),
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

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-2', function: { name: 'broken' } }),
      tool: undefined,
      args: {},
      toolName: 'broken',
      toolCallId: 'tc-2',
    })
    const toolSpan = spans[2]!
    await mw.onAfterToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-2' }),
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

  it('preserves non-Error exception shapes through recordException', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-obj', function: { name: 'x' } }),
      tool: undefined,
      args: {},
      toolName: 'x',
      toolCallId: 'tc-obj',
    })
    const plainError = { code: 'E_SOMETHING', message: 'plain-object error' }
    await mw.onAfterToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-obj' }),
      tool: undefined,
      toolName: 'x',
      toolCallId: 'tc-obj',
      ok: false,
      duration: 1,
      error: plainError,
    })

    const toolSpan = spans[2]!
    expect(toolSpan.exceptions[0]!.exception).toBe(plainError)
    expect(toolSpan.status.message).toBe('plain-object error')
  })

  it('finalizes the tool span even when the result fails to JSON.stringify', async () => {
    const { tracer, spans } = createFakeTracer()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = otelMiddleware({ tracer, captureContent: true })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-cyc', function: { name: 'circular' } }),
      tool: undefined,
      args: {},
      toolName: 'circular',
      toolCallId: 'tc-cyc',
    })

    // Craft a result that JSON.stringify cannot handle (circular ref).
    const circular: Record<string, unknown> = {}
    circular['self'] = circular

    await mw.onAfterToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-cyc' }),
      tool: undefined,
      toolName: 'circular',
      toolCallId: 'tc-cyc',
      ok: true,
      duration: 3,
      result: circular,
    })

    const iter = spans[1]!
    const toolSpan = spans[2]!
    // The span is still properly ended — no dangling state.
    expect(toolSpan.ended).toBe(true)
    // The tool-message event uses the sentinel instead of raw serialization.
    const toolEvt = iter.events.find((e) => e.name === 'gen_ai.tool.message')!
    expect(toolEvt.attributes!['content']).toBe('[unserializable_tool_result]')
    warn.mockRestore()
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

    await runToIterationStart(mw, ctx, {
      messages: [
        { role: 'user', content: 'Hello 42 world' },
        { role: 'assistant', content: 'Hi 7 there' },
      ],
      systemPrompts: ['Be helpful 99'],
    })

    const iter = spans[1]!
    const userEvt = iter.events.find((e) => e.name === 'gen_ai.user.message')
    const sysEvt = iter.events.find((e) => e.name === 'gen_ai.system.message')
    const asstEvt = iter.events.find(
      (e) => e.name === 'gen_ai.assistant.message',
    )
    expect(userEvt!.attributes!['content']).toBe('Hello [NUM] world')
    expect(sysEvt!.attributes!['content']).toBe('Be helpful [NUM]')
    expect(asstEvt!.attributes!['content']).toBe('Hi [NUM] there')
  })

  it('captureContent=true attaches systemPrompt metadata as a JSON span attribute when any entry carries metadata', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer, captureContent: true })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx, {
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompts: [
        'plain',
        {
          content: 'cached',
          metadata: { cache_control: { type: 'ephemeral' } },
        },
        { content: 'no-meta' },
      ],
    })

    const iter = spans[1]!
    const attr = iter.attributes!['tanstack.ai.system_prompt.metadata']
    expect(typeof attr).toBe('string')
    expect(JSON.parse(attr as string)).toEqual([
      null,
      { cache_control: { type: 'ephemeral' } },
      null,
    ])
  })

  it('does not attach systemPrompt metadata attribute when no entry carries metadata', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer, captureContent: true })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx, {
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompts: ['plain-a', { content: 'plain-b' }],
    })

    const iter = spans[1]!
    expect(
      iter.attributes!['tanstack.ai.system_prompt.metadata'],
    ).toBeUndefined()
  })

  it('captureContent=false emits no message events', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx, {
      messages: [{ role: 'user', content: 'Hello' }],
    })

    const iter = spans[1]!
    expect(
      iter.events.filter((e) => e.name.startsWith('gen_ai.')),
    ).toHaveLength(0)
  })

  it('multimodal ContentPart arrays become placeholder-tagged strings', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer, captureContent: true })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx, {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'look at this' },
            { type: 'image', source: { type: 'url', value: 'data:...' } },
          ] as const,
        },
      ],
    })

    const userEvt = spans[1]!.events.find(
      (e) => e.name === 'gen_ai.user.message',
    )!
    expect(userEvt.attributes!['content']).toBe('look at this [image]')
  })

  it('emits redaction sentinel and never raw content when redact throws', async () => {
    const { tracer, spans } = createFakeTracer()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = otelMiddleware({
      tracer,
      captureContent: true,
      redact: () => {
        throw new Error('redactor blew up')
      },
    })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx, {
      messages: [{ role: 'user', content: 'secret-ssn-123-45-6789' }],
      systemPrompts: ['also-secret'],
    })

    const iter = spans[1]!
    const userEvt = iter.events.find((e) => e.name === 'gen_ai.user.message')!
    const sysEvt = iter.events.find((e) => e.name === 'gen_ai.system.message')!
    expect(userEvt.attributes!['content']).toBe('[redaction_failed]')
    expect(sysEvt.attributes!['content']).toBe('[redaction_failed]')
    // The redactor failure is surfaced via console.warn.
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('caps assistantTextBuffer at maxContentLength', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({
      tracer,
      captureContent: true,
      maxContentLength: 10,
    })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onChunk?.(ctx, ev.textContent('abcdefghij'))
    // Over the cap — should truncate and stop accumulating.
    await mw.onChunk?.(ctx, ev.textContent('klmnopqrstuvwxyz'))
    await mw.onChunk?.(ctx, { ...ev.runFinished('stop'), model: 'gpt-4o' })

    const iter = spans[1]!
    const choice = iter.events.find((e) => e.name === 'gen_ai.choice')!
    expect(choice.attributes!['content']).toBe('abcdefghij…')
  })
})

describe('otelMiddleware — error and abort paths', () => {
  it('onError sets ERROR status, records exception, adds error.type to duration histogram', async () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    const err = new RateLimitError('rate limited')
    await mw.onError?.(ctx, { error: err, duration: 200 })

    const root = spans[0]!
    expect(root.status.code).toBe(SpanStatusCode.ERROR)
    expect(root.exceptions).toHaveLength(1)
    expect(root.ended).toBe(true)

    const iter = spans[1]!
    expect(iter.status.code).toBe(SpanStatusCode.ERROR)
    expect(iter.ended).toBe(true)
    expect(iter.exceptions).toHaveLength(1)

    const durationRecords = records.filter(
      (r) => r.name === 'gen_ai.client.operation.duration',
    )
    expect(durationRecords[0]!.attributes!['error.type']).toBe('RateLimitError')
  })

  it('onAbort sets ERROR status, marks cancellation, and records duration', async () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onAbort?.(ctx, { reason: 'user stop', duration: 80 })

    expect(spans[0]!.status.code).toBe(SpanStatusCode.ERROR)
    expect(spans[0]!.attributes['tanstack.ai.completion.reason']).toBe(
      'cancelled',
    )
    expect(spans[0]!.ended).toBe(true)
    const durationRecords = records.filter(
      (r) => r.name === 'gen_ai.client.operation.duration',
    )
    expect(durationRecords).toHaveLength(1)
    expect(durationRecords[0]!.value).toBeCloseTo(0.08)
    expect(durationRecords[0]!.attributes!['error.type']).toBe('cancelled')
  })

  it('onError fires onSpanEnd for iteration, open tool spans, then root — in depth-first order', async () => {
    const { tracer } = createFakeTracer()
    const seen: Array<{
      kind: string
      toolName?: string | undefined
      toolCallId?: string | undefined
      ended: boolean
    }> = []
    const mw = otelMiddleware({
      tracer,
      onSpanEnd: (info, span) => {
        seen.push({
          kind: info.kind,
          toolName: info.kind === 'tool' ? info.toolName : undefined,
          toolCallId: info.kind === 'tool' ? info.toolCallId : undefined,
          ended: (span as FakeSpan).ended,
        })
      },
    })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-err', function: { name: 'my_tool' } }),
      tool: undefined,
      args: {},
      toolName: 'my_tool',
      toolCallId: 'tc-err',
    })

    await mw.onError?.(ctx, { error: new Error('fatal'), duration: 100 })

    expect(seen.map((s) => s.kind)).toEqual(['iteration', 'tool', 'chat'])
    expect(seen.every((s) => s.ended === false)).toBe(true)
    const toolCall = seen.find((s) => s.kind === 'tool')!
    expect(toolCall.toolName).toBe('my_tool')
    expect(toolCall.toolCallId).toBe('tc-err')
  })

  it('onAbort fires onSpanEnd for iteration, open tool spans, then root — in depth-first order', async () => {
    const { tracer } = createFakeTracer()
    const seen: Array<{
      kind: string
      toolName?: string | undefined
      toolCallId?: string | undefined
      ended: boolean
    }> = []
    const mw = otelMiddleware({
      tracer,
      onSpanEnd: (info, span) => {
        seen.push({
          kind: info.kind,
          toolName: info.kind === 'tool' ? info.toolName : undefined,
          toolCallId: info.kind === 'tool' ? info.toolCallId : undefined,
          ended: (span as FakeSpan).ended,
        })
      },
    })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({
        id: 'tc-abort',
        function: { name: 'slow_tool' },
      }),
      tool: undefined,
      args: {},
      toolName: 'slow_tool',
      toolCallId: 'tc-abort',
    })

    await mw.onAbort?.(ctx, { reason: 'user stop', duration: 50 })

    expect(seen.map((s) => s.kind)).toEqual(['iteration', 'tool', 'chat'])
    expect(seen.every((s) => s.ended === false)).toBe(true)
  })

  it('onFinish sweeps dangling tool spans with outcome=unknown before closing the iteration span', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({
        id: 'tc-leak',
        function: { name: 'never_resolves' },
      }),
      tool: undefined,
      args: {},
      toolName: 'never_resolves',
      toolCallId: 'tc-leak',
    })
    // Never call onAfterToolCall — simulate an adapter that dropped the call.

    await mw.onFinish?.(ctx, { finishReason: 'stop', duration: 1, content: '' })

    const toolSpan = spans[2]!
    expect(toolSpan.ended).toBe(true)
    expect(toolSpan.attributes['tanstack.ai.tool.outcome']).toBe('unknown')
  })
})

describe('otelMiddleware — tool-message and choice events', () => {
  it('onAfterToolCall emits gen_ai.tool.message on iteration span with redacted result', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({
      tracer,
      captureContent: true,
      redact: (s) => s.replace(/\d+/g, '[NUM]'),
    })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-1', function: { name: 'x' } }),
      tool: undefined,
      args: {},
      toolName: 'x',
      toolCallId: 'tc-1',
    })
    await mw.onAfterToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 'tc-1' }),
      tool: undefined,
      toolName: 'x',
      toolCallId: 'tc-1',
      ok: true,
      duration: 5,
      result: { value: 42 },
    })

    const iter = spans[1]!
    const toolEvt = iter.events.find((e) => e.name === 'gen_ai.tool.message')!
    expect(toolEvt.attributes!['content']).toContain('[NUM]')
    expect(toolEvt.attributes!['tool_call_id']).toBe('tc-1')
  })

  it('emits gen_ai.choice event with accumulated assistant text on RUN_FINISHED', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer, captureContent: true })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onChunk?.(ctx, ev.textContent('Hello '))
    await mw.onChunk?.(ctx, ev.textContent('world'))
    await mw.onChunk?.(ctx, { ...ev.runFinished('stop'), model: 'gpt-4o' })

    const iter = spans[1]!
    const choice = iter.events.find((e) => e.name === 'gen_ai.choice')!
    expect(choice.attributes!['content']).toBe('Hello world')
  })
})

describe('otelMiddleware — concurrent isolation', () => {
  it('parallel chat() calls do not cross-contaminate state', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })

    const ctxA = makeCtx({ requestId: 'A' })
    const ctxB = makeCtx({ requestId: 'B' })

    await Promise.all([mw.onStart?.(ctxA), mw.onStart?.(ctxB)])
    ctxA.phase = 'beforeModel'
    ctxB.phase = 'beforeModel'
    await Promise.all([
      mw.onConfig?.(ctxA, { messages: [], systemPrompts: [], tools: [] }),
      mw.onConfig?.(ctxB, { messages: [], systemPrompts: [], tools: [] }),
    ])
    await Promise.all([
      mw.onChunk?.(ctxA, ev.runFinished('stop', 'A')),
      mw.onChunk?.(ctxB, ev.runFinished('tool_calls', 'B')),
    ])
    await Promise.all([
      mw.onFinish?.(ctxA, { finishReason: 'stop', duration: 1, content: '' }),
      mw.onFinish?.(ctxB, {
        finishReason: 'tool_calls',
        duration: 1,
        content: '',
      }),
    ])

    // Total: 2 root spans + 2 iteration spans, all ended.
    expect(spans.filter((s) => s.ended).length).toBe(4)
    const iters = spans.filter((s) => s.parent !== null)
    const reasons = iters.flatMap((s) => {
      const v = s.attributes['gen_ai.response.finish_reasons']
      return Array.isArray(v) ? (v as Array<string>) : []
    })
    expect(reasons).toEqual(expect.arrayContaining(['stop', 'tool_calls']))
  })
})

describe('otelMiddleware — extension points', () => {
  it('spanNameFormatter overrides default names for chat, iteration, and tool', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({
      tracer,
      spanNameFormatter: (info) => {
        if (info.kind === 'chat') return 'my-chat'
        if (info.kind === 'iteration') return `iter-${info.iteration}`
        if (info.kind === 'tool') return `tool-${info.toolName}`
        return `generation-${info.ctx.activity}`
      },
    })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 't-1', function: { name: 'lookup' } }),
      tool: undefined,
      args: {},
      toolName: 'lookup',
      toolCallId: 't-1',
    })

    expect(spans[0]!.name).toBe('my-chat')
    expect(spans[1]!.name).toBe('iter-0')
    expect(spans[2]!.name).toBe('tool-lookup')
  })

  it('attributeEnricher merges attributes onto chat, iteration, and tool spans', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({
      tracer,
      attributeEnricher: (info) => ({ 'test.kind': info.kind }),
    })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 't-1', function: { name: 'lookup' } }),
      tool: undefined,
      args: {},
      toolName: 'lookup',
      toolCallId: 't-1',
    })

    expect(spans[0]!.attributes['test.kind']).toBe('chat')
    expect(spans[1]!.attributes['test.kind']).toBe('iteration')
    expect(spans[2]!.attributes['test.kind']).toBe('tool')
  })

  it('onBeforeSpanStart can mutate SpanOptions before startSpan for every kind', async () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({
      tracer,
      onBeforeSpanStart: (info, options) => ({
        ...options,
        attributes: {
          ...(options.attributes ?? {}),
          'custom.kind': info.kind,
        },
      }),
    })
    const ctx = makeCtx({ hasTools: true })

    await runToIterationStart(mw, ctx)
    await mw.onBeforeToolCall?.(ctx, {
      toolCall: makeToolCall({ id: 't-1', function: { name: 'x' } }),
      tool: undefined,
      args: {},
      toolName: 'x',
      toolCallId: 't-1',
    })

    expect(spans[0]!.attributes['custom.kind']).toBe('chat')
    expect(spans[1]!.attributes['custom.kind']).toBe('iteration')
    expect(spans[2]!.attributes['custom.kind']).toBe('tool')
  })

  it('onSpanEnd fires before span.end()', async () => {
    const { tracer } = createFakeTracer()
    const seen: Array<{ kind: string; ended: boolean }> = []
    const mw = otelMiddleware({
      tracer,
      onSpanEnd: (info, span) => {
        seen.push({ kind: info.kind, ended: (span as FakeSpan).ended })
      },
    })
    const ctx = makeCtx()

    await runToIterationStart(mw, ctx)
    await mw.onChunk?.(ctx, ev.runFinished('stop'))
    await mw.onFinish?.(ctx, { finishReason: 'stop', duration: 1, content: '' })

    expect(seen.map((s) => s.kind)).toEqual(['iteration', 'chat'])
    expect(seen.every((s) => s.ended === false)).toBe(true)
  })

  describe('callback resilience', () => {
    let warn: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warn.mockRestore()
    })

    it('a throwing user callback does not break the run and is logged', async () => {
      const { tracer, spans } = createFakeTracer()
      const mw = otelMiddleware({
        tracer,
        attributeEnricher: () => {
          throw new Error('boom')
        },
      })
      const ctx = makeCtx()

      await mw.onStart?.(ctx)
      await mw.onFinish?.(ctx, {
        finishReason: 'stop',
        duration: 1,
        content: '',
      })

      expect(spans[0]!.ended).toBe(true)
      expect(warn).toHaveBeenCalled()
      // Label identifies the failing hook for diagnosis.
      const call = warn.mock.calls.find((args: Array<unknown>) =>
        String(args[0]).includes('otel.attributeEnricher'),
      )
      expect(call).toBeDefined()
    })
  })
})

describe('otelMiddleware — media activities', () => {
  it('opens a CLIENT span with gen_ai attributes on start', () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })

    mw.onStart?.(makeGenCtx())

    expect(spans).toHaveLength(1)
    const span = spans[0]!
    expect(span.kind).toBe(SpanKind.CLIENT)
    expect(span.name).toBe('image_generation gpt-image-1')
    expect(span.attributes['gen_ai.system']).toBe('openai')
    expect(span.attributes['gen_ai.operation.name']).toBe('image_generation')
    expect(span.attributes['gen_ai.request.model']).toBe('gpt-image-1')
    expect(span.ended).toBe(false)
  })

  it('maps each media activity to the right gen_ai.operation.name', () => {
    const cases: Array<[GenerationActivity, string]> = [
      ['image', 'image_generation'],
      ['video', 'video_generation'],
      ['audio', 'audio_generation'],
      ['tts', 'text_to_speech'],
      ['transcription', 'transcription'],
    ]
    for (const [activity, operation] of cases) {
      const { tracer, spans } = createFakeTracer()
      const mw = otelMiddleware({ tracer })
      mw.onStart?.(makeGenCtx({ activity }))
      expect(spans[0]!.attributes['gen_ai.operation.name']).toBe(operation)
    }
  })

  it('attaches usage attributes, ends the span, and records duration on finish', () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeGenCtx()
    const usage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      unitsBilled: 1,
      cost: 0.04,
    }

    mw.onStart?.(ctx)
    mw.onUsage?.(ctx, usage)
    mw.onFinish?.(ctx, { duration: 1500, usage })

    const span = spans[0]!
    expect(span.ended).toBe(true)
    expect(span.attributes['gen_ai.usage.cost']).toBe(0.04)
    expect(span.attributes['tanstack.ai.usage.units_billed']).toBe(1)

    // Media records the duration histogram but NOT the chat token histogram.
    expect(records).toHaveLength(1)
    expect(records[0]!.name).toBe('gen_ai.client.operation.duration')
    expect(records[0]!.value).toBe(1.5)
    expect(records[0]!.attributes?.['gen_ai.operation.name']).toBe(
      'image_generation',
    )
  })

  it('finishes cleanly when no usage is reported', () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctx = makeGenCtx({ activity: 'video', model: 'sora-2' })

    mw.onStart?.(ctx)
    mw.onFinish?.(ctx, { duration: 10 })

    expect(spans[0]!.ended).toBe(true)
    expect(spans[0]!.attributes['gen_ai.usage.cost']).toBeUndefined()
  })

  it('records the exception, ERROR status, and error.type on error', () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeGenCtx()

    mw.onStart?.(ctx)
    const error = new TypeError('boom')
    mw.onError?.(ctx, { error, duration: 200 })

    const span = spans[0]!
    expect(span.ended).toBe(true)
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
    expect(span.status.message).toBe('boom')
    expect(span.exceptions[0]!.exception).toBe(error)
    expect(records[0]!.attributes?.['error.type']).toBe('TypeError')
  })

  it('ends the span as cancelled on abort (e.g. an abandoned video stream)', () => {
    const { tracer, spans } = createFakeTracer()
    const { meter, records } = createFakeMeter()
    const mw = otelMiddleware({ tracer, meter })
    const ctx = makeGenCtx({ activity: 'video', model: 'sora-2' })

    mw.onStart?.(ctx)
    mw.onAbort?.(ctx, { reason: 'stream abandoned', duration: 50 })

    const span = spans[0]!
    expect(span.ended).toBe(true)
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
    expect(span.status.message).toBe('stream abandoned')
    expect(span.attributes['tanstack.ai.completion.reason']).toBe('cancelled')
    expect(records[0]!.attributes?.['error.type']).toBe('cancelled')
  })

  it('keys spans by the context object so concurrent calls do not collide', () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({ tracer })
    const ctxA = makeGenCtx({ model: 'model-a' })
    const ctxB = makeGenCtx({ model: 'model-b' })

    mw.onStart?.(ctxA)
    mw.onStart?.(ctxB)
    // Finish B first — must end the model-b span, not model-a.
    mw.onFinish?.(ctxB, { duration: 5 })

    const spanA = spans.find(
      (s) => s.attributes['gen_ai.request.model'] === 'model-a',
    )!
    const spanB = spans.find(
      (s) => s.attributes['gen_ai.request.model'] === 'model-b',
    )!
    expect(spanB.ended).toBe(true)
    expect(spanA.ended).toBe(false)
  })

  it('applies spanNameFormatter and attributeEnricher for the generation kind', () => {
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({
      tracer,
      spanNameFormatter: (info) =>
        info.kind === 'generation' ? `custom:${info.ctx.activity}` : 'other',
      attributeEnricher: () => ({ 'app.tenant': 'acme' }),
    })

    mw.onStart?.(makeGenCtx())
    expect(spans[0]!.name).toBe('custom:image')
    expect(spans[0]!.attributes['app.tenant']).toBe('acme')
  })

  it('keeps the span when a formatter throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { tracer, spans } = createFakeTracer()
    const mw = otelMiddleware({
      tracer,
      spanNameFormatter: () => {
        throw new Error('formatter broke')
      },
    })

    mw.onStart?.(makeGenCtx())
    // Falls back to the default name instead of losing the span.
    expect(spans).toHaveLength(1)
    expect(spans[0]!.name).toBe('image_generation gpt-image-1')
    warn.mockRestore()
  })
})

describe('usageAttributes', () => {
  it('emits guarded media + cost fields, omitting absent ones', () => {
    const usage: TokenUsage = {
      promptTokens: 10,
      completionTokens: 0,
      totalTokens: 10,
      durationSeconds: 12.5,
      unitsBilled: 3,
    }
    const attrs = usageAttributes(usage)

    expect(attrs['gen_ai.usage.input_tokens']).toBe(10)
    expect(attrs['tanstack.ai.usage.duration_seconds']).toBe(12.5)
    expect(attrs['tanstack.ai.usage.units_billed']).toBe(3)
    // No cost reported → key absent.
    expect('gen_ai.usage.cost' in attrs).toBe(false)
  })
})
