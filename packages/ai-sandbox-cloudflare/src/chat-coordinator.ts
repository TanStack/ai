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

export interface ChatCoordinatorEnv {
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
  private readonly bridges = new Map<string, BridgeState>()

  protected abstract config(input: StartRunInput): ChatRunConfig

  protected override buildRunStream(
    input: StartRunInput,
  ): AsyncIterable<StreamChunk> {
    const { adapter, sandbox, tools, systemPrompts } = this.config(input)
    const sessionId = input.metadata?.sessionId
    const modelOptions =
      typeof sessionId === 'string' && sessionId !== ''
        ? { sessionId }
        : undefined
    return chat({
      threadId: input.threadId,
      adapter,
      messages: input.messages,
      stream: true,
      ...(tools !== undefined ? { tools } : {}),
      ...(systemPrompts !== undefined ? { systemPrompts } : {}),
      ...(modelOptions !== undefined ? { modelOptions } : {}),
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

  private makeBridgeProvisioner(input: StartRunInput): ToolBridgeProvisioner {
    const env = this.env
    const bridges = this.bridges
    const { runId, threadId } = input
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
