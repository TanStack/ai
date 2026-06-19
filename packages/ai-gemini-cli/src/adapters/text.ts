import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  SandboxCapability,
  buildApprovalRequestedEvent,
  getSandbox,
  getWorkspaceProjection,
  hostForSandbox,
  startHostToolBridge,
} from '@tanstack/ai-sandbox'
import { buildPrompt } from '../messages/prompt'
import { startAcpSession } from '../process/acp-client'
import { resolveInteractivePermission } from '../process/permissions'
import { AsyncQueue } from '../stream/queue'
import { translateAcpStream } from '../stream/translate'
import { projectGeminiWorkspace } from './projection'
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
import type { AcpSessionHandle } from '../process/acp-client'
import type {
  GeminiCliPermissionMode,
  PermissionHandler,
} from '../process/permissions'
import type { AcpStreamEvent } from '../stream/translate'
import type { GeminiCliModel } from '../model-meta'
import type { GeminiCliTextProviderOptions } from '../provider-options'

const DEFAULT_WORKDIR = '/workspace'

export interface GeminiCliTextConfig {
  /** Working directory inside the sandbox. Defaults to `/workspace`. */
  cwd?: string
  /** Path/name of the Gemini CLI executable inside the sandbox. Defaults to `gemini`. */
  executablePath?: string
  /** Extra CLI arguments appended after `--acp`. */
  extraArgs?: Array<string>
  /** Extra environment variables for the gemini process inside the sandbox. */
  env?: Record<string, string>
  /**
   * Gemini CLI permission mode. Defaults to `'default'`; set `'acceptEdits'` /
   * `'bypassPermissions'` to let the harness edit files and run commands
   * autonomously inside the sandbox.
   */
  permissionMode?: GeminiCliPermissionMode
  /** Custom permission handler; replaces the adapter's default policy. */
  onPermissionRequest?: PermissionHandler
  /**
   * ACP auth method to select before starting the session, e.g.
   * `'oauth-personal'`, `'gemini-api-key'`, or `'vertex-ai'`. Overridable per
   * call via `modelOptions.authMethodId`.
   */
  authMethodId?: string
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export class GeminiCliTextAdapter<
  TModel extends GeminiCliModel,
> extends BaseTextAdapter<
  TModel,
  GeminiCliTextProviderOptions,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  readonly name = 'gemini-cli' as const

  override readonly requires = [SandboxCapability] as const

  private readonly adapterConfig: GeminiCliTextConfig

