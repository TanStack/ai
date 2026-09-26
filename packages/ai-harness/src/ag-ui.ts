/**
 * `@tanstack/ai-harness/ag-ui` — the AG-UI bridge.
 *
 * A harness session already streams AG-UI events: `session.events()` yields
 * {@link SessionEvent}s whose `event` is a `StreamChunk`, and a `StreamChunk`
 * is an AG-UI protocol event (`@tanstack/ai` builds on `@ag-ui/core`). This
 * module is the thin, documented seam an AG-UI client consumes:
 *
 * - {@link sessionEventsToAgUi} — normalize a session's `SessionEvent` stream
 *   into a pure AG-UI event stream (usage surfaced under a documented metadata
 *   key, optional live-spend `CUSTOM` events, optional dropping of the
 *   harness-native `CUSTOM` control events).
 * - {@link createAgUiHandler} — a `fetch` handler that a bare `@ag-ui/client`
 *   `HttpAgent` can point at. It accepts a `RunAgentInput` (prompt or resume)
 *   and streams AG-UI events as SSE via `@ag-ui/encoder`'s `EventEncoder`.
 *
 * The AG-UI wire is pinned: this bridge is built and tested against
 * `@ag-ui/core@1.0.0`, `@ag-ui/encoder@1.0.0`, and `@ag-ui/client@1.0.0`.
 * Track that pin deliberately when the spec moves (see `docs/harness/ag-ui.md`).
 *
 * Approvals: a harness turn that stops for outside input finishes with a
 * `RUN_FINISHED` whose `outcome.type === 'interrupt'`. An AG-UI client answers
 * by starting a new run whose `RunAgentInput.resume` entries reference the
 * interrupt ids. This does not replace the harness-native approval path (the
 * CLI and the relay dashboard keep using `session.resolve` / the control tier);
 * it is the AG-UI-shaped view of the same thing.
 */
import { EventEncoder } from '@ag-ui/encoder'
import { EventType, chatParamsFromRequestBody } from '@tanstack/ai'
import { HARNESS_EVENTS } from './types'
import type { BaseEvent } from '@ag-ui/core'
import type { StreamChunk } from '@tanstack/ai'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'
import type { HarnessSession } from './session'
import type { Authorize } from './http'
import type { Principal, SessionEvent } from './types'

/** The `metadata.tanstack` namespace carries TanStack extras on AG-UI events. */
export const TANSTACK_METADATA_NAMESPACE = 'tanstack'

/**
 * The `CUSTOM` event name for an interim live-spend tick. Emitted by
 * {@link sessionEventsToAgUi} when `emitSpendEvents` is on. Its `value` is a
 * {@link SpendSnapshot}. Interim by design: the AG-UI spec has no first-class
 * spend event yet, so this rides `CUSTOM` (see the spec's event-mapping table).
 */
export const TANSTACK_SPEND_EVENT = 'tanstack.spend'

/** A normalized token-usage rollup, provider-agnostic. */
export interface NormalizedUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** The payload of a {@link TANSTACK_SPEND_EVENT} `CUSTOM` event. */
export interface SpendSnapshot {
  /** The AG-UI run this tick closes. */
  runId?: string
  threadId?: string
  /** Usage reported by the just-finished run. */
  usage: NormalizedUsage
  /** Running total across every run seen on this stream so far. */
  cumulative: NormalizedUsage
}

const isHarnessCustom = (event: StreamChunk): boolean =>
  event.type === EventType.CUSTOM &&
  typeof (event as { name?: unknown }).name === 'string' &&
  (event as { name: string }).name.startsWith('harness.')

const zeroUsage = (): NormalizedUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const num = (value: unknown): number => (typeof value === 'number' ? value : 0)

/**
 * Normalize AG-UI/TanStack token usage into a single rollup. Accepts the AG-UI
 * spec array (`SpecTokenUsage[]`, `inputTokens`/`outputTokens`) and the
 * TanStack shape (`promptTokens`/`completionTokens`), summing arrays.
 */
export function normalizeUsage(usage: unknown): NormalizedUsage | undefined {
  if (usage == null) return undefined
  const entries = Array.isArray(usage) ? usage : [usage]
  const total = zeroUsage()
  let sawAny = false
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    sawAny = true
    const input = num(entry.inputTokens) || num(entry.promptTokens)
    const output = num(entry.outputTokens) || num(entry.completionTokens)
    const combined = num(entry.totalTokens) || input + output
    total.inputTokens += input
    total.outputTokens += output
    total.totalTokens += combined
  }
  return sawAny ? total : undefined
}

