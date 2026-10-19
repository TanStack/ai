// Tracing without a dependency. These types are a subset of the
// OpenTelemetry `Tracer`, `Span`, and `SpanContext`, so an OpenTelemetry
// tracer fits with no cast and no `@opentelemetry/*` import here.
import type { OperationKind, OperationStatus } from './types'
import { addCounts, emptyCounts } from './usage'
import type { UsageCall, UsageCounts } from './usage'

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
 * A subset of the OpenTelemetry `Context`. The harness passes one to
 * `startSpan` to give a span a parent span on the same host.
 */
export interface HarnessContext {
  getValue: (key: symbol) => unknown
  setValue: (key: symbol, value: unknown) => HarnessContext
  deleteValue: (key: symbol) => HarnessContext
}

/**
 * The tracer that the harness calls: a subset of the OpenTelemetry `Tracer`.
 * Pass `trace.getTracer('my-app')` from `@opentelemetry/api` as it is.
 */
export interface HarnessTracer {
  startSpan: (
    name: string,
    options?: HarnessSpanOptions,
    context?: HarnessContext,
  ) => HarnessSpan
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

// OpenTelemetry keeps the span of a context under this key
// (`createContextKey` makes it with `Symbol.for`).
const SPAN_KEY = Symbol.for('OpenTelemetry Context Key SPAN')

function contextOf(values: ReadonlyMap<symbol, unknown>): HarnessContext {
  return {
    getValue: (key) => values.get(key),
    setValue: (key, value) => contextOf(new Map(values).set(key, value)),
    deleteValue: (key) => {
      const next = new Map(values)
      next.delete(key)
      return contextOf(next)
    },
  }
}

/** A context whose span is `span`: a span started in it is its child. */
export const parentContext = (span: HarnessSpan): HarnessContext =>
  contextOf(new Map([[SPAN_KEY, span]]))

/** What {@link OperationTracing} reads of an operation. */
interface TracedOperation {
  id: string
  kind: OperationKind
  agent?: string | undefined
  status: () => OperationStatus
  then: (
    onfulfilled: (value: unknown) => void,
    onrejected: (reason: unknown) => void,
  ) => unknown
}

/** An operation of this host that did not settle yet. */
interface OpenOperation {
  span: HarnessSpan
  startedAt: number
  usage: UsageCounts
}

/** The message and the `code` of an error, when it has a string code. */
function errorOf(error: unknown): { message: string; code?: string } {
  const message = error instanceof Error ? error.message : String(error)
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined
  return code === undefined ? { message } : { message, code }
}

/**
 * @internal The spans and the `onOperation` reports of one session. A
 * session of a host without `observability` has none, so it allocates
 * nothing.
 */
export class OperationTracing {
  private readonly tracer: HarnessTracer
  private readonly open = new Map<string, OpenOperation>()

  constructor(
    private readonly options: ObservabilityOptions & {
      threadId: string
      tenantId?: string
      /** Logs a listener or a tracer that throws. */
      warn: (error: unknown) => void
    },
  ) {
    this.tracer = options.tracer ?? noopTracer
  }

  /** The attributes of every span of this session, and `extra`. */
  private attributes(extra: Record<string, HarnessAttributeValue | undefined>) {
    const attributes: Record<string, HarnessAttributeValue> = {
      'harness.thread_id': this.options.threadId,
    }
    if (this.options.tenantId !== undefined) {
      attributes['harness.tenant_id'] = this.options.tenantId
    }
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) attributes[key] = value
    }
    return attributes
  }

  /**
   * Start a span `name` of this session. `runId`: the run that it belongs
   * to. When that run is open on this host, the span is its child.
   */
  span(
    name: string,
    extra: Record<string, HarnessAttributeValue | undefined>,
    options: { runId?: string | undefined; startTime?: number } = {},
  ): HarnessSpan {
    const parent =
      options.runId === undefined ? undefined : this.open.get(options.runId)
    return this.tracer.startSpan(
      name,
      {
        attributes: this.attributes(extra),
        ...(options.startTime !== undefined
          ? { startTime: options.startTime }
          : {}),
      },
      parent ? parentContext(parent.span) : undefined,
    )
  }

  /**
   * An operation started on this host. Its `harness.operation` span is a
   * child of the span of its parent run when that run is open on this host.
   * A valid `traceparent` of the caller becomes a link, never the parent:
   * it can come from another machine. The span ends, and `onOperation`
   * gets the report, when the operation settles.
   */
  started(
    operation: TracedOperation,
    run: { parentRunId: string | undefined; traceparent: string | undefined },
  ): void {
    if (this.open.has(operation.id)) return
    const { parentRunId } = run
    const parent =
      parentRunId === undefined ? undefined : this.open.get(parentRunId)
    const caller = parseTraceparent(run.traceparent)
    const startedAt = Date.now()
    const span = this.tracer.startSpan(
      'harness.operation',
      {
        attributes: this.attributes({
          'harness.run_id': operation.id,
          'harness.parent_run_id': parentRunId,
          'harness.operation.kind': operation.kind,
          'harness.agent': operation.agent,
        }),
        ...(caller ? { links: [{ context: caller }] } : {}),
        startTime: startedAt,
      },
      parent ? parentContext(parent.span) : undefined,
    )
    const open: OpenOperation = { span, startedAt, usage: emptyCounts() }
    this.open.set(operation.id, open)
    const report = (): OperationReport['operation'] => ({
      id: operation.id,
      kind: operation.kind,
      ...(operation.agent !== undefined ? { agent: operation.agent } : {}),
      threadId: this.options.threadId,
      ...(this.options.tenantId !== undefined
        ? { tenantId: this.options.tenantId }
        : {}),
      ...(parentRunId !== undefined ? { parentRunId } : {}),
      status: operation.status(),
    })
    this.report({ phase: 'started', operation: report() })
    const settle = (error?: unknown) => {
      this.open.delete(operation.id)
      const status = operation.status()
      const failure = error === undefined ? undefined : errorOf(error)
      span.setAttribute('harness.operation.status', status)
      if (status === 'failed' && failure) {
        span.recordException(error instanceof Error ? error : failure.message)
        span.setStatus({ code: 2, message: failure.message })
      } else if (status !== 'cancelled') {
        span.setStatus({ code: 1 })
      }
      const endedAt = Date.now()
      span.end(endedAt)
      this.report({
        phase: 'settled',
        operation: {
          ...report(),
          durationMs: endedAt - startedAt,
          ...(failure ? { error: failure } : {}),
          usage: open.usage,
        },
      })
    }
    operation.then(
      () => settle(),
      (error: unknown) => settle(error),
    )
  }

  /**
   * One model call of the run `call.runId`. It counts for that run and for
   * each run above it that is open on this host, as the run usage of the
   * log does. `parentOf` gives the parent run of a run.
   */
  usage(call: UsageCall, parentOf: (runId: string) => string | undefined) {
    const seen = new Set<string>()
    let runId = call.runId
    while (runId !== undefined && !seen.has(runId)) {
      seen.add(runId)
      const open = this.open.get(runId)
      if (open) addCounts(open.usage, call.usage)
      runId = parentOf(runId)
    }
  }

  /** Call `onOperation`. A listener that throws is logged and ignored. */
  private report(report: OperationReport) {
    const listener = this.options.onOperation
    if (!listener) return
    try {
      const done = listener(report)
      if (done) done.then(undefined, this.options.warn)
    } catch (error) {
      this.options.warn(error)
    }
  }
}
