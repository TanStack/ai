/**
 * RunCoordinator — the Durable Object that OWNS an agent run.
 *
 * This is the coordinator in the serverless/edge agent model:
 *
 *     Worker (stateless trigger)
 *        → RunCoordinator (this DO: drives the run, owns the sandbox + run-log)
 *           → Cloudflare Sandbox (the container the agent executes in)
 *
 * Why a Durable Object and not the Worker? A Worker invocation is short-lived
 * and tied to one request — it cannot host a multi-minute agent loop. The DO is
 * addressable, single-threaded per id, and survives via HIBERNATION: it can be
 * evicted between events and woken on the next message or alarm without losing
 * state. So the Worker TRIGGERS a run and returns `202` immediately, and the DO
 * drives it to completion in the background under `ctx.waitUntil`.
 *
 * Responsibilities:
 * 1. `startRun` — ensure the sandbox + run `chat()` with the in-sandbox
 *    `claudeCodeText` harness, and pump its stream into the durable run-log via
 *    {@link RunController.start} WITHOUT blocking the trigger. Kept alive with
 *    `ctx.waitUntil` plus a watchdog alarm.
 * 2. WebSocket streaming — accept hibernatable sockets, replay persisted events
 *    after the client's `lastSeq` cursor, then live-tail. Reconnect-safe.
 * 3. The MCP tool-bridge — served from this DO's `fetch` handler at
 *    `/_bridge/:runId` (NO `node:http` listener, the whole point at the edge),
 *    gated by a per-run bearer token. The in-sandbox agent reaches it via the
 *    Worker's public hostname.
 *
 * NOTE: compile-only reference — not runtime-verified in this repo (no Workers
 * runtime here). It compiles against the real Cloudflare + TanStack AI types and
 * follows the proven run-log / tool-bridge contracts. See the README Limitations
 * for the stdin caveat that gates an actually-runnable edge Claude Code agent.
 */
import { DurableObject } from 'cloudflare:workers'
import { chat, defineChatMiddleware } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  ToolBridgeProvisionerCapability,
  RunController,
  createSecrets,
  createToolBridgeCore,
  defineSandbox,
  defineWorkspace,
  handleBridgeJsonRpc,
  isTerminalRunStatus,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { cloudflareSandbox } from '@tanstack/ai-sandbox-cloudflare'