/** Read a RUN_FINISHED event's usage, checking `usage` then `metadata`. */
function usageOf(event: StreamChunk): NormalizedUsage | undefined {
  const record = event as Record<string, unknown>
  const direct = normalizeUsage(record.usage)
  if (direct) return direct
  const metadata = isRecord(record.metadata) ? record.metadata : undefined
  const ns = metadata && isRecord(metadata[TANSTACK_METADATA_NAMESPACE])
    ? (metadata[TANSTACK_METADATA_NAMESPACE] as Record<string, unknown>)
    : undefined
  return ns ? normalizeUsage(ns.usage) : undefined
}

/** Non-destructively set `metadata.tanstack.usage` on a RUN_FINISHED event. */
function withUsageMetadata(
  event: StreamChunk,
  usage: NormalizedUsage,
): StreamChunk {
  const record = event as Record<string, unknown>
  const metadata = isRecord(record.metadata) ? { ...record.metadata } : {}
  const ns = isRecord(metadata[TANSTACK_METADATA_NAMESPACE])
    ? { ...(metadata[TANSTACK_METADATA_NAMESPACE] as object) }
    : {}
  if ((ns as Record<string, unknown>).usage !== undefined) return event
  ;(ns as Record<string, unknown>).usage = usage
  metadata[TANSTACK_METADATA_NAMESPACE] = ns
  return { ...(event as object), metadata } as StreamChunk
}

const addUsage = (a: NormalizedUsage, b: NormalizedUsage): NormalizedUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
})

/** Options for {@link sessionEventsToAgUi}. */
export interface SessionEventsToAgUiOptions {
  /**
   * Keep the harness-native `CUSTOM` control events (`harness.operation.*`,
   * `harness.input.*`, `harness.question`, ...). They are valid AG-UI `CUSTOM`
   * events a strict AG-UI client can ignore, but they carry the control-plane
   * detail the dashboard wants. Default: `true`.
   */
  includeHarnessEvents?: boolean
  /**
   * After each `RUN_FINISHED` that reports usage, emit an interim
   * {@link TANSTACK_SPEND_EVENT} `CUSTOM` event carrying that run's usage and
   * the running total, for a live spend meter. Default: `false`.
   */
  emitSpendEvents?: boolean
}

/**
 * Map a session's `SessionEvent` stream to a pure AG-UI event stream.
 *
 * The harness stream is already AG-UI-native, so this is mostly a documented
 * pass-through. What it guarantees:
 *
 * - `RUN_FINISHED` usage is surfaced under `metadata.tanstack.usage`
 *   ({@link NormalizedUsage}) so consumers read one key regardless of provider.
 * - Interrupt/approval waits stay as `RUN_FINISHED` with
 *   `outcome.type === 'interrupt'`; subagent events keep their `subagentRunId`.
 * - Optionally drops the harness-native `CUSTOM` events, or emits interim
 *   spend ticks.
 */
export async function* sessionEventsToAgUi(
  events: AsyncIterable<SessionEvent>,
  options: SessionEventsToAgUiOptions = {},
): AsyncGenerator<StreamChunk> {
  const includeHarnessEvents = options.includeHarnessEvents ?? true
  const emitSpendEvents = options.emitSpendEvents ?? false
  let cumulative = zeroUsage()

  for await (const entry of events) {
    const event = entry.event
    if (!includeHarnessEvents && isHarnessCustom(event)) continue

    if (event.type === EventType.RUN_FINISHED) {
      const usage = usageOf(event)
      // Emit the spend tick *before* RUN_FINISHED so it stays inside the
      // RUN_STARTED..RUN_FINISHED window a strict AG-UI consumer expects.
      if (usage && emitSpendEvents) {
        cumulative = addUsage(cumulative, usage)
        const value: SpendSnapshot = {
          ...(typeof (event as { runId?: unknown }).runId === 'string'
            ? { runId: (event as { runId: string }).runId }
            : {}),
          ...(typeof (event as { threadId?: unknown }).threadId === 'string'
            ? { threadId: (event as { threadId: string }).threadId }
            : {}),
          usage,
          cumulative,
        }
        yield {
          type: EventType.CUSTOM,
          name: TANSTACK_SPEND_EVENT,
          value,
          timestamp: (event as { timestamp?: number }).timestamp ?? Date.now(),
        } as StreamChunk
      }
      yield usage ? withUsageMetadata(event, usage) : event
      continue
    }

    yield event
  }
}

/** Session events for one operation, up to and including its terminal event. */
async function* followOperation(
  events: AsyncIterable<SessionEvent>,
  operationId: string,
): AsyncGenerator<SessionEvent> {
  for await (const entry of events) {
    if (entry.operationId !== operationId) continue
    yield entry
    if (
      entry.event.type === EventType.CUSTOM &&
      (entry.event as { name?: string }).name === HARNESS_EVENTS.operationFinished
    ) {
      return
    }
  }
}

