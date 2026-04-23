import type {
  AttributeValue,
  Meter,
  Span,
  SpanOptions,
  Tracer,
} from '@opentelemetry/api'
import { context as otelContext, trace as otelTrace, SpanStatusCode } from '@opentelemetry/api'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../activities/chat/middleware/types'

export type OtelSpanKind = 'chat' | 'iteration' | 'tool'

export interface OtelSpanInfo<K extends OtelSpanKind = OtelSpanKind> {
  kind: K
  ctx: ChatMiddlewareContext
  toolName?: string
  toolCallId?: string
  iteration?: number
}

export interface OtelMiddlewareOptions {
  tracer: Tracer
  meter?: Meter
  captureContent?: boolean
  redact?: (text: string) => string
  serviceName?: string
  spanNameFormatter?: (info: OtelSpanInfo) => string
  attributeEnricher?: (info: OtelSpanInfo) => Record<string, AttributeValue>
  onBeforeSpanStart?: (info: OtelSpanInfo, options: SpanOptions) => SpanOptions
  onSpanEnd?: (info: OtelSpanInfo, span: Span) => void
}

interface RequestState {
  rootSpan: Span
  currentIterationSpan: Span | null
  toolSpans: Map<string, Span>
  iterationCount: number
  assistantTextBuffer: string
  startTime: number
}

const stateByCtx = new WeakMap<ChatMiddlewareContext, RequestState>()

function safeCall<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn()
  } catch (err) {
    void err
    void label
    return undefined
  }
}

