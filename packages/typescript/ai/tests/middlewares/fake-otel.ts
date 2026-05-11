import type {
  Attributes,
  AttributeValue,
  Context,
  Histogram,
  MetricOptions,
  Meter,
  Span,
  SpanContext,
  SpanOptions,
  SpanStatus,
  TimeInput,
  Tracer,
} from '@opentelemetry/api'
import { SpanStatusCode, trace as otelTrace } from '@opentelemetry/api'
import type { ChatMiddlewareContext } from '../../src/activities/chat/middleware/types'
import type { ToolCall } from '../../src/types'

export interface RecordedEvent {
  name: string
  attributes?: Attributes
}

export interface RecordedException {
  exception: unknown
  attributes?: Attributes
}

export interface FakeSpan extends Span {
  name: string
  kind?: number
  parent?: FakeSpan | null
  startTimeMs: number
  endTimeMs: number | null
  attributes: Record<string, AttributeValue>
  events: Array<RecordedEvent>
  exceptions: Array<RecordedException>
  status: SpanStatus
  ended: boolean
}

export interface HistogramRecord {
  name: string
  value: number
  attributes?: Attributes
  options?: MetricOptions
}

export interface FakeMeter {
  meter: Meter
  records: Array<HistogramRecord>
}

export interface FakeTracer {
  tracer: Tracer
  spans: Array<FakeSpan>
  activeStack: Array<FakeSpan>
}

function makeSpan(
  name: string,
  options: SpanOptions,
  parent: FakeSpan | null,
): FakeSpan {
  const spanId = `fake-span-${Math.random().toString(36).slice(2, 10)}`
  const span: FakeSpan = {
    name,
    kind: options.kind,
    parent,
    startTimeMs: Date.now(),
    endTimeMs: null,
    attributes: Object.fromEntries(
      Object.entries(options.attributes ?? {}).filter(
        ([, v]) => v !== undefined,
      ),
    ) as Record<string, AttributeValue>,
    events: [],
    exceptions: [],
    status: { code: SpanStatusCode.UNSET },
    ended: false,
    spanContext(): SpanContext {
      return {
        traceId: 'fake-trace',
        spanId,
        traceFlags: 1,
      }
    },
    setAttribute(key, value) {
      this.attributes[key] = value as AttributeValue
      return this
    },
    setAttributes(attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        this.attributes[k] = v as AttributeValue
      }
      return this
    },
    addEvent(name, attrs) {
      this.events.push({ name, attributes: attrs as Attributes | undefined })
      return this
    },
    addLink() {
      return this
    },
    addLinks() {
      return this
    },
    setStatus(status) {
      this.status = status
      return this
    },
    updateName(n) {
      this.name = n
      return this
    },
    end(_endTime?: TimeInput) {
      this.endTimeMs = Date.now()
      this.ended = true
    },
    isRecording() {
      return !this.ended
    },
    recordException(exception, attrs) {
      this.exceptions.push({
        exception,
        attributes: attrs as Attributes | undefined,
      })
    },
  }
  return span
}

export function createFakeTracer(): FakeTracer {
  const spans: Array<FakeSpan> = []
  const activeStack: Array<FakeSpan> = []

  const tracer: Tracer = {
    startSpan(name, options = {}, ctx?: Context) {
      // Resolve parent in this order:
      // 1. Explicit `ctx` argument (how `otelMiddleware` passes the parent)
      // 2. Fallback to the activeStack (for `startActiveSpan` callers)
      let parent: FakeSpan | null = null
      if (ctx) {
        const fromCtx = otelTrace.getSpan(ctx)
        if (fromCtx && (fromCtx as FakeSpan).startTimeMs !== undefined) {
          parent = fromCtx as FakeSpan
        }
      }
      if (!parent) parent = activeStack[activeStack.length - 1] ?? null
      const span = makeSpan(name, options, parent)
      spans.push(span)
      return span
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startActiveSpan(...args: any[]) {
      const name = args[0] as string
      const fn = args[args.length - 1] as (span: Span) => unknown
      const options = (
        typeof args[1] === 'object' &&
        args[1] !== null &&
        !('traceId' in args[1])
          ? args[1]
          : {}
      ) as SpanOptions
      const parent = activeStack[activeStack.length - 1] ?? null
      const span = makeSpan(name, options, parent)
      spans.push(span)
      activeStack.push(span)
      try {
        return fn(span)
      } finally {
        activeStack.pop()
      }
    },
  }

  return { tracer, spans, activeStack }
}

export function createFakeMeter(): FakeMeter {
  const records: Array<HistogramRecord> = []

  const meter: Meter = {
    createHistogram(name: string, options?: MetricOptions): Histogram {
      return {
        record(value: number, attributes?: Attributes) {
          records.push({ name, value, attributes, options })
        },
      }
    },
    createCounter() {
      throw new Error('not implemented in fake')
    },
    createUpDownCounter() {
      throw new Error('not implemented in fake')
    },
    createObservableGauge() {
      throw new Error('not implemented in fake')
    },
    createObservableCounter() {
      throw new Error('not implemented in fake')
    },
    createObservableUpDownCounter() {
      throw new Error('not implemented in fake')
    },
    createGauge() {
      throw new Error('not implemented in fake')
    },
    addBatchObservableCallback() {},
    removeBatchObservableCallback() {},
  } as Meter

  return { meter, records }
}

/**
 * Build a minimal ToolCall for tests. Fills required fields with plausible
 * defaults; overrides take precedence.
 */
export function makeToolCall(
  overrides: { id: string } & Partial<Omit<ToolCall, 'function'>> & {
      function?: Partial<ToolCall['function']>
    },
): ToolCall {
  return {
    id: overrides.id,
    type: overrides.type ?? 'function',
    function: {
      name: overrides.function?.name ?? 'test_tool',
      arguments: overrides.function?.arguments ?? '{}',
    },
    ...(overrides.metadata !== undefined
      ? { metadata: overrides.metadata }
      : {}),
  }
}

/**
 * Build a minimal ChatMiddlewareContext for unit tests. Only fields the
 * otel middleware reads need realistic values; others can be placeholders.
 */
export function makeCtx(
  overrides: Partial<ChatMiddlewareContext> = {},
): ChatMiddlewareContext {
  const base = {
    requestId: 'req-1',
    streamId: 'stream-1',
    phase: 'init' as const,
    iteration: 0,
    chunkIndex: 0,
    abort: () => {},
    context: undefined,
    defer: () => {},
    provider: 'openai',
    model: 'gpt-4o',
    source: 'server' as const,
    streaming: true,
    systemPrompts: [],
    options: {},
    modelOptions: {},
    messageCount: 1,
    hasTools: false,
    currentMessageId: null,
    accumulatedContent: '',
    messages: [],
    createId: (prefix: string) => `${prefix}-1`,
  }
  return {
    ...base,
    ...overrides,
  } as ChatMiddlewareContext
}
