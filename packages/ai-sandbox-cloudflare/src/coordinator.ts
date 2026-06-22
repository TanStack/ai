/**
 * `SandboxCoordinator` — the abstract Durable Object base for the serverless/
 * edge agent run model. It owns everything the two concrete models share:
 *
 * - a durable, resumable run-log ({@link DurableObjectRunEventLog});
 * - `startRun`: open the run, kick off the model's chunk stream WITHOUT blocking
 *   the trigger, pipe it into the log via {@link RunController} under
 *   `ctx.waitUntil` (so it survives hibernation), and arm a watchdog alarm;
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
import { RunController, isTerminalRunStatus } from '@tanstack/ai-sandbox'
import { DurableObjectRunEventLog } from './run-log-do'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { RunRecord } from '@tanstack/ai-sandbox'

/** Re-arm window for the liveness watchdog while a run is in flight (ms). */
const WATCHDOG_MS = 30_000

/** What the Worker hands the coordinator to start a run. */
export interface StartRunInput {
  runId: string
  threadId: string
  messages: Array<ModelMessage>
}

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

    const stream = await this.buildRunStream(input)
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
   */
  private pump(socket: WebSocket, runId: string, fromSeq: number): void {
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
        socket.send(JSON.stringify({ type: 'status', record }))
        socket.close(1000, 'run complete')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        socket.close(1011, message.slice(0, 120))
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

  // ===========================================================================
  // Watchdog alarm — keeps a run observable across hibernation
  // ===========================================================================

  override async alarm(): Promise<void> {
    const runs = await this.ctx.storage.list<RunRecord>({ prefix: 'rec:' })
    const active = [...runs.values()].some(
      (record) => !isTerminalRunStatus(record.status),
    )
    if (active) await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_MS)
  }
}
