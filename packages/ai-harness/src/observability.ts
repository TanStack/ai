// Tracing without a dependency. These types are a subset of the
// OpenTelemetry `Tracer`, `Span`, and `SpanContext`, so an OpenTelemetry
// tracer fits with no cast and no `@opentelemetry/*` import here.
import type { OperationKind, OperationStatus } from './types'
import type { UsageCounts } from './usage'

/** The ids of a span: a subset of the OpenTelemetry `SpanContext`. */
export interface HarnessSpanContext {
  /** 32 lowercase hex characters. */
  traceId: string
  /** 16 lowercase hex characters. */
  spanId: string
  /** Bit 1 is `sampled`. */
  traceFlags: number
  /** True when the context came from another process. */
  isRemote?: boolean
}

/** A value of a span attribute. */
export type HarnessAttributeValue = string | number | boolean

/**
 * The span methods that the harness calls: a subset of the OpenTelemetry
 * `Span`. The methods return `unknown`, so a span that returns `this` fits.
 */
export interface HarnessSpan {
  setAttribute: (key: string, value: HarnessAttributeValue) => unknown
  /** `code`: 0 unset, 1 ok, 2 error, as the OpenTelemetry `SpanStatusCode`. */
  setStatus: (status: { code: 0 | 1 | 2; message?: string }) => unknown
  recordException: (exception: Error | string) => unknown
  /** `endTime` is in epoch milliseconds. */
  end: (endTime?: number) => unknown
  spanContext: () => HarnessSpanContext
}

/** What `startSpan` takes: a subset of the OpenTelemetry `SpanOptions`. */
export interface HarnessSpanOptions {
  attributes?: Record<string, HarnessAttributeValue>
  /** Links to other spans, for example to the `traceparent` of a caller. */
  links?: Array<{ context: HarnessSpanContext }>
  /** Epoch milliseconds. */
  startTime?: number
}

/**
 * The tracer that the harness calls: a subset of the OpenTelemetry `Tracer`.
 * Pass `trace.getTracer('my-app')` from `@opentelemetry/api` as it is.
 */
export interface HarnessTracer {
  startSpan: (name: string, options?: HarnessSpanOptions) => HarnessSpan
}

/** What `onOperation` gets, once when an operation starts and once when it settles. */
export interface OperationReport {
  phase: 'started' | 'settled'
  operation: {
    id: string
    kind: OperationKind
    agent?: string
    threadId: string
    tenantId?: string
    parentRunId?: string
    status: OperationStatus
    /** Only when `phase` is `'settled'`. */
    durationMs?: number
    error?: { message: string; code?: string }
    usage?: UsageCounts
  }
}

/** The `observability` option of a host. */
export interface ObservabilityOptions {
  /** Without a tracer, the harness writes no spans. */
  tracer?: HarnessTracer
  /** A listener that throws is logged and ignored. */
  onOperation?: (report: OperationReport) => void | Promise<void>
}

const ERROR = 2

const NOOP_CONTEXT: HarnessSpanContext = {
  traceId: '0'.repeat(32),
  spanId: '0'.repeat(16),
  traceFlags: 0,
}

// One shared span, so a host without a tracer allocates nothing per span.
const noopSpan: HarnessSpan = {
  setAttribute: () => noopSpan,
  setStatus: () => noopSpan,
  recordException: () => {},
  end: () => {},
  spanContext: () => NOOP_CONTEXT,
}

/** The tracer of a host without `observability.tracer`. It does nothing. */
export const noopTracer: HarnessTracer = { startSpan: () => noopSpan }

/**
 * Run `fn` in a span. The span ends when `fn` settles. When `fn` throws, the
 * span records the error and gets the error status, and the error goes on.
 *
 * @example
 * ```ts
 * const result = await withSpan({ tracer, name: 'harness.recovery' }, () =>
 *   recover(),
 * )
 * ```
 */
export async function withSpan<T>(
  {
    tracer,
    name,
    ...options
  }: { tracer: HarnessTracer; name: string } & HarnessSpanOptions,
  fn: (span: HarnessSpan) => T | PromiseLike<T>,
): Promise<T> {
  const span = tracer.startSpan(name, options)
  try {
    return await fn(span)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    span.recordException(error instanceof Error ? error : message)
    span.setStatus({ code: ERROR, message })
    throw error
  } finally {
    span.end()
  }
}

const TRACEPARENT =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/

/**
 * Read a W3C `traceparent` header value. Returns `undefined` for a value
 * that is not valid, as the W3C rules say: the caller then starts a new
 * trace.
 *
 * @example
 * ```ts
 * parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')
 * // { traceId: '4bf9…', spanId: '00f0…', traceFlags: 1, isRemote: true }
 * ```
 */
export function parseTraceparent(
  value: unknown,
): HarnessSpanContext | undefined {
  if (typeof value !== 'string') return undefined
  const match = TRACEPARENT.exec(value)
  if (!match) return undefined
  const [, version, traceId = '', spanId = '', flags = '', rest] = match
  // Version `ff` is not valid. Version `00` has exactly four fields. A later
  // version can add fields after the four that we read.
  if (version === 'ff' || (version === '00' && rest !== undefined))
    return undefined
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return undefined
  return {
    traceId: traceId,
    spanId: spanId,
    traceFlags: parseInt(flags, 16),
    isRemote: true,
  }
}

/** The W3C `traceparent` header value of a span context. */
export function traceparentOf(context: HarnessSpanContext): string {
  const flags = (context.traceFlags & 0xff).toString(16).padStart(2, '0')
  return `00-${context.traceId}-${context.spanId}-${flags}`
}