import { DurableObjectRunEventLog } from './run-log-do'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type {
  ProvisionedBridge,
  RunRecord,
  ToolBridgeCore,
  ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import type { Sandbox } from '@cloudflare/sandbox'

export interface Env {
  /** This coordinator DO's own namespace (so the Worker can address it). */
  RUN_COORDINATOR: DurableObjectNamespace<RunCoordinator>
  /** The `@cloudflare/sandbox` Sandbox DO namespace (the container hosts). */
  Sandbox: DurableObjectNamespace<Sandbox>
  /** Public hostname the SANDBOX uses to reach the tool-bridge + previews. */
  PUBLIC_HOSTNAME: string
  /** Anthropic key injected into the sandbox env for the `claude` CLI. */
  ANTHROPIC_API_KEY: string
}

/** What the Worker hands the DO to start a run. */
export interface StartRunInput {
  runId: string
  threadId: string
  messages: Array<ModelMessage>
}

/** Per-run bridge state we keep so `/_bridge/:runId` can authenticate + serve. */
interface BridgeState {
  token: string
  core: ToolBridgeCore
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

export class RunCoordinator extends DurableObject<Env> {
  private readonly log: DurableObjectRunEventLog
  private readonly controller: RunController
  /**
   * Live per-run bridges, keyed by runId. In-memory by design: a bridge is only
   * reachable while its run is in flight, and `ctx.waitUntil(done)` keeps THIS
   * instance alive (un-hibernated) for the run's whole lifetime — so the agent's
   * MCP calls always hit the instance that provisioned the bridge. A request for
   * a run with no live bridge (finished, or never started here) is a hard 404,
   * not a silent re-provision.
   */
  private readonly bridges = new Map<string, BridgeState>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.log = new DurableObjectRunEventLog(ctx.storage)
    this.controller = new RunController(this.log)
  }

  // ===========================================================================
  // 1. Triggering a run (called by the Worker; returns immediately)
  // ===========================================================================

  /**
   * Begin driving a run. Opens the run-log, kicks off `chat()` through the
   * in-sandbox Claude Code harness, and keeps the DO alive via `ctx.waitUntil`
   * until the run is terminal. Returns as soon as the run is REGISTERED — it
   * does NOT await the agent. The Worker can `202` the client straight away.
   */
  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const existing = await this.log.get(input.runId)
    if (existing) return { runId: input.runId } // idempotent re-trigger

    const stream = this.buildChatStream(input)
    const { done } = this.controller.start({
      runId: input.runId,
      threadId: input.threadId,
      stream,
    })

    // Keep the instance alive across hibernation windows until the run ends.
    // `pipeToRunLog` never rejects (failures land in the log), so no `.catch`.
    this.ctx.waitUntil(done)
    // Watchdog: if the instance is evicted before `done` settles, the alarm
    // re-checks the run so a stuck run is observable (it never silently hangs).
    await this.ctx.storage.setAlarm(Date.now() + 30_000)

    return { runId: input.runId }
  }

  /** Build the `chat()` stream that runs Claude Code inside the CF sandbox. */
  private buildChatStream(input: StartRunInput): AsyncIterable<StreamChunk> {
    const sandbox = defineSandbox({
      id: 'cf-edge-agent',
      provider: cloudflareSandbox({
        binding: this.env.Sandbox,
        previewHostname: this.env.PUBLIC_HOSTNAME,
      }),
      workspace: defineWorkspace({
        source: { type: 'none' },
        // The container image ships `node` + the `claude` CLI (see Dockerfile).
        // Secrets are injected into the sandbox env, never persisted to logs.
        secrets: createSecrets({
          ANTHROPIC_API_KEY: this.env.ANTHROPIC_API_KEY,
        }),
      }),
      // One sandbox per thread, so a follow-up run resumes the same workspace.
      lifecycle: { reuse: 'thread' },
    })

    // `stream: true` (with no outputSchema) makes chat() return an
    // AsyncIterable<StreamChunk> directly — no cast needed for the run driver.
    return chat({
      threadId: input.threadId,
      adapter: claudeCodeText('sonnet'),
      messages: input.messages,
      stream: true,
      // Order matters only in that BOTH run `setup` before streaming begins:
      // our middleware provides the DO-backed bridge provisioner, and
      // `withSandbox` provides the sandbox handle the Claude Code adapter needs.
      middleware: [
        this.bridgeProvisionerMiddleware(input),
        withSandbox(sandbox),
      ],
    })
  }

  /**
   * A tiny middleware that PROVIDES our DO-backed {@link ToolBridgeProvisioner}.
   * The Claude Code adapter reads it via `getOptional` and falls back to the
   * `node:http` host transport when absent — here we override that so the bridge
   * is served from this DO's `fetch` handler instead of a TCP listener.
   */
  private bridgeProvisionerMiddleware(input: StartRunInput) {
    const provisioner = this.makeBridgeProvisioner(input)
    return defineChatMiddleware({
      name: 'do-tool-bridge-provisioner',
      provides: [ToolBridgeProvisionerCapability],
      setup: (ctx) => {
        ctx.provide(ToolBridgeProvisionerCapability, provisioner)
      },
    })
  }

  /**
   * Stand up the per-run bridge: register the tool core + a fresh bearer token
   * on this DO, and hand back a URL the SANDBOX can reach — the Worker's public
   * hostname routed to `/_bridge/:runId`. The `threadId` query lets the Worker
   * route the agent's MCP calls back to THIS coordinator. No raw socket is opened.
   */
  private makeBridgeProvisioner(input: StartRunInput): ToolBridgeProvisioner {
    const env = this.env
    const bridges = this.bridges
    const { runId, threadId } = input
    return {
      provision(tools, options): Promise<ProvisionedBridge> {
        const token =
          crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
        const core = createToolBridgeCore(tools, {
          ...(options.context !== undefined
            ? { context: options.context }
            : {}),
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
          ...(options.permission !== undefined
            ? { permission: options.permission }
            : {}),
        })
        bridges.set(runId, { token, core })
        return Promise.resolve({
          name: 'tanstack',
          url: `https://${env.PUBLIC_HOSTNAME}/_bridge/${runId}?threadId=${encodeURIComponent(threadId)}`,
          token,
          close: () => {
            bridges.delete(runId)
            return Promise.resolve()
          },
        })
      },
    }
  }

  // ===========================================================================
  // 2. The tool-bridge endpoint (`/_bridge/:runId`) + status, over fetch
  // ===========================================================================

  /**
   * The DO's HTTP surface. The Worker forwards `/_bridge/:runId` here (the agent
   * inside the sandbox calls it over MCP) and `/runs/:id/stream` for the
   * WebSocket upgrade.
   */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    // /_bridge/:runId — MCP JSON-RPC served from createToolBridgeCore.
    if (parts[0] === '_bridge' && typeof parts[1] === 'string') {
      return this.serveBridge(parts[1], request)
    }

    // /runs/:id/stream — hibernatable WebSocket tail.
    if (
      parts[0] === 'runs' &&
      typeof parts[1] === 'string' &&
      parts[2] === 'stream'
    ) {
      return this.acceptStream(parts[1], request)
    }

    return new Response('not found', { status: 404 })
  }

  /** Serve one MCP JSON-RPC request for a run after a constant-time token check. */
  private async serveBridge(
    runId: string,
    request: Request,
  ): Promise<Response> {
    const bridge = this.bridges.get(runId)
    if (!bridge)
      return new Response('no active bridge for run', { status: 404 })
    if (
      !timingSafeBearerEqualWeb(
        request.headers.get('authorization') ?? undefined,
        bridge.token,
      )
    ) {
      return new Response('unauthorized', { status: 401 })
    }
    const message: unknown = await request.json()
    const reply = await handleBridgeJsonRpc(bridge.core, message)
    // A notification (no id) yields null → MCP expects an empty 202 ack.
    if (reply === null) return new Response(null, { status: 202 })
    return jsonResponse(reply)
  }

  /** Run status for the poll fallback (`GET /runs/:id`). */
  async status(runId: string): Promise<RunRecord | null> {
    return this.controller.status(runId)
  }

  // ===========================================================================
  // 3. WebSocket streaming with hibernation + resumable cursor
  // ===========================================================================

  /**
   * Upgrade to a hibernatable WebSocket and tail the run. The client passes its
   * last-seen seq via `?lastSeq=` so a reconnect replays only what it missed.
   * We accept the socket through `ctx.acceptWebSocket` (hibernation API) and
   * stash the cursor as a serialized attachment so it survives eviction.
   */
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
    // Hibernation: the runtime can evict us and still deliver future
    // close/message events; we drive the tail from a detached pump below.
    this.ctx.acceptWebSocket(server)
    this.pump(server, runId, lastSeq)

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * Replay-then-tail loop for one socket. Each delivered event advances the
   * socket's persisted cursor so a mid-stream reconnect resumes exactly once.
   * Runs under `ctx.waitUntil` so it isn't cut short when the handler returns.
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
        // Terminal: tell the client the final status, then close cleanly.
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

  /**
   * Hibernation wake-up: if the instance was evicted while a socket was open,
   * the runtime re-instantiates us and delivers the socket here. Resume the
   * tail from the cursor we serialized onto it.
   */
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
    // Nothing to clean up: the run-log is durable and independent of any
    // socket, and the pump observes the closed socket on its next `send`.
  }

  // ===========================================================================
  // Watchdog alarm — keeps the run observable across hibernation
  // ===========================================================================

  /**
   * Re-arm while a run is still in flight. Because the run is driven under
   * `ctx.waitUntil`, this alarm exists only as a liveness backstop: if the
   * instance was evicted before `done` settled and later re-instantiated, the
   * alarm fires, sees a non-terminal record, and keeps the instance scheduled.
   */
  override async alarm(): Promise<void> {
    const runs = await this.ctx.storage.list<RunRecord>({ prefix: 'rec:' })
    const active = [...runs.values()].some(
      (record) => !isTerminalRunStatus(record.status),
    )
    if (active) await this.ctx.storage.setAlarm(Date.now() + 30_000)
  }
}
