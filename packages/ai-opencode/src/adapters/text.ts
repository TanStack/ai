import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  SandboxCapability,
  buildApprovalRequestedEvent,
  getSandbox,
  hostForSandbox,
  startHostToolBridge,
} from '@tanstack/ai-sandbox'
import { buildPrompt } from '../messages/prompt'
import { startOpencodeSession } from '../process/server'
import { startOpencodeServerInSandbox } from '../process/sandbox-server'
import { resolveInteractivePermission } from '../process/permissions'
import { AsyncQueue } from '../stream/queue'
import { translateOpencodeStream } from '../stream/translate'
import type { HostToolBridge, SandboxHandle } from '@tanstack/ai-sandbox'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { OpencodeSessionHandle } from '../process/server'
import type {
  OpencodePermissionMode,
  PermissionHandler,
} from '../process/permissions'
import type { OpencodeStreamEvent } from '../stream/sdk-types'
import type { OpencodeModel } from '../model-meta'
import type { OpencodeTextProviderOptions } from '../provider-options'

const DEFAULT_WORKDIR = '/workspace'
const DEFAULT_PORT = 4096

export interface OpencodeTextConfig {
  /** Working directory inside the sandbox. Defaults to `/workspace`. */
  directory?: string
  /**
   * Port the in-sandbox `opencode serve` listens on. Defaults to 4096. For the
   * Docker provider this port must also be published (`publishPorts: [4096]`)
   * so the host can reach it.
   */
  port?: number
  /** Hostname the in-sandbox server binds. Defaults to `0.0.0.0`. */
  hostname?: string
  /**
   * OpenCode permission mode driving the dynamic permission handler. Defaults
   * to `'default'`; set `'acceptEdits'` / `'bypassPermissions'` to let the
   * harness edit files and run commands autonomously inside the sandbox.
   */
  permissionMode?: OpencodePermissionMode
  /** Custom permission handler; replaces the adapter's default policy. */
  onPermissionRequest?: PermissionHandler
}

/** Split a `provider/model` id into its provider and model halves. */
function splitModel(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error(
      `OpenCode models must be addressed as "provider/model" (e.g. "anthropic/claude-sonnet-4-5"); received "${model}".`,
    )
  }
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) }
}

export class OpencodeTextAdapter<
  TModel extends OpencodeModel,
