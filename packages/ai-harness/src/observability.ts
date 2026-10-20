// Tracing with the OpenTelemetry API. `@opentelemetry/api` is an optional
// peer: the types are type-only imports, and the runtime is loaded only when a
// host has a tracer (see `OperationTracing.ready`).
import { addCounts, emptyCounts } from './usage'
import type {
  Attributes,
  Context,
  ContextAPI,
  Span,
  SpanContext,
  SpanOptions,
  TraceAPI,
  Tracer,
} from '@opentelemetry/api'
import type { OperationKind, OperationStatus } from './types'
import type { UsageCall, UsageCounts } from './usage'

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
  /**
   * An OpenTelemetry tracer, for example `trace.getTracer('my-app')`.
   * Without a tracer, the harness writes no spans.
   */
  tracer?: Tracer
  /** A listener that throws is logged and ignored. */
  onOperation?: (report: OperationReport) => void | Promise<void>
}

/** The `SpanStatusCode` values, without a runtime import of the enum. */
const OK = 1
const ERROR = 2

const NOOP_CONTEXT: SpanContext = {
  traceId: '0'.repeat(32),
  spanId: '0'.repeat(16),
  traceFlags: 0,
}

// One shared span, so a host without a tracer allocates nothing per span.
const noopSpan: Span = {
  setAttribute: () => noopSpan,
  setAttributes: () => noopSpan,
  addEvent: () => noopSpan,
  addLink: () => noopSpan,
  addLinks: () => noopSpan,
  setStatus: () => noopSpan,
  updateName: () => noopSpan,
  end: () => {},
  isRecording: () => false,
  recordException: () => {},
  spanContext: () => NOOP_CONTEXT,
}

/** The tracer of a host without `observability.tracer`. It does nothing. */
export const noopTracer: Pick<Tracer, 'startSpan'> = {
  startSpan: () => noopSpan,
}

let otel: { trace: TraceAPI; context: ContextAPI } | undefined

/**
 * Load `@opentelemetry/api` once, for a host with a tracer. The harness
 * needs it only to make the context of a parent span. Without the package,
 * spans have no parent on this host.
 */
async function loadOpenTelemetry(): Promise<void> {
  otel ??= await import('@opentelemetry/api').catch(() => undefined)
}

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
  }: { tracer: Pick<Tracer, 'startSpan'>; name: string } & SpanOptions,
  fn: (span: Span) => T | PromiseLike<T>,
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
export function parseTraceparent(value: unknown): SpanContext | undefined {
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

/** A context whose span is `span`: a span started in it is its child. */
const parentContext = (span: Span | undefined): Context | undefined =>
  span && otel ? otel.trace.setSpan(otel.context.active(), span) : undefined

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
  span: Span
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
  private readonly tracer: Pick<Tracer, 'startSpan'>
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

  /** Load what the tracer needs. A session awaits it before its first span. */
  async ready(): Promise<void> {
    if (this.options.tracer) await loadOpenTelemetry()
  }

  /**
   * Run the tracer or span calls `fn`. A tracer that throws is logged, so a
   * tracing bug never fails a run or the host.
   */
  safely(fn: () => void): void {
    try {
      fn()
    } catch (error) {
      this.options.warn(error)
    }
  }

  /** Start a span. A tracer that throws gives a span that does nothing. */
  private startSpan(name: string, options: SpanOptions, parent?: Span): Span {
    let span = noopSpan
    this.safely(() => {
      span = this.tracer.startSpan(name, options, parentContext(parent))
    })
    return span
  }

  /** The attributes of every span of this session, and `extra`. */
  private attributes(extra: Attributes) {
    const attributes: Attributes = {
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
    extra: Attributes,
    options: { runId?: string | undefined; startTime?: number } = {},
  ): Span {
    const parent =
      options.runId === undefined ? undefined : this.open.get(options.runId)
    return this.startSpan(
      name,
      {
        attributes: this.attributes(extra),
        ...(options.startTime !== undefined
          ? { startTime: options.startTime }
          : {}),
      },
      parent?.span,
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
    const span = this.startSpan(
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
      parent?.span,
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
      const endedAt = Date.now()
      this.safely(() => {
        span.setAttribute('harness.operation.status', status)
        if (status === 'failed' && failure) {
          span.recordException(error instanceof Error ? error : failure.message)
          span.setStatus({ code: ERROR, message: failure.message })
        } else if (status !== 'cancelled') {
          span.setStatus({ code: OK })
        }
        span.end(endedAt)
      })
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
