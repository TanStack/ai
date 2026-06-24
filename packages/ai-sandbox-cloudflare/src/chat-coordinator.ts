/**
 * `ChatSandboxCoordinator` — the concrete {@link SandboxCoordinator} for the
 * DO-DRIVES model: the Durable Object runs `chat()` ITSELF and hosts the MCP
 * tool-bridge from its own `fetch` handler.
 *
 *     Worker (stateless trigger)
 *        → ChatSandboxCoordinator (this DO: runs chat(), owns the sandbox + log)
 *           → Cloudflare Sandbox (the container the agent executes in)
 *
 * It implements the one per-model seam, {@link buildRunStream}, by running
 * `chat()` in the DO with two middlewares: our DO-backed tool-bridge provisioner
 * (so the bridge is served from this DO instead of a `node:http` listener) and
 * `withSandbox(...)` (the handle the harness adapter needs). The per-run config —
 * which adapter, which sandbox, which chat()-tools — is the subclass's
 * {@link config} method; everything else (run-log, streaming tail, watchdog) is
 * inherited from the base.
 *
 * The MCP tool-bridge lives at `/_bridge/:runId`, gated by a per-run bearer
 * token, served from {@link handleRoute}. The in-sandbox agent reaches it via
 * the Worker's public hostname.
 *
 * NOTE: Workers-runtime code — compiles against the real Cloudflare + TanStack
 * AI types; not runtime-verified in this repo (no Workers runtime here).
 */