> extends BaseTextAdapter<
  TModel,
  OpencodeTextProviderOptions,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  readonly name = 'opencode' as const

  override readonly requires = [SandboxCapability] as const

  private readonly adapterConfig: OpencodeTextConfig

  constructor(config: OpencodeTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  private sandboxFrom(
    options: TextOptions<OpencodeTextProviderOptions>,
  ): SandboxHandle {
    const ctx = options.capabilities
    if (!ctx) {
      throw new Error(
        'Adapter "opencode" requires a sandbox. Add withSandbox(defineSandbox({ ... })) to chat() middleware.',
      )
    }
    return getSandbox(ctx)
  }

  private applySystemPrompts(
    options: TextOptions<OpencodeTextProviderOptions>,
    prompt: string,
  ): string {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((systemPrompt) => systemPrompt.content)
      .filter((content) => content.trim() !== '')
    if (systemPrompts.length === 0) return prompt
    return `${systemPrompts.join('\n\n')}\n\n${prompt}`
  }

  async *chatStream(
    options: TextOptions<OpencodeTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let server:
      | Awaited<ReturnType<typeof startOpencodeServerInSandbox>>
      | undefined
    let handle: OpencodeSessionHandle | undefined
    let bridge: HostToolBridge | undefined
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal ?? undefined
    let onAbort: (() => void) | undefined

    try {
      const sandbox = this.sandboxFrom(options)
      const directory =
        options.modelOptions?.directory ??
        this.adapterConfig.directory ??
        DEFAULT_WORKDIR

      const modelOptions = options.modelOptions
      const sessionId = modelOptions?.sessionId
      const { prompt: resumePrompt } = buildPrompt(options.messages, sessionId)
      const { providerID, modelID } = splitModel(this.model)

      // Bridge chat()-provided tools into the in-sandbox server over MCP
      // (configured via OPENCODE_CONFIG_CONTENT at server spawn).
      const bridgedToolNames = new Set(
        (options.tools ?? []).map((tool) => tool.name),
      )
      if (options.tools && options.tools.length > 0) {
        bridge = await startHostToolBridge(options.tools, {
          hostForSandbox: hostForSandbox(sandbox.provider),
          context: options.context,
          ...(externalSignal ? { signal: externalSignal } : {}),
        })
      }

      const runId = options.runId ?? this.generateId()
      const threadId = options.threadId ?? this.generateId()
      // Approval-requested events for `ask`-policy actions with no client
      // decision yet, emitted after the stream so the client can approve + re-run.
      const approvalRequests: Array<StreamChunk> = []

      const queue = new AsyncQueue<OpencodeStreamEvent>()
      const mode =
        modelOptions?.permissionMode ??
        this.adapterConfig.permissionMode ??
        'default'
      const permissionHandler: PermissionHandler =
        this.adapterConfig.onPermissionRequest ??
        ((request) => {
          const result = resolveInteractivePermission(
            request,
            mode,
            bridgedToolNames,
            options.approvals,
          )
          if (result.approvalId !== undefined) {
            approvalRequests.push(
              buildApprovalRequestedEvent({
                approvalId: result.approvalId,
                title: result.title ?? request.title,
                threadId,
                runId,
                detail: { provider: 'opencode' },
              }),
            )
          }
          return result.response
        })

      logger.request(
        `activity=chat provider=opencode model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${sessionId ?? 'none'}`,
        { provider: 'opencode', model: this.model },
      )

      const serverEnv = bridge
        ? {
            OPENCODE_CONFIG_CONTENT: JSON.stringify({
              mcp: {
                [bridge.name]: {
                  type: 'remote',
                  url: bridge.url,
                  enabled: true,
                  headers: { Authorization: `Bearer ${bridge.token}` },
                },
              },
            }),
          }
        : undefined

      server = await startOpencodeServerInSandbox(sandbox, {
        port: this.adapterConfig.port ?? DEFAULT_PORT,
        ...(this.adapterConfig.hostname !== undefined && {
          hostname: this.adapterConfig.hostname,
        }),
        cwd: directory,
        ...(serverEnv ? { env: serverEnv } : {}),
        ...(externalSignal ? { signal: externalSignal } : {}),
      })

      handle = await startOpencodeSession({
        baseUrl: server.baseUrl,
        directory,
        providerID,
        modelID,
        ...(sessionId !== undefined && { resumeSessionId: sessionId }),
        onEvent: (event) => queue.push({ kind: 'event', event }),
        onPermissionRequest: permissionHandler,
        onError: (error) => queue.fail(error),
      })
      const session = handle

      if (externalSignal !== undefined) {
        onAbort = () => void session.abort().catch(() => undefined)
        if (externalSignal.aborted) onAbort()
        else externalSignal.addEventListener('abort', onAbort, { once: true })
      }

      queue.push({ kind: 'session', sessionId: session.sessionId })

      const promptText = this.applySystemPrompts(
        options,
        session.resumed || sessionId === undefined
          ? resumePrompt
          : buildPrompt(options.messages, undefined).prompt,
      )

      session
        .prompt(promptText)
        .then(({ message }) => {
          queue.push({ kind: 'done', message })
          queue.end()
        })
        .catch((error: unknown) => queue.fail(error))

      yield* translateOpencodeStream(queue, {
        model: this.model,
        runId,
        threadId,
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        bridgedToolNames,
        onStreamEvent: (event) =>
          logger.provider(`provider=opencode kind=${event.kind}`, {
            chunk: event,
          }),
      })

      // Surface pending approval requests (ask-policy actions awaiting a client
      // decision); the client approves and re-runs to continue.
      for (const event of approvalRequests) yield event
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('opencode.chatStream fatal', {
        error,
        source: 'opencode.chatStream',
      })
      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: err.message || 'Unknown error occurred',
        ...(err.code !== undefined && { code: err.code }),
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: err.message || 'Unknown error occurred',
          ...(err.code !== undefined && { code: err.code }),
        },
      }
    } finally {
      if (externalSignal !== undefined && onAbort !== undefined) {
        externalSignal.removeEventListener('abort', onAbort)
      }
      await handle?.dispose()
      await server?.dispose()
      await bridge?.close()
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<OpencodeTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        'Structured output is not yet supported by the in-sandbox OpenCode adapter. ' +
          'Use a model adapter for structured output, or omit outputSchema.',
      ),
    )
  }
}

/**
 * Creates an OpenCode harness adapter that runs **inside a sandbox**.
 *
 * It declares `requires: [SandboxCapability]`, spawns `opencode serve` inside
 * the sandbox provided by `withSandbox(...)`, exposes its port, and connects
 * the `@opencode-ai/sdk` HTTP client to it. OpenCode owns the agent loop and
 * executes its native tools against the sandbox workspace. The sandbox image
 * must provide the `opencode` executable (Docker: also publish the server port
 * via `publishPorts`). chat()-provided tools aren't bridged yet.
 */
export function opencodeText<TModel extends OpencodeModel>(
  model: TModel,
  config: OpencodeTextConfig = {},
): OpencodeTextAdapter<TModel> {
  return new OpencodeTextAdapter(config, model)
}
