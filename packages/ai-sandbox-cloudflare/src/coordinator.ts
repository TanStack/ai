import { DurableObject } from 'cloudflare:workers'
import { EventType, isTerminalRunStatus } from '@tanstack/ai'
import { RunController } from '@tanstack/ai-sandbox'
import { runLogStore, runLogStream } from './durability'
import { DurableObjectRunEventLog } from './run-log-do'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { RunLogRecord } from './run-log'

/** Re-arm window for the liveness watchdog while a run is in flight (ms). */
const WATCHDOG_MS = 30_000

const WATCHDOG_STALL_MS = 5 * 60_000

/** What the Worker hands the coordinator to start a run. */
export interface StartRunInput {
  runId: string
  threadId: string
  messages: Array<ModelMessage>
  publicHost?: string
  metadata?: Record<string, unknown>
}

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

  private readonly pumping = new WeakSet<WebSocket>()

  constructor(ctx: DurableObjectState, env: TEnv) {
    super(ctx, env)
    this.log = new DurableObjectRunEventLog(ctx.storage)
    this.controller = new RunController({
      runs: runLogStore(this.log),
      durability: (runId) => runLogStream(this.log, { runId }),
    })
  }

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

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const existing = await this.log.get(input.runId)
    if (existing) return { runId: input.runId } // idempotent re-trigger

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
    const settle = (): void => this.onRunSettled(input.runId)
    this.ctx.waitUntil(done.then(settle, settle))
    await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_MS)
    return { runId: input.runId }
  }

  async status(runId: string): Promise<RunLogRecord | null> {
    // Straight off the log (not `controller.status`) so the answer keeps the
    // log-level fields (`lastSeq`) a reconnecting client resumes from.
    return this.log.get(runId)
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    if (parts[0] === 'runs' && typeof parts[1] === 'string') {
      if (parts[2] === 'stream') return this.acceptStream(parts[1], request)
      const isRunStatusGet = parts.length === 2 && request.method === 'GET'
      if (isRunStatusGet) {
        const record = await this.status(parts[1])
        return record
          ? this.jsonResponse(record)
          : this.jsonResponse({ error: 'unknown run' }, 404)
      }
    }
    return this.handleRoute(request, parts)
  }

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

  private pump(socket: WebSocket, runId: string, fromSeq: number): void {
    if (this.pumping.has(socket)) return
    this.pumping.add(socket)
    const done = (async () => {
      try {
        const events = this.log.read(runId, { fromSeq })
        for await (const event of events) {
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

  override async alarm(): Promise<void> {
    try {
      // Through the log (not a raw `rec:` list) so legacy records are migrated
      // on the way out — the storage layout is the log's private concern.
      const runs = await this.log.list()
      const now = Date.now()
      let active = false
      for (const record of runs) {
        if (isTerminalRunStatus(record.status)) continue
        if (now - record.updatedAt > WATCHDOG_STALL_MS) {
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
    await this.log.finish(runId, 'failed', { message })
    this.onRunSettled(runId)
  }
}