import { chat, defineChatMiddleware } from '@tanstack/ai'
import {
  ToolBridgeProvisionerCapability,
  createToolBridgeCore,
  handleBridgeJsonRpc,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { SandboxCoordinator, resolveBridgeOrigin } from './coordinator'
import { timingSafeBearerEqualWeb } from './web-crypto'
import type { StartRunInput } from './coordinator'
import type {
  AnyTextAdapter,
  AnyTool,
  StreamChunk,
  SystemPrompt,
} from '@tanstack/ai'
import type {
  ProvisionedBridge,
  SandboxDefinition,
  ToolBridgeCore,
  ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'

/**
 * The Env bindings a {@link ChatSandboxCoordinator} requires. The bridge origin the
 * SANDBOX calls back on needs a hostname; `PUBLIC_HOSTNAME` is OPTIONAL — when
 * unset, the coordinator derives it from the trigger request (locally →
 * `host.docker.internal`; safe on Cloudflare). See {@link resolveBridgeOrigin}.
 */
export interface ChatCoordinatorEnv {
  /**
   * Hostname the CONTAINER uses to reach the Worker's tool-bridge (`/_bridge`).
   * Optional: unset → derived from each trigger request (deployed: the request
   * host; local dev: `host.docker.internal`). Set it only to override — e.g. a
   * stable named-tunnel host. See {@link resolveBridgeOrigin}. (Browser-facing
   * preview URLs use a separate `PREVIEW_HOSTNAME`; see {@link resolvePreviewHost}.)
   */
  PUBLIC_HOSTNAME?: string
}

/** What {@link ChatSandboxCoordinator.config} returns for one run. */
export interface ChatRunConfig {
  /** The harness/text adapter `chat()` runs (e.g. `claudeCodeText('sonnet')`). */
  adapter: AnyTextAdapter
  /** The sandbox the agent executes in, projected by `withSandbox`. */
  sandbox: SandboxDefinition
  /** chat()-provided server tools bridged into the harness over MCP. */
  tools?: Array<AnyTool>
  /** Base system prompts prepended to the run's `chat()` (e.g. `[PREVIEW_GUIDANCE]`). */
  systemPrompts?: Array<SystemPrompt>
}

/** Per-run bridge state so `/_bridge/:runId` can authenticate + serve. */
interface BridgeState {
  token: string
  core: ToolBridgeCore
}

export abstract class ChatSandboxCoordinator<
  TEnv extends ChatCoordinatorEnv = ChatCoordinatorEnv,
> extends SandboxCoordinator<TEnv> {
  /**
   * Live per-run bridges, keyed by runId. In-memory by design: a bridge is only
   * reachable while its run is in flight, and `ctx.waitUntil(done)` keeps THIS
   * instance alive (un-hibernated) for the run's whole lifetime — so the agent's
   * MCP calls always hit the instance that provisioned the bridge. A request for
   * a run with no live bridge (finished, or never started here) is a hard 404,
   * not a silent re-provision.
   */
  private readonly bridges = new Map<string, BridgeState>()

  // ===========================================================================
  // Subclass seam: the per-run configuration
  // ===========================================================================

  /**
   * Resolve the adapter, sandbox, and chat()-tools for one run. Implemented by
   * the app subclass (or supplied by {@link createCloudflareSandboxAgent}); this
   * is the only model-specific input the DO-drives coordinator needs.
   */
  protected abstract config(input: StartRunInput): ChatRunConfig

  // ===========================================================================
  // The one per-model seam: run chat() in the DO
  // ===========================================================================

  /**
   * Run `chat()` IN the DO, streaming its `StreamChunk`s. `stream: true` (with no
   * outputSchema) makes chat() return an `AsyncIterable<StreamChunk>` directly —
   * no cast needed for the run driver. Both middlewares run `setup` before
   * streaming begins: our middleware provides the DO-backed bridge provisioner,
   * and `withSandbox` provides the sandbox handle the harness adapter needs.
   */
  protected override buildRunStream(
    input: StartRunInput,
  ): AsyncIterable<StreamChunk> {
    const { adapter, sandbox, tools, systemPrompts } = this.config(input)
    return chat({
      threadId: input.threadId,
      adapter,
      messages: input.messages,
      stream: true,
      ...(tools !== undefined ? { tools } : {}),
      ...(systemPrompts !== undefined ? { systemPrompts } : {}),
      middleware: [
        this.bridgeProvisionerMiddleware(input),
        withSandbox(sandbox),
      ],
    })
  }

  /** Drop the per-run bridge once the run is terminal (override from base). */
  protected override onRunSettled(runId: string): void {
    this.bridges.delete(runId)
  }

  // ===========================================================================
  // The DO-backed tool-bridge provisioner + endpoint
  // ===========================================================================

  /**
   * A tiny middleware that PROVIDES our DO-backed {@link ToolBridgeProvisioner}.
   * The harness adapter reads it via `getOptional` and falls back to the
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
    // Container→Worker origin: `PUBLIC_HOSTNAME` if set, else derived from the
    // trigger request (locally → host.docker.internal). The bearer token rides
    // this URL. See `resolveBridgeOrigin`.
    const origin = resolveBridgeOrigin(env, input)
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
          url: `${origin}/_bridge/${runId}?threadId=${encodeURIComponent(threadId)}`,
          token,
          close: () => {
            bridges.delete(runId)
            return Promise.resolve()
          },
        })
      },
    }
  }

  /** Serve `/_bridge/:runId` (the in-sandbox agent's MCP calls) from the base fetch. */
  protected override handleRoute(
    request: Request,
    parts: Array<string>,
  ): Promise<Response> | Response {
    if (parts[0] === '_bridge' && typeof parts[1] === 'string') {
      return this.serveBridge(parts[1], request)
    }
    return super.handleRoute(request, parts)
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
    let message: unknown
    try {
      message = await request.json()
    } catch {
      // A malformed body must still produce a valid JSON-RPC error so the agent's
      // MCP client can react, rather than an opaque DO 500 that can wedge the run.
      return this.jsonResponse({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      })
    }
    const reply = await handleBridgeJsonRpc(bridge.core, message)
    // A notification (no id) yields null → MCP expects an empty 202 ack.
    if (reply === null) return new Response(null, { status: 202 })
    return this.jsonResponse(reply)
  }
}
