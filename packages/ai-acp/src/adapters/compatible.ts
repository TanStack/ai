import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import {
  appendOutputSchemaInstruction,
  parseJsonFromAssistantText,
  structuredOutputCompleteChunk,
  structuredOutputStartChunk,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  DurableAttachNotSupportedError,
  SandboxCapability,
  buildApprovalRequestedEvent,
  createBridgeEventChannel,
  getSandbox,
  getSandboxDurability,
  getToolBridgeProvisioner,
  getWorkspaceProjection,
  mergeChunkStreams,
  nodeHttpBridgeProvisioner,
  resolveDurableRunId,
  resolveHarnessCwd,
} from '@tanstack/ai-sandbox'
import { AsyncQueue } from '../stream/queue'
import { startAcpSession } from '../session/acp-client'
import { translateAcpStream } from '../stream/translate'
import { resolveInteractivePermission, resolvePermission } from '../permissions'
import { buildAcpPrompt } from '../messages/prompt'
import { projectAcpWorkspace, workspaceMcpServers } from './projection'
import type { AcpMcpServer } from './projection'
import type { HostToolBridge, SandboxHandle } from '@tanstack/ai-sandbox'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  AdapterYieldChunk,
  TextOptions,
} from '@tanstack/ai'
import type { AcpSessionHandle } from '../session/acp-client'
import type { AcpStreamEvent } from '../stream/translate'
import type { AcpSessionTransport } from '../transport/types'
import type {
  AcpPermissionMode,
  AcpSessionUpdate,
  PermissionHandler,
} from '../types/acp-types'
import type { BuiltAcpPrompt } from '../messages/prompt'

const DEFAULT_WORKDIR = '/workspace'

export interface AcpHarnessContext<
  TModelOptions extends Record<string, any> = AcpCompatibleProviderOptions,
> {
  /** The sandbox the harness runs in (from `withSandbox(...)` middleware). */
  sandbox: SandboxHandle
  /** The selected model id. */
  model: string
  /** Virtual cwd for `sandbox.process.spawn` (the provider maps `/workspace`). */
  cwd: string
  /** Literal cwd for the harness's own `--cwd` flag / ACP `newSession`. */
  harnessCwd: string
  /** Extra env vars configured for the harness process. */
  env: Record<string, string> | undefined
  modelOptions: TModelOptions | undefined
  /** Abort signal for the run, when one was provided. */
  signal: AbortSignal | undefined
}

/** Union of selectable model names from a `models` tuple (any string if omitted). */
export type AcpModelNameOf<TModels extends ReadonlyArray<string>> =
  TModels[number]

export interface AcpCompatibleConfig<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TModelOptions extends Record<string, any> = AcpCompatibleProviderOptions,
> {
  name: string
  models?: TModels
  modelOptions?: TModelOptions
  command?: (
    ctx: AcpHarnessContext<AcpCompatibleProviderOptions & TModelOptions>,
  ) => string
  openTransport?: (
    ctx: AcpHarnessContext<AcpCompatibleProviderOptions & TModelOptions>,
  ) => Promise<AcpSessionTransport> | AcpSessionTransport
  /** Working directory inside the sandbox. Defaults to `/workspace`. */
  cwd?: string
  skillsDir?: string
  /** Extra environment variables for the harness process. */
  env?: Record<string, string>
  authMode?: 'host' | 'api-key'
  authMethodId?: string
  /** ACP permission policy. Defaults to `'bypassPermissions'`. */
  permissionMode?: AcpPermissionMode
  permissions?: 'headless' | 'interactive'
  /** Custom permission handler; overrides {@link permissions}/{@link permissionMode}. */
  onPermissionRequest?: PermissionHandler
  /** Message used for `RUN_ERROR` when the harness refuses a request. */
  refusalMessage?: string
  /** Emit ACP `plan` updates as a CUSTOM event under this name (off by default). */
  planEventName?: string
  emitDiff?: boolean
  onExtNotification?: (method: string, params: Record<string, unknown>) => void
  buildPrompt?: (
    messages: Array<ModelMessage>,
    sessionId: string | undefined,
  ) => BuiltAcpPrompt
}

