/**
 * RunCoordinator — the Durable Object that COORDINATES an agent run in the
 * CO-LOCATED ("combined") sandbox model.
 *
 *     Worker (stateless trigger)
 *        → RunCoordinator (this DO: thin durable coordinator)
 *           → Container (runs the in-container harness runner that runs chat())
 *
 * The defining difference from `examples/sandbox-cloudflare-agent`: this DO does
 * NOT call `chat()` / the adapter itself. The harness loop AND its MCP
 * tool-bridge run INSIDE the container (see `src/container-runner.ts`). The DO
 * stays OUTSIDE as a thin durable coordinator with exactly three jobs:
 *
 *   1. start/locate the container and POST `/run` to its in-container runner,
 *      handing it the host-tool descriptors + a per-run tool-exec token & URL;
 *   2. read the runner's NDJSON `StreamChunk` stream and append each chunk to
 *      the durable run-log (so clients can resume-tail it), all under
 *      `ctx.waitUntil` so it survives hibernation;
 *   3. execute host tools the in-container agent calls back for — the real tool
 *      `execute()` (DB / secrets / app state) lives HERE, not in the container.
 *
 * TWO channels cross the container ↔ DO boundary; everything else (the MCP
 * transport, native stdin) is in-container localhost:
 *   • events OUT: runner → DO  (NDJSON of StreamChunk, appended to the run-log)
 *   • host-tool EXECUTION: container → DO  (`/tool-exec/:runId`, bearer-gated)
 *
 * NOTE: compile-only reference — not runtime-verified in this repo (no Workers
 * runtime / container build here). It compiles against the real Cloudflare +
 * TanStack AI types and follows the proven run-log / remote-tool contracts.
 */