  constructor(config: GeminiCliTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  private sandboxFrom(
    options: TextOptions<GeminiCliTextProviderOptions>,
  ): SandboxHandle {
    const ctx = options.capabilities
    if (!ctx) {
      throw new Error(
        'Adapter "gemini-cli" requires a sandbox. Add withSandbox(defineSandbox({ ... })) to chat() middleware.',
      )
    }
    return getSandbox(ctx)
  }

  private acpCommand(): string {
    const exe = this.adapterConfig.executablePath ?? 'gemini'
    const args = ['--acp', '-m', q(this.model)]
    for (const arg of this.adapterConfig.extraArgs ?? []) args.push(q(arg))
    return `${exe} ${args.join(' ')}`
  }

  private applySystemPrompts(
    options: TextOptions<GeminiCliTextProviderOptions>,
    prompt: string,
  ): string {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((systemPrompt) => systemPrompt.content)
      .filter((content) => content.trim() !== '')
    if (systemPrompts.length === 0) return prompt
    return `${systemPrompts.join('\n\n')}\n\n${prompt}`
  }

  async *chatStream(
    options: TextOptions<GeminiCliTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let handle: AcpSessionHandle | undefined
    let bridge: HostToolBridge | undefined
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal ?? undefined
    let onAbort: (() => void) | undefined

    try {
      const sandbox = this.sandboxFrom(options)

      // Project workspace skills (MCP servers, gitSkills, …) into the sandbox
      // before spawning gemini. The MCP config is always re-written so rotated
      // secrets re-apply; the marker gates the idempotent non-secret ops.
      const projection = options.capabilities
        ? getWorkspaceProjection(options.capabilities, { optional: true })
        : undefined
      if (projection !== undefined) await projectGeminiWorkspace(sandbox, projection)

      const cwd =
        options.modelOptions?.cwd ?? this.adapterConfig.cwd ?? DEFAULT_WORKDIR

      const modelOptions = options.modelOptions
      const sessionId = modelOptions?.sessionId
      const { prompt: resumePrompt } = buildPrompt(options.messages, sessionId)

      // Bridge chat()-provided tools into the agent over MCP (ACP http server).
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
      // Approval-requested events collected during the run (an `ask` action with
      // no client decision yet) and emitted after the stream so the client can
      // approve and re-run.
      const approvalRequests: Array<StreamChunk> = []

      const queue = new AsyncQueue<AcpStreamEvent>()
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
                title:
                  result.title ??
                  request.toolCall.title ??
                  request.toolCall.toolCallId,
                threadId,
                runId,
                detail: { provider: 'gemini-cli' },
              }),
            )
          }
          return result.outcome
        })

      logger.request(
        `activity=chat provider=gemini-cli model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${sessionId ?? 'none'}`,
        { provider: 'gemini-cli', model: this.model },
      )

      const proc = await sandbox.process.spawn(this.acpCommand(), {
        cwd,
        ...(this.adapterConfig.env ? { env: this.adapterConfig.env } : {}),
        ...(externalSignal ? { signal: externalSignal } : {}),
      })

      handle = await startAcpSession({
        process: proc,
        cwd,
        ...((modelOptions?.authMethodId ?? this.adapterConfig.authMethodId) !==
          undefined && {
          authMethodId:
            modelOptions?.authMethodId ?? this.adapterConfig.authMethodId,
        }),
        ...(sessionId !== undefined && { resumeSessionId: sessionId }),
        ...(bridge !== undefined && {
          mcpServers: [
            {
              name: bridge.name,
              url: bridge.url,
              headers: [
                { name: 'Authorization', value: `Bearer ${bridge.token}` },
              ],
            },
          ],
        }),
        onUpdate: (update) => queue.push({ kind: 'update', update }),
        onPermissionRequest: permissionHandler,
      })
      const session = handle

      if (externalSignal !== undefined) {
        onAbort = () => void session.cancel().catch(() => undefined)
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
        .then(({ stopReason, usage }) => {
          queue.push({
            kind: 'done',
            stopReason,
            ...(usage !== undefined && { usage }),
          })
          queue.end()
        })
        .catch((error: unknown) => queue.fail(error))

      yield* translateAcpStream(queue, {
        model: this.model,
        runId,
        threadId,
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        bridgedToolNames,
        onAcpEvent: (event) =>
          logger.provider(`provider=gemini-cli kind=${event.kind}`, {
            chunk: event,
          }),
      })

      // Surface any pending approval requests (ask-policy actions awaiting a
      // client decision); the client approves and re-runs to continue.
      for (const event of approvalRequests) yield event
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('gemini-cli.chatStream fatal', {
        error,
        source: 'gemini-cli.chatStream',
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
      await bridge?.close()
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<GeminiCliTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        'Structured output is not yet supported by the in-sandbox Gemini CLI adapter. ' +
          'Use a model adapter for structured output, or omit outputSchema.',
      ),
    )
  }
}

/**
 * Creates a Gemini CLI harness adapter that runs **inside a sandbox**.
 *
 * It declares `requires: [SandboxCapability]` and spawns `gemini --acp` inside
 * the sandbox provided by `withSandbox(...)`, driving it over the Agent Client
 * Protocol via the sandbox's duplex process IO. The sandbox image must provide
 * the `gemini` executable, authenticated for headless use (or pass
 * `authMethodId`). chat()-provided tools aren't bridged yet (the agent uses its
 * native tools).
 */
export function geminiCliText<TModel extends GeminiCliModel>(
  model: TModel,
  config: GeminiCliTextConfig = {},
): GeminiCliTextAdapter<TModel> {
  return new GeminiCliTextAdapter(config, model)
}
