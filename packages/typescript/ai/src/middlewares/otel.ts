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
    tracer: _tracer,
    meter,
    captureContent: _captureContent = false,
    redact: _redact = (s) => s,
    serviceName: _serviceName = 'tanstack-ai',
    spanNameFormatter: _spanNameFormatter,
    attributeEnricher: _attributeEnricher,
    onBeforeSpanStart: _onBeforeSpanStart,
    onSpanEnd: _onSpanEnd,
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

  return {
    name: 'otel',
  }
}
