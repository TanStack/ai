/**
 * `SandboxCoordinator` — the abstract Durable Object base for the serverless/
 * edge agent run model. It owns everything the two concrete models share:
 *
 * - a durable, resumable run-log ({@link DurableObjectRunEventLog});
 * - `startRun`: open the run, kick off the model's chunk stream WITHOUT blocking
 *   the trigger, start piping it into the log via {@link RunController}, register
 *   the resulting `done` promise with `ctx.waitUntil` (keeping the instance alive
 *   until the run is terminal rather than letting it hibernate mid-run), and arm
 *   a watchdog alarm;
 * - `status` (poll fallback) + a hibernatable WebSocket tail with a resumable
 *   cursor (replay after `lastSeq`, then live-tail, reconnect-safe);
 * - routing for `GET /runs/:id` and `GET /runs/:id/stream`, delegating any other
 *   path to {@link handleRoute} (which a subclass overrides for e.g. `/_bridge`
 *   or `/tool-exec`).
 *
 * Subclasses implement {@link buildRunStream} — the ONE difference between the
 * models: run `chat()` in the DO ({@link ChatSandboxCoordinator}) or drive an
 * in-container runner ({@link ContainerSandboxCoordinator}).
 *
 * NOTE: Workers-runtime code — compiles against `@cloudflare/workers-types`; not
 * runtime-verified in this repo.
 */
import { DurableObject } from 'cloudflare:workers'
import { EventType, isTerminalRunStatus } from '@tanstack/ai'
// The PORTABLE run driver: this coordinator is a platform binding of core's
// `RunController`, not a driver of its own. The DO run log backs both of the
// driver's seams through the adapters in './durability' — `runLogStore` for
// the lifecycle record, `runLogStream` for the per-run event log — and the
// vocabulary is core's throughout (historical `done`/`error` records are
// migrated on read; see './run-log').
import { RunController } from '@tanstack/ai-sandbox'
import { runLogStore, runLogStream } from './durability'
import { hasInFlightCallback } from './coordinator-callbacks'
import { DurableObjectRunEventLog } from './run-log-do'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { RunLogRecord } from './run-log'

/** Upper bound on the watchdog check interval while a run is in flight (ms). */
const WATCHDOG_MS = 30_000

/** Default permitted period without persisted run activity (ms). */
const DEFAULT_STALL_TIMEOUT_MS = 5 * 60_000

/** @internal Shared validation for direct subclasses and the eager factory path. */
export function normalizeStallTimeoutMs(
  stallTimeoutMs: number | false | undefined,
): number | false {
  if (stallTimeoutMs === undefined) return DEFAULT_STALL_TIMEOUT_MS
  if (stallTimeoutMs === false) return false
  if (!Number.isSafeInteger(stallTimeoutMs) || stallTimeoutMs <= 0) {
    throw new TypeError(
      'stallTimeoutMs must be a positive safe integer or false',
    )
  }
  return stallTimeoutMs
}

/** What the Worker hands the coordinator to start a run. */
export interface StartRunInput {
  runId: string
  threadId: string
  messages: Array<ModelMessage>
  /**
   * The host the `POST /runs` trigger request arrived on, captured by the Worker
   * (`new URL(request.url).host`). Used to derive the container's callback hosts
   * when `PUBLIC_HOSTNAME` / `PREVIEW_HOSTNAME` are not set — see
   * {@link resolveBridgeOrigin} / {@link resolvePreviewHost} for the rules (and the
   * Cloudflare-specific reason request-derivation is safe to trust).
   */
  publicHost?: string
  /**
   * Free-form per-run input forwarded verbatim from the trigger to the app's
   * `adapter` / `sandbox` / `tools` resolvers (it reaches them through `config`
   * unchanged; it is NOT persisted to the run-log). Use it to carry browser-chosen
   * run options the base trigger has no field for — e.g. which harness to run, or a
   * model id. The package never inspects it; the app validates whatever it reads.
   */
  metadata?: Record<string, unknown>
}

// Host resolvers live in their own (Workers-free) module so they stay pure and
// unit-testable; re-exported here because the coordinators build their callback
// URLs with them. `resolveBridgeOrigin` = container→Worker (/_bridge, /tool-exec);
// `resolvePreviewHost` = browser→container previews. See their docstrings.
export { resolveBridgeOrigin, resolvePreviewHost } from './public-host'

/** Cursor stashed on each hibernatable WebSocket so it survives eviction. */
interface SocketAttachment {
  runId: string
  lastSeq: number
}

function isSocketAttachment(value: unknown): value is SocketAttachment {
  return (
    value !== null &&
    typeof value === 'object' &&
    'runId' in value &&
    typeof value.runId === 'string' &&
    'lastSeq' in value &&
    typeof value.lastSeq === 'number'
  )
}