/** The text of the last user message of an AG-UI request. */
function lastUserText(messages: ReadonlyArray<unknown>): string | undefined {
  const message = messages.findLast(
    (entry) => isRecord(entry) && entry.role === 'user',
  )
  if (!isRecord(message)) return undefined
  if (typeof message.content === 'string') return message.content
  const parts = Array.isArray(message.content) ? message.content : []
  return parts
    .map((part: unknown) =>
      isRecord(part) && part.type === 'text' && typeof part.text === 'string'
        ? part.text
        : '',
    )
    .join('')
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Options for {@link createAgUiHandler}. */
export interface AgUiHandlerOptions {
  host: HarnessHost
  harness: AnyHarness
  /** Decide who sends a request. Return `null` to refuse it with 401. */
  authorize: Authorize
  /** May this principal use this thread? Default: yes. */
  canAccess?: (
    principal: Principal,
    threadId: string,
  ) => boolean | Promise<boolean>
  /**
   * Passed through to {@link sessionEventsToAgUi} for every run. Note the
   * handler defaults `includeHarnessEvents` to `false` (strict AG-UI); set it
   * to `true` here to keep the harness-native `CUSTOM` control events.
   */
  stream?: SessionEventsToAgUiOptions
}

/**
 * A `fetch` handler an AG-UI client (`@ag-ui/client`'s `HttpAgent`) can point
 * at. `POST` a `RunAgentInput`:
 *
 * - with a trailing user message → runs a prompt;
 * - with `resume` entries → answers the last turn's interrupts, then continues.
 *
 * The response is `text/event-stream` of AG-UI events, encoded with
 * `@ag-ui/encoder` so protobuf-accepting clients get binary framing for free.
 * The stream closes when the operation reaches a terminal state (completed,
 * interrupted, failed, or cancelled).
 *
 * The stream is strict AG-UI by default: harness-native `CUSTOM` control
 * events are dropped so it begins with `RUN_STARTED`, as a bare `@ag-ui/client`
 * requires (that control detail belongs on the harness protocol's `/events`
 * tier, which the dashboard consumes separately). Pass
 * `stream.includeHarnessEvents: true` for a lenient consumer that wants them.
 */
export function createAgUiHandler(
  options: AgUiHandlerOptions,
): (request: Request) => Promise<Response> {
  const { host, harness, authorize } = options
  const canAccess = options.canAccess ?? (() => true)

  const openFor = async (
    principal: Principal,
    threadId: string,
  ): Promise<HarnessSession | null> => {
    if (!(await canAccess(principal, threadId))) return null
    return host.open(harness, { threadId, principal })
  }

  return async (request) => {
    if (request.method !== 'POST') return json({ error: 'method' }, 405)
    const principal = await authorize(request)
    if (!principal) return json({ error: 'unauthorized' }, 401)

    let operationId: string
    let session: HarnessSession
    try {
      const params = await chatParamsFromRequestBody(await request.json())
      const opened = await openFor(principal, params.threadId)
      if (!opened) return json({ error: 'forbidden' }, 403)
      session = opened

      if (params.resume && params.resume.length > 0) {
        const receipt = await session.resolve(params.resume)
        if (receipt.status === 'rejected' || !receipt.operationId) {
          return json({ error: receipt.reason ?? 'rejected' }, 409)
        }
        operationId = receipt.operationId
      } else {
        const message = lastUserText(params.messages)
        if (message === undefined) return json({ error: 'no user message' }, 400)
        operationId = session.prompt(message).id
      }
    } catch (error) {
      // `chatParamsFromRequestBody` throws a `Response` on a malformed body.
      if (error instanceof Response) return error
      return json(
        { error: error instanceof Error ? error.message : String(error) },
        400,
      )
    }

    // `encodeBinary` returns SSE bytes normally and protobuf framing when the
    // client's `Accept` prefers it — paired with `getContentType()` below.
    const encoder = new EventEncoder({
      accept: request.headers.get('accept') ?? undefined,
    })
    // Not `request.signal`: some servers abort it once the body is read. The
    // response aborts this controller when the client goes away.
    const reader = new AbortController()
    const body = new ReadableStream<Uint8Array>({
      cancel: () => reader.abort(),
      async start(controller) {
        try {
          const entries = followOperation(
            session.events({ signal: reader.signal }),
            operationId,
          )
          for await (const event of sessionEventsToAgUi(entries, {
            includeHarnessEvents: false,
            ...options.stream,
          })) {
            controller.enqueue(encoder.encodeBinary(event as BaseEvent))
          }
        } catch (error) {
          if (!reader.signal.aborted) controller.error(error)
          return
        } finally {
          if (!reader.signal.aborted) controller.close()
        }
      },
    })

    return new Response(body, {
      headers: {
        'Content-Type': encoder.getContentType(),
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }
}
