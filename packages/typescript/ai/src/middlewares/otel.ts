import type {
  AttributeValue,
  Meter,
  Span,
  SpanOptions,
  Tracer,
} from '@opentelemetry/api'
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

  const _durationHistogram = meter?.createHistogram(
    'gen_ai.client.operation.duration',
    {
      description: 'GenAI client operation duration',
      unit: 's',
    },
  )
  const _tokenHistogram = meter?.createHistogram(
    'gen_ai.client.token.usage',
    {
      description: 'GenAI client token usage',
      unit: '{token}',
    },
  )
  void _durationHistogram; void _tokenHistogram

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

    onFinish(ctx, _info) {
      safeCall('otel.onFinish', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return
        safeCall('otel.onSpanEnd', () => onSpanEnd?.({ kind: 'chat', ctx }, state.rootSpan))
        state.rootSpan.end()
        stateByCtx.delete(ctx)
      })
    },
  }
}