import { DurableObject } from 'cloudflare:workers'
import { EventType } from '@tanstack/ai'
import {
  RunController,
  executeHostTool,
  isTerminalRunStatus,
  toolDescriptors,
} from '@tanstack/ai-sandbox'
import { getSandbox } from '@cloudflare/sandbox'
import { DurableObjectRunEventLog } from './run-log-do'
import type { AnyTool, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { RunRecord } from '@tanstack/ai-sandbox'
import type { Sandbox } from '@cloudflare/sandbox'
import type { RunRequest } from './protocol'

/** Port the in-container runner listens on (matches RUNNER_PORT in the image). */
const RUNNER_PORT = 8080

export interface Env {
  /** This coordinator DO's own namespace (so the Worker can address it). */
  RUN_COORDINATOR: DurableObjectNamespace<RunCoordinator>
  /** The `@cloudflare/sandbox` Sandbox DO namespace (the container hosts). */
  Sandbox: DurableObjectNamespace<Sandbox>
  /** Public hostname the container uses to reach the DO's `/tool-exec` endpoint. */
  PUBLIC_HOSTNAME: string
  /** Anthropic key injected into the CONTAINER env for the in-container `claude` CLI. */
  ANTHROPIC_API_KEY: string
}

/** What the Worker hands the DO to start a run. */
export interface StartRunInput {
  runId: string
  threadId: string
  messages: Array<ModelMessage>
}

/** Per-run tool-exec token; gates `/tool-exec/:runId` for that run only. */
interface ToolExecState {
  token: string
}

/** Cursor we stash on each hibernatable WebSocket so it survives eviction. */
interface SocketAttachment {
  runId: string
  lastSeq: number
}

/** Narrow `deserializeAttachment()`'s value without casting (project rule). */
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

/** Wire shape of a `/tool-exec/:runId` body: `{ name, args }`. */
interface ToolExecRequest {
  name: string
  args: unknown
}

function isToolExecRequest(value: unknown): value is ToolExecRequest {
  return (
    value !== null &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

/** Web Crypto constant-time bearer compare (node:crypto is unavailable here). */
function timingSafeBearerEqualWeb(
  header: string | undefined,
  token: string,
): boolean {
  if (header === undefined) return false
  const a = new TextEncoder().encode(header)
  const b = new TextEncoder().encode(`Bearer ${token}`)
  // Length is not secret; bail early so the equal-length loop is constant-time.
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!
  return diff === 0
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Narrow one NDJSON line into a StreamChunk (project rule: no `as`). */
function isStreamChunk(value: unknown): value is StreamChunk {
  return value !== null && typeof value === 'object' && 'type' in value
}

/**
 * Adapt the runner's NDJSON response body into an `AsyncIterable<StreamChunk>`
 * so the DO can drive it through the SAME `RunController` / `pipeToRunLog` the
 * non-co-located example uses — terminal-status handling, RUN_ERROR detection,
 * and never-rejects semantics all come for free. A malformed line is surfaced
 * as a terminal RUN_ERROR chunk, never silently dropped.
 */
async function* ndjsonToChunks(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<StreamChunk> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (line === '') continue
      const parsed: unknown = JSON.parse(line)
      if (!isStreamChunk(parsed)) {
        yield {
          type: EventType.RUN_ERROR,
          message: 'runner sent a non-chunk line',
        }
        return
      }
      yield parsed
    }
  }
  const tail = buffer.trim()
  if (tail !== '') {
    const parsed: unknown = JSON.parse(tail)
    if (isStreamChunk(parsed)) yield parsed
  }
}

export class RunCoordinator extends DurableObject<Env> {
  private readonly log: DurableObjectRunEventLog
  private readonly controller: RunController
  /**
   * The REAL demo host tools. Their `execute()` runs HERE, in the DO — the
   * in-container agent only ever reaches them via `/tool-exec/:runId`. Swap
   * these for your own DB-/secrets-backed tools; the in-container runner sees
   * only the serialized descriptors.
   */
  private readonly hostTools: Array<AnyTool> = [
    {
      name: 'lookup_docs',
      description:
        'Look up a short documentation snippet by topic from the host knowledge base.',
      inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string' } },
        required: ['topic'],
      },
      execute: (args: unknown) => {
        const topic =
          args !== null && typeof args === 'object' && 'topic' in args
            ? String(args.topic)
            : ''
        return Promise.resolve({
          topic,
          snippet: `Docs for "${topic}": this snippet is served by the DO host tool, not the container.`,
        })
      },
    },
  ]

  /**
   * Live per-run tool-exec tokens, keyed by runId. In-memory by design: a run's
   * tool-exec endpoint is only reachable while the run is in flight, and
   * `ctx.waitUntil(done)` keeps THIS instance alive for the run's lifetime, so
   * the container's callbacks always hit the instance that minted the token.
   */
  private readonly toolExec = new Map<string, ToolExecState>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.log = new DurableObjectRunEventLog(ctx.storage)
    this.controller = new RunController(this.log)
  }

  // ===========================================================================
  // 1. Triggering a run (called by the Worker; returns immediately)
  // ===========================================================================

  /**
   * Begin coordinating a run: POST `/run` to the in-container runner, then pump
   * its NDJSON `StreamChunk` stream into the durable run-log via
   * {@link RunController.start}. Returns as soon as the run is REGISTERED — it
   * does NOT await the agent. Kept alive across hibernation by `ctx.waitUntil`.
   */
  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const existing = await this.log.get(input.runId)
    if (existing) return { runId: input.runId } // idempotent re-trigger

    // Mint the per-run tool-exec token BEFORE we tell the container to run, so a
    // tool callback can never arrive before the token is registered.
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
    this.toolExec.set(input.runId, { token })

    const stream = this.driveContainer(input, token)
    const { done } = this.controller.start({
      runId: input.runId,
      threadId: input.threadId,
      stream,
    })

    // Keep the instance alive across hibernation windows until the run ends, and
    // drop the tool-exec token once it is terminal. `pipeToRunLog` never
    // rejects, so failures land in the log, not here.
    this.ctx.waitUntil(
      done.finally(() => {
        this.toolExec.delete(input.runId)
      }),
    )
    // Watchdog: re-check a run that outlived its driver after an eviction.
    await this.ctx.storage.setAlarm(Date.now() + 30_000)

    return { runId: input.runId }
  }

  /**
   * POST `/run` to the in-container runner and yield its NDJSON chunks. The DO
   * reaches the runner DIRECTLY over the sandbox binding (`containerFetch` to
   * RUNNER_PORT) — this internal channel needs no public hostname. The runner
   * gets the host-tool descriptors plus the `/tool-exec` URL + token it should
   * call back on.
   */
  private async *driveContainer(
    input: StartRunInput,
    token: string,
  ): AsyncIterable<StreamChunk> {
    const sandbox = getSandbox(this.env.Sandbox, input.threadId)
    await this.ensureRunner(sandbox)
    const body: RunRequest = {
      runId: input.runId,
      threadId: input.threadId,
      messages: input.messages,
      // Serialize the DO's real tools to wire descriptors for the container.
      toolDescriptors: toolDescriptors(this.hostTools),
      // The container calls back here for host-tool EXECUTION. It must be a URL
      // the CONTAINER can reach, so it goes via the Worker's public hostname.
      toolExecUrl: `https://${this.env.PUBLIC_HOSTNAME}/tool-exec/${input.runId}?threadId=${encodeURIComponent(input.threadId)}`,
      toolExecToken: token,
    }
    const response = await sandbox.containerFetch(
      'http://runner/run',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      RUNNER_PORT,
    )
    if (!response.ok || !response.body) {
      const text = await response.text()
      // Surface as a terminal RUN_ERROR chunk; pipeToRunLog finishes the run as
      // `error` and tailing clients observe it.
      yield {
        type: EventType.RUN_ERROR,
        message: `container runner failed: ${response.status} ${text.slice(0, 200)}`,
      }
      return
    }
    yield* ndjsonToChunks(response.body)
  }

  /**
   * Ensure the in-container runner is listening on RUNNER_PORT. The base image's
   * ENTRYPOINT is the sandbox CONTROL server (port 3000), not our runner — so we
   * start the bundled runner as a background process via that control server.
   * Idempotent for a thread-reused container: if `/health` already answers, the
   * runner is up and we skip the spawn.
   */
  private async ensureRunner(sandbox: Sandbox): Promise<void> {
    if (await this.runnerHealthy(sandbox)) return
    // Inject the Anthropic key into the container env so the in-container
    // `claude` CLI can authenticate. The key never lands in argv or the run-log.
    await sandbox.setEnvVars({ ANTHROPIC_API_KEY: this.env.ANTHROPIC_API_KEY })
    // The Dockerfile copies the bundled runner to /app/container-runner.mjs.
    await sandbox.startProcess(`node /app/container-runner.mjs`, {
      env: { RUNNER_PORT: String(RUNNER_PORT) },
    })
    // Poll until it answers /health (container cold-start + node boot). A run
    // that never comes up surfaces as a failed containerFetch below — not a hang.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await this.runnerHealthy(sandbox)) return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('in-container runner did not become healthy in time')
  }

  private async runnerHealthy(sandbox: Sandbox): Promise<boolean> {
    try {
      const res = await sandbox.containerFetch(
        'http://runner/health',
        { method: 'GET' },
        RUNNER_PORT,
      )
      return res.ok
    } catch {
      return false
    }
  }

  /** Run status for the poll fallback (`GET /runs/:id`). */
  async status(runId: string): Promise<RunRecord | null> {
    return this.controller.status(runId)
  }

  // ===========================================================================
  // 2. HTTP surface: WebSocket tail + the host-tool-exec callback
  // ===========================================================================

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    // /runs/:id/stream — hibernatable WebSocket tail (resumable cursor).
    if (
      parts[0] === 'runs' &&
      typeof parts[1] === 'string' &&
      parts[2] === 'stream'
    ) {
      return this.acceptStream(parts[1], request)
    }

    // /tool-exec/:runId — the in-container agent's host-tool execution callback.
    if (parts[0] === 'tool-exec' && typeof parts[1] === 'string') {
      return this.serveToolExec(parts[1], request)
    }

    return new Response('not found', { status: 404 })
  }

  /**
   * Execute a host tool the in-container agent called back for. The token gates
   * it (constant-time Web Crypto compare); the REAL tool's `execute()` runs here
   * via {@link executeHostTool} and its raw result returns as `{ result }`. An
   * unknown tool or a thrown `execute()` is surfaced as a 4xx/5xx, never masked.
   */
  private async serveToolExec(
    runId: string,
    request: Request,
  ): Promise<Response> {
    const state = this.toolExec.get(runId)
    if (!state) return new Response('no active run', { status: 404 })
    if (
      !timingSafeBearerEqualWeb(
        request.headers.get('authorization') ?? undefined,
        state.token,
      )
    ) {
      return new Response('unauthorized', { status: 401 })
    }
    const payload: unknown = await request.json()
    if (!isToolExecRequest(payload)) {
      return jsonResponse({ error: 'body must be { name, args }' }, 400)
    }
    try {
      const result = await executeHostTool(
        this.hostTools,
        payload.name,
        payload.args,
      )
      return jsonResponse({ result })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return jsonResponse({ error: message }, 500)
    }
  }

  // ===========================================================================
  // 3. WebSocket streaming with hibernation + resumable cursor
  //    (identical tail to examples/sandbox-cloudflare-agent)
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
    const attachment: SocketAttachment = { runId, lastSeq }
    server.serializeAttachment(attachment)
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
  // Watchdog alarm — keeps the run observable across hibernation
  // ===========================================================================

  override async alarm(): Promise<void> {
    const runs = await this.ctx.storage.list<RunRecord>({ prefix: 'rec:' })
    const active = [...runs.values()].some(
      (record) => !isTerminalRunStatus(record.status),
    )
    if (active) await this.ctx.storage.setAlarm(Date.now() + 30_000)
  }
}