export function otelMiddleware(
  options: OtelMiddlewareOptions,
): ChatMiddleware {
  const {
    tracer,
    meter,
    captureContent: _captureContent = false,
    redact: _redact = (s) => s,
    serviceName: _serviceName = 'tanstack-ai',
    spanNameFormatter,
    attributeEnricher,
    onBeforeSpanStart,
    onSpanEnd,
  } = options

  const durationHistogram = meter?.createHistogram(
    'gen_ai.client.operation.duration',
    {
      description: 'GenAI client operation duration',
      unit: 's',
    },
  )
  const tokenHistogram = meter?.createHistogram(
    'gen_ai.client.token.usage',
    {
      description: 'GenAI client token usage',
      unit: '{token}',
    },
  )
  return {
    name: 'otel',

    onStart(ctx) {
      safeCall('otel.onStart', () => {
        const info: OtelSpanInfo<'chat'> = { kind: 'chat', ctx }
        const name = safeCall('otel.spanNameFormatter', () => spanNameFormatter?.(info)) ?? `chat ${ctx.model}`
        const baseOptions: SpanOptions = {
          attributes: {
            'gen_ai.system': ctx.provider,
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': ctx.model,
          },
        }
        const spanOptions = safeCall('otel.onBeforeSpanStart', () => onBeforeSpanStart?.(info, baseOptions)) ?? baseOptions
        const rootSpan = tracer.startSpan(name, spanOptions)

        const enriched = safeCall('otel.attributeEnricher', () => attributeEnricher?.(info))
        if (enriched) rootSpan.setAttributes(enriched)

        stateByCtx.set(ctx, {
          rootSpan,
          currentIterationSpan: null,
          toolSpans: new Map(),
          iterationCount: 0,
          assistantTextBuffer: '',
          startTime: Date.now(),
        })
      })
    },

    onConfig(ctx, config) {
      if (ctx.phase !== 'beforeModel') return
      safeCall('otel.onConfig', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        // Close any previously open iteration span (defensive — shouldn't normally be open
        // here because onChunk(RUN_FINISHED) closes it, but guard against adapter quirks).
        if (state.currentIterationSpan) {
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.({ kind: 'iteration', ctx, iteration: state.iterationCount - 1 }, state.currentIterationSpan!),
          )
          state.currentIterationSpan.end()
          state.currentIterationSpan = null
        }

        const info: OtelSpanInfo<'iteration'> = { kind: 'iteration', ctx, iteration: ctx.iteration }
        const name = safeCall('otel.spanNameFormatter', () => spanNameFormatter?.(info)) ?? `chat ${ctx.model}`

        const baseAttrs: Record<string, AttributeValue> = {
          'gen_ai.system': ctx.provider,
          'gen_ai.operation.name': 'chat',
          'gen_ai.request.model': ctx.model,
          'tanstack.ai.iteration': ctx.iteration,
        }
        if (config.temperature !== undefined) baseAttrs['gen_ai.request.temperature'] = config.temperature
        if (config.topP !== undefined) baseAttrs['gen_ai.request.top_p'] = config.topP
        if (config.maxTokens !== undefined) baseAttrs['gen_ai.request.max_tokens'] = config.maxTokens

        const baseOptions: SpanOptions = { attributes: baseAttrs }
        const spanOptions = safeCall('otel.onBeforeSpanStart', () => onBeforeSpanStart?.(info, baseOptions)) ?? baseOptions

        let iterSpan!: Span
        otelContext.with(otelTrace.setSpan(otelContext.active(), state.rootSpan), () => {
          iterSpan = tracer.startSpan(name, spanOptions)
        })
        // Fake-tracer test visibility: explicit parent pointer. In real OTel this is a
        // no-op field write; the actual parent-child relationship is established via the
        // active context above.
        ;(iterSpan as unknown as { parent?: Span }).parent = state.rootSpan

        const enriched = safeCall('otel.attributeEnricher', () => attributeEnricher?.(info))
        if (enriched) iterSpan.setAttributes(enriched)

        state.currentIterationSpan = iterSpan
        state.iterationCount += 1
      })
      return undefined
    },

    onChunk(ctx, chunk) {
      safeCall('otel.onChunk', () => {
        if (chunk.type !== 'RUN_FINISHED') return
        const state = stateByCtx.get(ctx)
        if (!state || !state.currentIterationSpan) return
        const span = state.currentIterationSpan
        if (chunk.finishReason) {
          span.setAttribute('gen_ai.response.finish_reasons', [chunk.finishReason])
        }
        if (chunk.model) span.setAttribute('gen_ai.response.model', chunk.model)

        safeCall('otel.onSpanEnd', () =>
          onSpanEnd?.({ kind: 'iteration', ctx, iteration: state.iterationCount - 1 }, span),
        )
        span.end()
        state.currentIterationSpan = null
      })
      return undefined
    },

    onUsage(ctx, usage) {
      safeCall('otel.onUsage', () => {
        const state = stateByCtx.get(ctx)
        if (!state || !state.currentIterationSpan) return

        state.currentIterationSpan.setAttributes({
          'gen_ai.usage.input_tokens': usage.promptTokens,
          'gen_ai.usage.output_tokens': usage.completionTokens,
        })

        if (tokenHistogram) {
          const metricAttrs = {
            'gen_ai.system': ctx.provider,
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': ctx.model,
          }
          tokenHistogram.record(usage.promptTokens, { ...metricAttrs, 'gen_ai.token.type': 'input' })
          tokenHistogram.record(usage.completionTokens, { ...metricAttrs, 'gen_ai.token.type': 'output' })
        }
      })
    },

    onBeforeToolCall(ctx, hookCtx) {
      safeCall('otel.onBeforeToolCall', () => {
        const state = stateByCtx.get(ctx)
        if (!state || !state.currentIterationSpan) return

        const info: OtelSpanInfo<'tool'> = {
          kind: 'tool',
          ctx,
          toolName: hookCtx.toolName,
          toolCallId: hookCtx.toolCallId,
          iteration: state.iterationCount - 1,
        }
        const name = safeCall('otel.spanNameFormatter', () => spanNameFormatter?.(info)) ?? `execute_tool ${hookCtx.toolName}`

        const baseAttrs: Record<string, AttributeValue> = {
          'gen_ai.tool.name': hookCtx.toolName,
          'gen_ai.tool.call.id': hookCtx.toolCallId,
          'gen_ai.tool.type': 'function',
        }
        const baseOptions: SpanOptions = { attributes: baseAttrs }
        const spanOptions = safeCall('otel.onBeforeSpanStart', () => onBeforeSpanStart?.(info, baseOptions)) ?? baseOptions

        let toolSpan!: Span
        otelContext.with(otelTrace.setSpan(otelContext.active(), state.currentIterationSpan), () => {
          toolSpan = tracer.startSpan(name, spanOptions)
        })
        ;(toolSpan as unknown as { parent?: Span }).parent = state.currentIterationSpan

        const enriched = safeCall('otel.attributeEnricher', () => attributeEnricher?.(info))
        if (enriched) toolSpan.setAttributes(enriched)

        state.toolSpans.set(hookCtx.toolCallId, toolSpan)
      })
      return undefined
    },

    onAfterToolCall(ctx, info) {
      safeCall('otel.onAfterToolCall', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return
        const toolSpan = state.toolSpans.get(info.toolCallId)
        if (!toolSpan) return

        const outcome = info.ok ? 'success' : 'error'
        toolSpan.setAttribute('tanstack.ai.tool.outcome', outcome)

        if (!info.ok && info.error !== undefined) {
          toolSpan.recordException(info.error as Error)
          toolSpan.setStatus({ code: SpanStatusCode.ERROR, message: (info.error as Error)?.message })
        }

        safeCall('otel.onSpanEnd', () =>
          onSpanEnd?.(
            { kind: 'tool', ctx, toolName: info.toolName, toolCallId: info.toolCallId, iteration: state.iterationCount - 1 },
            toolSpan,
          ),
        )
        toolSpan.end()
        state.toolSpans.delete(info.toolCallId)
      })
    },

    onError(ctx, info) {
      safeCall('otel.onError', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        const errType = (info.error as { name?: string } | undefined)?.name ?? 'Error'
        const message = (info.error as { message?: string } | undefined)?.message

        // Close iteration span (if open) with ERROR.
        if (state.currentIterationSpan) {
          state.currentIterationSpan.recordException(info.error as Error)
          state.currentIterationSpan.setStatus({ code: SpanStatusCode.ERROR, message })
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.({ kind: 'iteration', ctx, iteration: state.iterationCount - 1 }, state.currentIterationSpan!),
          )
          state.currentIterationSpan.end()
          state.currentIterationSpan = null
        }

        // Close any open tool spans as errored.
        for (const [id, span] of state.toolSpans) {
          span.recordException(info.error as Error)
          span.setStatus({ code: SpanStatusCode.ERROR, message })
          span.end()
          state.toolSpans.delete(id)
        }

        state.rootSpan.recordException(info.error as Error)
        state.rootSpan.setStatus({ code: SpanStatusCode.ERROR, message })

        if (durationHistogram) {
          durationHistogram.record(info.duration / 1000, {
            'gen_ai.system': ctx.provider,
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': ctx.model,
            'gen_ai.response.model': ctx.model,
            'error.type': errType,
          })
        }

        safeCall('otel.onSpanEnd', () => onSpanEnd?.({ kind: 'chat', ctx }, state.rootSpan))
        state.rootSpan.end()
        stateByCtx.delete(ctx)
      })
    },

    onAbort(ctx, _info) {
      safeCall('otel.onAbort', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        const closeCancelled = (span: Span) => {
          span.setAttribute('gen_ai.completion.reason', 'cancelled')
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'cancelled' })
        }

        if (state.currentIterationSpan) {
          closeCancelled(state.currentIterationSpan)
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.({ kind: 'iteration', ctx, iteration: state.iterationCount - 1 }, state.currentIterationSpan!),
          )
          state.currentIterationSpan.end()
          state.currentIterationSpan = null
        }
        for (const [id, span] of state.toolSpans) {
          closeCancelled(span)
          span.end()
          state.toolSpans.delete(id)
        }
        closeCancelled(state.rootSpan)
        safeCall('otel.onSpanEnd', () => onSpanEnd?.({ kind: 'chat', ctx }, state.rootSpan))
        state.rootSpan.end()
        stateByCtx.delete(ctx)
      })
    },

    onFinish(ctx, info) {
      safeCall('otel.onFinish', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        // Close a dangling iteration span if RUN_FINISHED never arrived (defensive).
        if (state.currentIterationSpan) {
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.({ kind: 'iteration', ctx, iteration: state.iterationCount - 1 }, state.currentIterationSpan!),
          )
          state.currentIterationSpan.end()
          state.currentIterationSpan = null
        }

        if (durationHistogram) {
          durationHistogram.record(info.duration / 1000, {
            'gen_ai.system': ctx.provider,
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': ctx.model,
            'gen_ai.response.model': ctx.model,
          })
        }

        if (info.usage) {
          state.rootSpan.setAttributes({
            'gen_ai.usage.input_tokens': info.usage.promptTokens,
            'gen_ai.usage.output_tokens': info.usage.completionTokens,
          })
        }
        if (info.finishReason) {
          state.rootSpan.setAttribute('gen_ai.response.finish_reasons', [info.finishReason])
        }
        state.rootSpan.setAttribute('tanstack.ai.iterations', state.iterationCount)

        safeCall('otel.onSpanEnd', () => onSpanEnd?.({ kind: 'chat', ctx }, state.rootSpan))
        state.rootSpan.end()
        stateByCtx.delete(ctx)
      })
    },
  }
}