export abstract class SandboxCoordinator<
  TEnv = unknown,
> extends DurableObject<TEnv> {
  protected readonly log: DurableObjectRunEventLog
  protected readonly controller: RunController

  /**
   * Sockets with a live {@link pump} loop. Guards against a second concurrent
   * pump on the same socket: `acceptStream` starts one, and `webSocketMessage`
   * would start another on any inbound client message while the first is still
   * running — double-delivering events and racing the persisted cursor.
   */
  private readonly pumping = new WeakSet<WebSocket>()
  private readonly stallTimeoutMs: number | false

  constructor(
    ctx: DurableObjectState,
    env: TEnv,
    stallTimeoutMs?: number | false,
  ) {
    super(ctx, env)
    this.stallTimeoutMs = normalizeStallTimeoutMs(stallTimeoutMs)
    this.log = new DurableObjectRunEventLog(ctx.storage)
    this.controller = new RunController({
      runs: runLogStore(this.log),
      durability: (runId) => runLogStream(this.log, { runId }),
    })
  }

  // ===========================================================================
  // Subclass seam
  // ===========================================================================

  /**
   * Produce the run's `StreamChunk` stream. The ONE model-specific method:
   * `ChatSandboxCoordinator` runs `chat()` here; `ContainerSandboxCoordinator`
   * drives the in-container runner. Lazily consumed by the run driver, so any
   * setup (mint a token, start a container) can happen at the top.
   */
  protected abstract buildRunStream(
    input: StartRunInput,
  ): AsyncIterable<StreamChunk> | Promise<AsyncIterable<StreamChunk>>

  /** Extra fetch routes a subclass serves (e.g. `/_bridge`, `/tool-exec`). */
  protected handleRoute(
    _request: Request,
    _parts: Array<string>,
  ): Promise<Response> | Response {
    return new Response('not found', { status: 404 })
  }

  /** Called once a run reaches a terminal status (override to clean up state). */
  protected onRunSettled(_runId: string): void {}

  protected jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  // ===========================================================================
  // Trigger (called by the Worker; returns immediately)
  // ===========================================================================

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const existing = await this.log.get(input.runId)
    if (existing) {
      if (!isTerminalRunStatus(existing.status)) await this.armWatchdog()
      return { runId: input.runId }
    }

    await this.armWatchdog()

    // Open the run BEFORE building the stream. `pipeToRunLog`'s never-rejects
    // guarantee only covers failures AFTER the stream is handed to it — a throw
    // while BUILDING the stream (config(), chat() validation, mint a token)
    // would otherwise leave no record and no terminal event, so a tailing client
    // would never see the failure. Opening here (idempotent with pipeToRunLog's
    // own open) lets us record it.
    await this.log.open({ runId: input.runId, threadId: input.threadId })
    let stream: AsyncIterable<StreamChunk>
    try {
      stream = await this.buildRunStream(input)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.log.append(input.runId, {
        type: EventType.RUN_ERROR,
        message,
      })
      await this.log.finish(input.runId, 'failed', { message })
      this.onRunSettled(input.runId)
      return { runId: input.runId }
    }

    const { done } = this.controller.start({
      runId: input.runId,
      threadId: input.threadId,
      stream,
    })
    // Keep the instance alive until the run is terminal. `pipeToRunLog` never
    // rejects (failures land in the log), but this must not DEPEND on that:
    // `.finally` adopts a rejection, which would hand `waitUntil` a rejected
    // promise. Two-argument `then` settles fulfilled either way while still
    // running the settle hook.
    const settle = (): void => this.onRunSettled(input.runId)
    this.ctx.waitUntil(done.then(settle, settle))
    return { runId: input.runId }
  }

  async status(runId: string): Promise<RunLogRecord | null> {
    // Straight off the log (not `controller.status`) so the answer keeps the
    // log-level fields (`lastSeq`) a reconnecting client resumes from.
    return this.log.get(runId)
  }

  // ===========================================================================
  // HTTP surface
  // ===========================================================================

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    if (parts[0] === 'runs' && typeof parts[1] === 'string') {
      if (parts[2] === 'stream') return this.acceptStream(parts[1], request)
      if (parts.length === 2 && request.method === 'GET') {
        const record = await this.status(parts[1])
        return record
          ? this.jsonResponse(record)
          : this.jsonResponse({ error: 'unknown run' }, 404)
      }
    }
    return this.handleRoute(request, parts)
  }

  // ===========================================================================
  // WebSocket streaming with hibernation + resumable cursor
  // ===========================================================================

  private async acceptStream(
    runId: string,
    request: Request,
  ): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 })
    }
    const record = await this.log.get(runId)
    if (!record) return new Response('unknown run', { status: 404 })

    const url = new URL(request.url)
    const lastSeqParam = url.searchParams.get('lastSeq')
    const lastSeq =
      lastSeqParam !== null ? Number.parseInt(lastSeqParam, 10) : -1
    if (Number.isNaN(lastSeq)) {
      return new Response('lastSeq must be an integer', { status: 400 })
    }

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    server.serializeAttachment({ runId, lastSeq } satisfies SocketAttachment)
    this.ctx.acceptWebSocket(server)
    this.pump(server, runId, lastSeq)

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * Replay-then-tail loop for one socket. Each delivered event advances the
   * socket's persisted cursor so a mid-stream reconnect resumes exactly once.
   * No-ops if a pump is already running for this socket (see {@link pumping}).
   */
  private pump(socket: WebSocket, runId: string, fromSeq: number): void {
    if (this.pumping.has(socket)) return
    this.pumping.add(socket)
    const done = (async () => {
      try {
        // The tail reads the log directly by seq — the client wire protocol
        // (`?lastSeq`, `{seq, chunk}` frames) is seq-based, and `log.read` is
        // the seq-cursor surface. Core's `controller.attach` serves consumers
        // that speak opaque `StreamDurability` offsets instead.
        for await (const event of this.log.read(runId, { fromSeq })) {
          socket.send(JSON.stringify(event))
          socket.serializeAttachment({
            runId,
            lastSeq: event.seq,
          } satisfies SocketAttachment)
        }
        const record = await this.log.get(runId)
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'status', record }))
          socket.close(1000, 'run complete')
        }
      } catch (error) {
        // A tail loop throwing means a run-log read failed — an operator needs
        // the full error, but the client only gets a truncated close reason.
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          `[sandbox-coordinator] tail failed for run ${runId}:`,
          error,
        )
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1011, message.slice(0, 120))
        }
      } finally {
        this.pumping.delete(socket)
      }
    })()
    this.ctx.waitUntil(done)
  }

  override webSocketMessage(
    ws: WebSocket,
    _message: string | ArrayBuffer,
  ): void {
    // Only meaningful as a post-hibernation resume nudge: restart the tail from
    // the persisted cursor IF no pump is live (the guard in `pump` enforces the
    // "resume exactly once" invariant when the original pump is still running).
    const attachment: unknown = ws.deserializeAttachment()
    if (isSocketAttachment(attachment)) {
      this.pump(ws, attachment.runId, attachment.lastSeq)
    }
  }

  override webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
  ): void {
    // Nothing to clean up: the run-log is durable and independent of any socket.
  }

  // ===========================================================================
  // Watchdog alarm — keeps a run observable across hibernation
  // ===========================================================================

  override async alarm(): Promise<void> {
    // A previously configured alarm may still be delivered once after watchdogs
    // are disabled. It must self-extinguish before reading storage or entering a
    // catch path that could re-arm it. Deliberately do not call deleteAlarm().
    if (this.stallTimeoutMs === false) return

    try {
      // Through the log (not a raw `rec:` list) so legacy records are migrated
      // on the way out — the storage layout is the log's private concern.
      const runs = await this.log.list()
      const cutoff = Date.now() - this.stallTimeoutMs
      let active = false
      for (const record of runs) {
        if (isTerminalRunStatus(record.status)) continue
        if (
          hasInFlightCallback(this, record.runId) ||
          record.updatedAt >= cutoff
        ) {
          active = true
          continue
        }

        // Re-check and terminalize atomically against the same strict cutoff.
        // A callback touch or normal completion racing this alarm wins cleanly.
        const finished = await this.failStalledRun(record.runId, cutoff)
        if (finished) this.onRunSettled(record.runId)
        else active = true
      }
      if (active) await this.armWatchdog()
    } catch (error) {
      // Never let the watchdog die silently: a transient storage error must not
      // permanently disable liveness detection. Re-arm and try again next tick.
      console.error('[sandbox-coordinator] watchdog alarm failed:', error)
      await this.armWatchdog()
    }
  }

  /** Arm without allowing a new run to postpone an earlier pending check. */
  private async armWatchdog(): Promise<void> {
    if (this.stallTimeoutMs === false) return
    const next = Date.now() + Math.min(WATCHDOG_MS, this.stallTimeoutMs)
    const pending = await this.ctx.storage.getAlarm()
    if (pending === null || pending > next) {
      await this.ctx.storage.setAlarm(next)
    }
  }

  /** Mark a strictly stale run as a terminal error if it still qualifies. */
  private failStalledRun(runId: string, cutoff: number): Promise<boolean> {
    const message = 'run watchdog: no progress; orchestrator presumed dead'
    return this.log.finishIfStale(runId, cutoff, {
      type: EventType.RUN_ERROR,
      message,
    })
  }
}