/** Per-call provider options, passed via `modelOptions` on `chat()`. */
export interface AcpCompatibleProviderOptions {
  sessionId?: string
  /** Per-call override of the harness working directory. */
  cwd?: string
  authMode?: 'host' | 'api-key'
  /** Per-call override of the ACP auth method. Ignored when authMode is `'host'`. */
  authMethodId?: string
  /** Per-call override of the ACP permission policy. */
  permissionMode?: AcpPermissionMode
}

/** Per-call options the adapter sees: the base ACP options + the harness's own. */
type ResolvedOptions<TModelOptions extends Record<string, any>> =
  AcpCompatibleProviderOptions & TModelOptions

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function disposeTransport(transport: AcpSessionTransport): Promise<void> {
  if (transport.kind === 'stdio') {
    await transport.process.kill()
    return
  }
  await transport.dispose()
}

export class AcpCompatibleTextAdapter<
  TModel extends string,
  TModelOptions extends Record<string, any> = AcpCompatibleProviderOptions,
> extends BaseTextAdapter<
  TModel,
  ResolvedOptions<TModelOptions>,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  override readonly name: string

  override readonly requires = [SandboxCapability] as const

  private readonly harness: AcpCompatibleConfig<
    ReadonlyArray<string>,
    TModelOptions
  >

  constructor(
    config: AcpCompatibleConfig<ReadonlyArray<string>, TModelOptions>,
    model: TModel,
  ) {
    super({}, model)
    if (config.command === undefined && config.openTransport === undefined) {
      throw new Error(
        `acpCompatible("${config.name}") needs either a "command" or an "openTransport".`,
      )
    }
    this.harness = config
    this.name = config.name
  }

  supportsCombinedToolsAndSchema(): boolean {
    return true
  }

  combinedStructuredOutputSource(): 'event' {
    return 'event'
  }

  private sandboxFrom(
    options: TextOptions<ResolvedOptions<TModelOptions>>,
  ): SandboxHandle {
    const ctx = options.capabilities
    if (!ctx) {
      throw new Error(
        `Adapter "${this.name}" requires a sandbox. Add withSandbox(defineSandbox({ ... })) to chat() middleware.`,
      )
    }
    return getSandbox(ctx)
  }

  private buildPrompt(
    messages: Array<ModelMessage>,
    sessionId: string | undefined,
  ): BuiltAcpPrompt {
    return this.harness.buildPrompt
      ? this.harness.buildPrompt(messages, sessionId)
      : buildAcpPrompt(messages, sessionId, this.name)
  }

  private applySystemPrompts(
    systemPrompts: Array<string>,
    prompt: string,
  ): string {
    if (systemPrompts.length === 0) return prompt
    return `${systemPrompts.join('\n\n')}\n\n${prompt}`
  }

  private makePermissionHandler(input: {
    mode: AcpPermissionMode
    bridgedToolNames: ReadonlySet<string>
    approvals: ReadonlyMap<string, boolean> | undefined
    approvalRequests: Array<AdapterYieldChunk>
    threadId: string
    runId: string
  }): PermissionHandler {
    if (this.harness.onPermissionRequest)
      return this.harness.onPermissionRequest

    if (this.harness.permissions === 'interactive') {
      return (request) => {
        const result = resolveInteractivePermission(
          request,
          input.mode,
          input.bridgedToolNames,
          input.approvals,
          this.name,
        )
        if (result.approvalId !== undefined) {
          input.approvalRequests.push(
            buildApprovalRequestedEvent({
              approvalId: result.approvalId,
              title:
                result.title ??
                request.toolCall.title ??
                request.toolCall.toolCallId,
              threadId: input.threadId,
              runId: input.runId,
              detail: { provider: this.name },
            }),
          )
        }
        return result.outcome
      }
    }

    return (request) =>
      resolvePermission(request, input.mode, input.bridgedToolNames)
  }

  private resolveAcpLayout(
    options: TextOptions<ResolvedOptions<TModelOptions>>,
    sandbox: SandboxHandle,
  ) {
    const modelOptions = options.modelOptions
    const cwd = modelOptions?.cwd ?? this.harness.cwd ?? DEFAULT_WORKDIR
    const harnessCwd = resolveHarnessCwd(sandbox, cwd)
    const runId = resolveDurableRunId(options.runId, {
      durable: false,
      adapter: 'acp',
      fallback: () => this.generateId(),
    })
    const threadId = options.threadId ?? this.generateId()
    return { modelOptions, cwd, harnessCwd, runId, threadId }
  }

  private enforceAcpDurability(
    options: TextOptions<ResolvedOptions<TModelOptions>>,
    logger: TextOptions['logger'],
    runId: string,
  ): void {
    const durability = options.capabilities
      ? getSandboxDurability(options.capabilities, { optional: true })
      : undefined
    if (durability === undefined) return
    if (durability.attach) {
      throw new DurableAttachNotSupportedError(
        'acp',
        'this adapter drives the harness over a bidirectional ACP ' +
          'connection and does not journal',
      )
    }
    logger.warn(
      'acp: sandbox durability is wired but this adapter never journals — ' +
        'this run will not be recoverable on reconnect. Use a journaling ' +
        'harness adapter for runs that must survive a host restart, or drop ' +
        'durability if these runs are not meant to.',
      { runId, adapter: 'acp' },
    )
  }

  private async provisionAcpToolBridge(
    options: TextOptions<ResolvedOptions<TModelOptions>>,
    sandbox: SandboxHandle,
    channel: ReturnType<typeof createBridgeEventChannel>,
    externalSignal: AbortSignal | undefined,
  ): Promise<HostToolBridge | undefined> {
    if (!options.tools) return undefined
    if (options.tools.length === 0) return undefined
    const provisioner =
      (options.capabilities
        ? getToolBridgeProvisioner(options.capabilities, { optional: true })
        : undefined) ?? nodeHttpBridgeProvisioner
    return provisioner.provision(options.tools, {
      provider: sandbox.provider,
      context: options.context,
      emitCustomEvent: channel.emitCustomEvent,
      ...(externalSignal ? { signal: externalSignal } : {}),
    })
  }

  private async projectAcpWorkspaceServers(
    options: TextOptions<ResolvedOptions<TModelOptions>>,
    sandbox: SandboxHandle,
  ): Promise<Array<AcpMcpServer>> {
    const projection = options.capabilities
      ? getWorkspaceProjection(options.capabilities, { optional: true })
      : undefined
    if (projection === undefined) return []
    await projectAcpWorkspace(sandbox, projection, {
      ...(this.harness.skillsDir !== undefined && {
        skillsDir: this.harness.skillsDir,
      }),
      harnessName: this.name,
    })
    return workspaceMcpServers(projection)
  }

  private resolveAcpAuth(
    modelOptions: ResolvedOptions<TModelOptions> | undefined,
  ): { mode: AcpPermissionMode; authMethodId: string | undefined } {
    const mode =
      modelOptions?.permissionMode ??
      this.harness.permissionMode ??
      'bypassPermissions'
    const authMode =
      modelOptions?.authMode ?? this.harness.authMode ?? 'api-key'
    const authMethodId =
      authMode === 'host'
        ? undefined
        : (modelOptions?.authMethodId ?? this.harness.authMethodId)
    return { mode, authMethodId }
  }

  private collectAcpMcpServers(
    bridge: HostToolBridge | undefined,
    workspaceServers: Array<AcpMcpServer>,
  ): Array<AcpMcpServer> {
    return [
      ...(bridge !== undefined
        ? [
            {
              name: bridge.name,
              url: bridge.url,
              headers: [
                { name: 'Authorization', value: `Bearer ${bridge.token}` },
              ],
            },
          ]
        : []),
      ...workspaceServers,
    ]
  }

  private bindAcpAbort(
    externalSignal: AbortSignal | undefined,
    session: AcpSessionHandle,
  ): (() => void) | undefined {
    if (externalSignal === undefined) return undefined
    const onAbort = () => void session.cancel().catch(() => undefined)
    if (externalSignal.aborted) onAbort()
    else externalSignal.addEventListener('abort', onAbort, { once: true })
    return onAbort
  }

  private composeAcpPromptText(
    options: TextOptions<ResolvedOptions<TModelOptions>>,
    session: AcpSessionHandle,
    sessionId: string | undefined,
    resumePrompt: string,
  ): string {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((p) => p.content)
      .filter((c) => c.trim() !== '')
    let promptText = this.applySystemPrompts(
      systemPrompts,
      session.resumed || sessionId === undefined
        ? resumePrompt
        : this.buildPrompt(options.messages, undefined).prompt,
    )
    if (options.outputSchema) {
      promptText = appendOutputSchemaInstruction(
        promptText,
        options.outputSchema,
      )
    }
    return promptText
  }

  private startAcpPrompt(
    session: AcpSessionHandle,
    queue: AsyncQueue<AcpStreamEvent>,
    promptText: string,
  ): void {
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
  }

  private async *streamAcpChunks(input: {
    options: TextOptions<ResolvedOptions<TModelOptions>>
    channel: ReturnType<typeof createBridgeEventChannel>
    queue: AsyncQueue<AcpStreamEvent>
    bridgedToolNames: ReadonlySet<string>
    threadId: string
    runId: string
    sandbox: SandboxHandle
    cwd: string
    approvalRequests: Array<AdapterYieldChunk>
  }): AsyncIterable<AdapterYieldChunk> {
    const {
      options,
      channel,
      queue,
      bridgedToolNames,
      threadId,
      runId,
      sandbox,
      cwd,
      approvalRequests,
    } = input
    const wantsStructured = options.outputSchema !== undefined
    let lastAssistantText = ''
    let lastTextMessageId: string | undefined
    let heldFinished: AdapterYieldChunk | undefined
    const mergedChunks = mergeChunkStreams(
      translateAcpStream(queue, {
        model: this.model,
        runId,
        threadId,
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        bridgedToolNames,
        labels: {
          sessionIdEvent: `${this.name}.session-id`,
          // Surface non-text agent content (image/audio/resource) instead of
          // dropping it — emitted as a CUSTOM `<name>.message-content` event.
          contentEvent: `${this.name}.message-content`,
          ...(this.harness.planEventName !== undefined && {
            planEvent: this.harness.planEventName,
          }),
          ...(this.harness.refusalMessage !== undefined && {
            refusalMessage: this.harness.refusalMessage,
          }),
        },
        onAcpEvent: (event) =>
          options.logger.provider(`provider=${this.name} kind=${event.kind}`, {
            chunk: event,
          }),
      }),
      channel.stream,
    )
    for await (const chunk of mergedChunks) {
      const holdFinished =
        wantsStructured && chunk.type === EventType.RUN_FINISHED
      if (holdFinished) {
        heldFinished = chunk
        continue
      }
      if (wantsStructured) {
        if (chunk.type === EventType.TEXT_MESSAGE_START) {
          lastAssistantText = ''
          if (typeof chunk.messageId === 'string' && chunk.messageId !== '') {
            lastTextMessageId = chunk.messageId
          }
        } else if (
          chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
          typeof chunk.delta === 'string'
        ) {
          lastAssistantText += chunk.delta
        }
      }
      yield chunk
    }

    if (options.outputSchema) {
      yield* this.emitParsedStructuredOutput(
        lastAssistantText,
        threadId,
        runId,
        lastTextMessageId,
      )
    }
    if (heldFinished) yield heldFinished

    // Surface any pending approval requests (interactive ask-policy actions
    // awaiting a client decision); the client approves and re-runs to continue.
    for (const event of approvalRequests) yield event

    if (this.harness.emitDiff) {
      yield* this.emitDiffChunks(sandbox, cwd, threadId, runId)
    }
  }

  private acpChatStreamErrorChunk(
    error: unknown,
    options: TextOptions<ResolvedOptions<TModelOptions>>,
    logger: TextOptions['logger'],
  ): AdapterYieldChunk {
    const err = error as Error & { code?: string }
    const rawEvent = toRunErrorRawEvent(error)
    logger.errors(`${this.name}.chatStream fatal`, {
      error,
      source: `${this.name}.chatStream`,
    })
    return {
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
  }

  private async releaseAcpChatResources(input: {
    externalSignal: AbortSignal | undefined
    onAbort: (() => void) | undefined
    handle: AcpSessionHandle | undefined
    transport: AcpSessionTransport | undefined
    bridge: HostToolBridge | undefined
  }): Promise<void> {
    if (input.externalSignal !== undefined && input.onAbort !== undefined) {
      input.externalSignal.removeEventListener('abort', input.onAbort)
    }
    if (input.handle !== undefined) await input.handle.dispose()
    else if (input.transport !== undefined)
      await disposeTransport(input.transport)
    await input.bridge?.close()
  }

  async *chatStream(
    options: TextOptions<ResolvedOptions<TModelOptions>>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    let handle: AcpSessionHandle | undefined
    let bridge: HostToolBridge | undefined
    let transport: AcpSessionTransport | undefined
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal ?? undefined
    let onAbort: (() => void) | undefined

    try {
      const sandbox = this.sandboxFrom(options)
      const { modelOptions, cwd, harnessCwd, runId, threadId } =
        this.resolveAcpLayout(options, sandbox)
      this.enforceAcpDurability(options, logger, runId)

      const channel = createBridgeEventChannel({
        model: this.model,
        threadId,
        runId,
      })

      const sessionId = modelOptions?.sessionId
      const { prompt: resumePrompt } = this.buildPrompt(
        options.messages,
        sessionId,
      )

      const bridgedToolNames = new Set(
        (options.tools ?? []).map((tool) => tool.name),
      )
      bridge = await this.provisionAcpToolBridge(
        options,
        sandbox,
        channel,
        externalSignal,
      )
      const workspaceServers = await this.projectAcpWorkspaceServers(
        options,
        sandbox,
      )

      const ctx: AcpHarnessContext<ResolvedOptions<TModelOptions>> = {
        sandbox,
        model: this.model,
        cwd,
        harnessCwd,
        env: this.harness.env,
        modelOptions,
        signal: externalSignal,
      }
      transport = this.harness.openTransport
        ? await this.harness.openTransport(ctx)
        : await this.openStdioTransport(ctx)

      const { mode, authMethodId } = this.resolveAcpAuth(modelOptions)
      const approvalRequests: Array<AdapterYieldChunk> = []
      const permissionHandler = this.makePermissionHandler({
        mode,
        bridgedToolNames,
        approvals: options.approvals,
        approvalRequests,
        threadId,
        runId,
      })

      const queue = new AsyncQueue<AcpStreamEvent>()

      logger.request(
        `activity=chat provider=${this.name} model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${sessionId ?? 'none'}`,
        { provider: this.name, model: this.model },
      )

      const mcpServers = this.collectAcpMcpServers(bridge, workspaceServers)

      const onAcpUpdate = (update: AcpSessionUpdate) =>
        queue.push({ kind: 'update', update })
      handle = await startAcpSession({
        transport,
        cwd: harnessCwd,
        ...(authMethodId !== undefined && { authMethodId }),
        ...(sessionId !== undefined && { resumeSessionId: sessionId }),
        ...(mcpServers.length > 0 && { mcpServers }),
        onUpdate: onAcpUpdate,
        ...(this.harness.onExtNotification && {
          onExtNotification: this.harness.onExtNotification,
        }),
        onPermissionRequest: permissionHandler,
      })
      const session = handle

      onAbort = this.bindAcpAbort(externalSignal, session)
      queue.push({ kind: 'session', sessionId: session.sessionId })

      const promptText = this.composeAcpPromptText(
        options,
        session,
        sessionId,
        resumePrompt,
      )
      this.startAcpPrompt(session, queue, promptText)

      yield* this.streamAcpChunks({
        options,
        channel,
        queue,
        bridgedToolNames,
        threadId,
        runId,
        sandbox,
        cwd,
        approvalRequests,
      })
    } catch (error: unknown) {
      yield this.acpChatStreamErrorChunk(error, options, logger)
    } finally {
      await this.releaseAcpChatResources({
        externalSignal,
        onAbort,
        handle,
        transport,
        bridge,
      })
    }
  }

  private async openStdioTransport(
    ctx: AcpHarnessContext<ResolvedOptions<TModelOptions>>,
  ): Promise<AcpSessionTransport> {
    const build = this.harness.command
    if (build === undefined) {
      // Unreachable — the constructor requires `command` or `openTransport`,
      // and this path only runs when `openTransport` is absent.
      throw new Error(
        `acpCompatible("${this.name}") has no "command" to launch over stdio.`,
      )
    }
    const command = build(ctx)
    const proc = await ctx.sandbox.process.spawn(command, {
      cwd: ctx.cwd,
      ...(this.harness.env ? { env: this.harness.env } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    })
    return { kind: 'stdio', process: proc }
  }

  private async *emitDiffChunks(
    sandbox: SandboxHandle,
    cwd: string,
    threadId: string,
    runId: string,
  ): AsyncIterable<AdapterYieldChunk> {
    try {
      const diff = await sandbox.process.exec(`git -C ${q(cwd)} diff`, { cwd })
      const hasDiff = diff.exitCode === 0 && diff.stdout.trim() !== ''
      if (hasDiff) {
        yield {
          type: EventType.CUSTOM,
          name: 'file.changed',
          value: { path: '.', diff: diff.stdout },
          timestamp: Date.now(),
          threadId,
          runId,
        }
      }
    } catch {
      // ignore — diff is best-effort
    }
  }

  private *emitParsedStructuredOutput(
    raw: string,
    threadId: string,
    runId: string,
    messageId = this.generateId(),
  ): Generator<AdapterYieldChunk> {
    try {
      const object = parseJsonFromAssistantText(raw)
      yield structuredOutputStartChunk({
        messageId,
        model: this.model,
        threadId,
        runId,
      })
      yield structuredOutputCompleteChunk({
        messageId,
        model: this.model,
        threadId,
        runId,
        object,
        raw,
      })
    } catch (error: unknown) {
      const parserMessage =
        error instanceof Error
          ? error.message
          : 'Failed to parse structured output'
      const preview = raw.trim().slice(0, 200)
      const message =
        preview === '' ? parserMessage : `${parserMessage} Content: ${preview}`
      yield {
        type: EventType.RUN_ERROR,
        model: this.model,
        timestamp: Date.now(),
        message,
        code: 'structured-output-parse-failed',
        error: { message, code: 'structured-output-parse-failed' },
      }
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<ResolvedOptions<TModelOptions>>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        'This harness honors outputSchema on chat() in the same turn. ' +
          'Pass outputSchema to chat(), or use a model adapter for a one-shot extract.',
      ),
    )
  }
}

export function acpCompatible<
  const TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TModelOptions extends Record<string, any> = AcpCompatibleProviderOptions,
>(config: AcpCompatibleConfig<TModels, TModelOptions>) {
  return <TModel extends AcpModelNameOf<TModels>>(
    model: TModel,
    overrides?: Partial<AcpCompatibleConfig<TModels, TModelOptions>>,
  ): AcpCompatibleTextAdapter<TModel, TModelOptions> =>
    new AcpCompatibleTextAdapter<TModel, TModelOptions>(
      overrides ? { ...config, ...overrides } : config,
      model,
    )
}

export function acpCompatibleText<
  TModel extends string,
  TModelOptions extends Record<string, any> = AcpCompatibleProviderOptions,
>(
  model: TModel,
  config: AcpCompatibleConfig<ReadonlyArray<string>, TModelOptions>,
): AcpCompatibleTextAdapter<TModel, TModelOptions> {
  return new AcpCompatibleTextAdapter<TModel, TModelOptions>(config, model)
}
