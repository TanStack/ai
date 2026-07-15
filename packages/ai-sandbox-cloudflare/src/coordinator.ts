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
import { EventType } from '@tanstack/ai'
import { RunController, isTerminalRunStatus } from '@tanstack/ai-sandbox'
import { DurableObjectRunEventLog } from './run-log-do'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { RunRecord } from '@tanstack/ai-sandbox'

/** Re-arm window for the liveness watchdog while a run is in flight (ms). */
const WATCHDOG_MS = 30_000

/**
 * How long a non-terminal run may go without ANY new event before the watchdog
 * presumes the orchestrator driving it is dead (eviction that lost the
 * `waitUntil` promise, an uncaught fault, a hung container) and fails the run so
 * tailing clients stop waiting forever. Generous so a legitimately slow agent
 * step (a long tool call that emits no chunks) is not killed prematurely.
 */
const WATCHDOG_STALL_MS = 5 * 60_000

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

  constructor(ctx: DurableObjectState, env: TEnv) {
    super(ctx, env)
    this.log = new DurableObjectRunEventLog(ctx.storage)
    this.controller = new RunController(this.log)
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
    if (existing) return { runId: input.runId } // idempotent re-trigger

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
      await this.log.finish(input.runId, 'error', { message })
      this.onRunSettled(input.runId)
      return { runId: input.runId }
    }

    const { done } = this.controller.start({
      runId: input.runId,
      threadId: input.threadId,
      stream,
    })
    // Keep the instance alive until the run is terminal; `pipeToRunLog` never
    // rejects (failures land in the log), so no `.catch` is needed.
    this.ctx.waitUntil(done.finally(() => this.onRunSettled(input.runId)))
    await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_MS)
    return { runId: input.runId }
  }

  async status(runId: string): Promise<RunRecord | null> {
    return this.controller.status(runId)
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
        for await (const event of this.controller.attach(runId, { fromSeq })) {
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
    try {
      const runs = await this.ctx.storage.list<RunRecord>({ prefix: 'rec:' })
      const now = Date.now()
      let active = false
      for (const record of runs.values()) {
        if (isTerminalRunStatus(record.status)) continue
        if (now - record.updatedAt > WATCHDOG_STALL_MS) {
          // No progress for too long — the driver is presumed dead. Fail the run
          // so tailing clients stop waiting forever (the whole point of the
          // watchdog; without this a stuck run sits at `running` indefinitely).
          await this.failStalledRun(record.runId)
        } else {
          active = true
        }
      }
      if (active) await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_MS)
    } catch (error) {
      // Never let the watchdog die silently: a transient storage error must not
      // permanently disable liveness detection. Re-arm and try again next tick.
      console.error('[sandbox-coordinator] watchdog alarm failed:', error)
      await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_MS)
    }
  }

  /** Mark a stalled (orchestrator-presumed-dead) run as a terminal error. */
  private async failStalledRun(runId: string): Promise<void> {
    const message = 'run watchdog: no progress; orchestrator presumed dead'
    try {
      await this.log.append(runId, { type: EventType.RUN_ERROR, message })
    } catch {
      // The run may have just reached terminal concurrently; finish is idempotent.
    }
    await this.log.finish(runId, 'error', { message })
    this.onRunSettled(runId)
  }
}
