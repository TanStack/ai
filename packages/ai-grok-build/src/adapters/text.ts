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
  AsyncQueue,
  resolvePermission,
  startAcpSession,
  translateAcpStream,
} from '@tanstack/ai-acp'
import {
  DurableAttachNotSupportedError,
  SandboxCapability,
  createBridgeEventChannel,
  alignedIfAttaching,
  createRunScopedIdGen,
  getSandbox,
  getSandboxDurability,
  getSandboxPolicy,
  getToolBridgeProvisioner,
  getWorkspaceProjection,
  journalOptionsFor,
  mergeChunkStreams,
  nodeHttpBridgeProvisioner,
  resolveDurableRunId,
  resolveDurableThreadId,
  resolveHarnessCwd,
  spawnNdjson,
} from '@tanstack/ai-sandbox'
import { buildPrompt } from '../messages/prompt'
import { formatAcpRequestError, resolveGrokSessionAuthMethod } from '../auth'
import type { GrokBuildAuthMode } from '../auth'
import { createGrokAcpNotificationHandler } from '../process/grok-acp-notifications'
import { openGrokAcpConnection } from '../process/acp'
import { resolveGrokExecutable } from '../process/resolve-executable'
import { resolveGrokCliModel } from '../model-meta'
import { SESSION_ID_EVENT, translateThreadEvents } from '../stream/translate'
import { projectGrokMcpBridge, projectGrokWorkspace } from './projection'
import { mapPolicyToGrokBuildFlags } from './policy-map'
import type { GrokBuildPolicyFlags } from './policy-map'
import type {
  AcpPermissionMode,
  AcpSessionHandle,
  AcpSessionUpdate,
  AcpStreamEvent,
  AcpTransportPreference,
} from '@tanstack/ai-acp'
import type { HostToolBridge, SandboxHandle } from '@tanstack/ai-sandbox'
import type {
  GrokBuildProtocol,
  GrokBuildTextProviderOptions,
} from '../provider-options'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  AdapterYieldChunk,
  TextOptions,
} from '@tanstack/ai'
import type { GrokBuildModel } from '../model-meta'
import type { GrokBuildStreamEvent } from '../stream/sdk-types'

const DEFAULT_WORKDIR = '/workspace'

export interface GrokBuildTextConfig {
  /** Working directory inside the sandbox. Defaults to `/workspace`. */
  cwd?: string
  /** Path/name of the grok executable inside the sandbox. Defaults to `grok`. */
  grokExecutable?: string
  /** Extra environment variables for the grok process inside the sandbox. */
  env?: Record<string, string>
  /** Emit a `file.changed` CUSTOM event with the git diff after the run (default true). */
  emitDiff?: boolean
  /** Extra raw CLI flags appended verbatim (advanced). */
  extraArgs?: Array<string>
  /**
   * Harness wire protocol. Defaults to `'acp'`. A durable sandbox run
   * (durability wired, no explicit protocol) uses `'streaming-json'` so the
   * run can journal and recover. Set `'streaming-json'` yourself for the
   * headless NDJSON path without durability.
   */
  protocol?: GrokBuildProtocol
  /** ACP transport when `protocol` is `'acp'`. Defaults to `'auto'`. */
  transport?: AcpTransportPreference
  /**
   * `'api-key'` (default) calls authenticate with `xai.api_key`.
   * `'host'` skips ACP authenticate (use `grok login`).
   * Not inferred from the sandbox.
   */
  authMode?: GrokBuildAuthMode
  /** Explicit ACP auth method. Wins over {@link authMode}. */
  authMethodId?: string
  /** ACP permission policy. Defaults to `'bypassPermissions'`. */
  permissionMode?: AcpPermissionMode
  /** Port for in-sandbox `grok agent serve` when using WebSocket transport. */
  acpPort?: number
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function abortSignalFields(
  options: TextOptions<GrokBuildTextProviderOptions>,
): { signal: AbortSignal } | Record<string, never> {
  if (options.abortController?.signal) {
    return { signal: options.abortController.signal }
  }
  if (options.request?.signal) {
    return { signal: options.request.signal }
  }
  return {}
}

function grokBuildRunErrorChunk(
  error: unknown,
  model: string,
): AdapterYieldChunk {
  const err = error as Error & { code?: string }
  const rawEvent = toRunErrorRawEvent(error)
  const message = formatAcpRequestError(error)
  return {
    type: EventType.RUN_ERROR,
    model,
    timestamp: Date.now(),
    message,
    ...(err.code !== undefined && { code: err.code }),
    ...(rawEvent !== undefined && { rawEvent }),
    error: {
      message,
      ...(err.code !== undefined && { code: err.code }),
    },
  }
}

function collectAcpAssistantText(
  chunk: AdapterYieldChunk,
  state: { text: string; messageId: string | undefined },
): void {
  if (chunk.type === EventType.TEXT_MESSAGE_START) {
    state.text = ''
    if (typeof chunk.messageId === 'string' && chunk.messageId !== '') {
      state.messageId = chunk.messageId
    }
    return
  }
  if (
    chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
    typeof chunk.delta === 'string'
  ) {
    state.text += chunk.delta
  }
}

export class GrokBuildTextAdapter<
  TModel extends GrokBuildModel,
> extends BaseTextAdapter<
  TModel,
  GrokBuildTextProviderOptions,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  readonly name = 'grok-build' as const

  override readonly requires = [SandboxCapability] as const

  private readonly adapterConfig: GrokBuildTextConfig

  constructor(config: GrokBuildTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  private sandboxFrom(
    options: TextOptions<GrokBuildTextProviderOptions>,
  ): SandboxHandle {
    const ctx = options.capabilities
    if (!ctx) {
      throw new Error(
        'Adapter "grok-build" requires a sandbox. Add withSandbox(defineSandbox({ ... })) to chat() middleware.',
      )
    }
    return getSandbox(ctx)
  }

  private workdir(options: TextOptions<GrokBuildTextProviderOptions>): string {
    return (
      options.modelOptions?.cwd ?? this.adapterConfig.cwd ?? DEFAULT_WORKDIR
    )
  }

  /**
   * Cwd for harness-facing APIs (NDJSON `--cwd`, ACP `newSession`). Virtual `/workspace`
   * is mapped to the real filesystem path on local-process; spawn/fs still use
   * the virtual path via the provider handle.
   */
  private harnessCwd(
    sandbox: SandboxHandle,
    options: TextOptions<GrokBuildTextProviderOptions>,
  ): string {
    return resolveHarnessCwd(sandbox, this.workdir(options))
  }

  private buildCommand(
    options: TextOptions<GrokBuildTextProviderOptions>,
    resume: string | undefined,
    harnessCwd: string,
    policyFlags: GrokBuildPolicyFlags,
    prompt: string,
    exe: string,
  ): string {
    const config = this.adapterConfig
    const modelOptions = options.modelOptions
    const cliModel = resolveGrokCliModel(this.model)

    const args: Array<string> = [
      '-p',
      q(prompt),
      '--output-format',
      'streaming-json',
      '--model',
      q(cliModel),
      '--cwd',
      q(harnessCwd),
    ]

    const alwaysApprove = !policyFlags.readOnly && !policyFlags.conservative
    if (alwaysApprove) {
      args.push('--always-approve', '--no-plan', '--no-auto-update')
    } else {
      // Restrictive policy: headless `-p` auto-denies prompts under `default` mode.
      args.push('--permission-mode', 'default')
    }

    if (policyFlags.readOnly) args.push('--sandbox', 'read-only')
    if (policyFlags.networkDisabled) args.push('--disable-web-search')

    if (resume !== undefined) args.push('--resume', q(resume))

    const maxTurns = modelOptions?.maxTurns
    if (maxTurns !== undefined) args.push('--max-turns', String(maxTurns))

    for (const a of config.extraArgs ?? []) args.push(a)

    return `${exe} ${args.join(' ')}`
  }

  supportsCombinedToolsAndSchema(): boolean {
    return true
  }

  combinedStructuredOutputSource(): 'event' {
    return 'event'
  }

  private protocol(
    options: TextOptions<GrokBuildTextProviderOptions>,
  ): GrokBuildProtocol {
    const explicit =
      options.modelOptions?.protocol ?? this.adapterConfig.protocol
    if (explicit !== undefined) return explicit
    // ACP never journals. A durable run with no protocol must take the
    // NDJSON path so a host restart can recover. Issue #1081 item 5.
    const durability = options.capabilities
      ? getSandboxDurability(options.capabilities, { optional: true })
      : undefined
    if (durability !== undefined) return 'streaming-json'
    return 'acp'
  }

  async *chatStream(
    options: TextOptions<GrokBuildTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    if (this.protocol(options) === 'streaming-json') {
      yield* this.chatStreamNdjson(options)
      return
    }
    yield* this.chatStreamAcp(options)
  }

  private guardAcpDurability(
    options: TextOptions<GrokBuildTextProviderOptions>,
    runId: string,
  ): void {
    const durability = options.capabilities
      ? getSandboxDurability(options.capabilities, { optional: true })
      : undefined
    if (durability === undefined) return
    if (durability.attach) {
      throw new DurableAttachNotSupportedError(
        'grok-build',
        "protocol: 'acp' drives the harness over a bidirectional ACP " +
          'connection and never calls spawnNdjson',
      )
    }
    options.logger.warn(
      'grok-build: sandbox durability is wired but this run is using the ' +
        "'acp' protocol, which never journals — this run will not be " +
        "recoverable on reconnect. Set protocol: 'streaming-json' to " +
        'journal this run, or drop durability if ACP runs are not meant ' +
        'to survive a host restart.',
      { runId, adapter: 'grok-build', protocol: 'acp' },
    )
  }

  private async maybeProvisionGrokBridge(
    options: TextOptions<GrokBuildTextProviderOptions>,
    sandbox: SandboxHandle,
    emitCustomEvent: ReturnType<
      typeof createBridgeEventChannel
    >['emitCustomEvent'],
    signal: AbortSignal | undefined,
  ): Promise<HostToolBridge | undefined> {
    if (!options.tools) return undefined
    if (options.tools.length === 0) return undefined
    const provisioner =
      (options.capabilities
        ? getToolBridgeProvisioner(options.capabilities, { optional: true })
        : undefined) ?? nodeHttpBridgeProvisioner
    return await provisioner.provision(options.tools, {
      provider: sandbox.provider,
      context: options.context,
      emitCustomEvent,
      ...(signal ? { signal } : {}),
    })
  }

  private async *chatStreamAcp(
    options: TextOptions<GrokBuildTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    let handle: AcpSessionHandle | undefined
    let bridge: HostToolBridge | undefined
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal ?? undefined
    let onAbort: (() => void) | undefined

    try {
      const sandbox = this.sandboxFrom(options)
      /** Working directory inside the sandbox. Defaults to `/workspace`. */
      const cwd = this.workdir(options)
      const harnessCwd = this.harnessCwd(sandbox, options)
      const runId = resolveDurableRunId(options.runId, {
        durable: false,
        adapter: 'grok-build',
        fallback: () => this.generateId(),
      })
      const threadId = resolveDurableThreadId(options.threadId, {
        durable: false,
        attaching: false,
        adapter: 'grok-build',
        fallback: () => this.generateId(),
      })

      this.guardAcpDurability(options, runId)
      const channel = createBridgeEventChannel({
        model: this.model,
        threadId,
        runId,
      })

      const projection = options.capabilities
        ? getWorkspaceProjection(options.capabilities, { optional: true })
        : undefined
      if (projection) await projectGrokWorkspace(sandbox, projection)

      const modelOptions = options.modelOptions
      const sessionId = modelOptions?.sessionId
      const { prompt: resumePrompt } = buildPrompt(options.messages, sessionId)

      const bridgedToolNames = new Set(
        (options.tools ?? []).map((tool) => tool.name),
      )
      bridge = await this.maybeProvisionGrokBridge(
        options,
        sandbox,
        channel.emitCustomEvent,
        externalSignal,
      )

      const cliModel = resolveGrokCliModel(this.model)
      logger.request(
        `activity=chat provider=grok-build model=${this.model} cliModel=${cliModel} protocol=acp sandbox=${sandbox.provider} messages=${options.messages.length} resume=${sessionId ?? 'none'}`,
        { provider: 'grok-build', model: this.model },
      )
      const started = await this.startGrokAcpSession({
        options,
        sandbox,
        cwd,
        harnessCwd,
        cliModel,
        sessionId,
        bridge,
        bridgedToolNames,
        externalSignal,
      })
      handle = started.handle
      const { queue, session } = started
      onAbort = this.bindAcpAbort(session, externalSignal)

      queue.push({ kind: 'session', sessionId: session.sessionId })
      yield* this.pumpAcpStream(options, {
        session,
        queue,
        channel,
        bridgedToolNames,
        resumePrompt,
        sessionId,
        runId,
        threadId,
        sandbox,
        cwd,
      })
    } catch (error: unknown) {
      logger.errors('grok-build.chatStream fatal', {
        error,
        source: 'grok-build.chatStream',
      })
      yield grokBuildRunErrorChunk(error, options.model)
    } finally {
      if (onAbort !== undefined && externalSignal !== undefined) {
        externalSignal.removeEventListener('abort', onAbort)
      }
      await handle?.dispose()
      await bridge?.close()
    }
  }

  private async startGrokAcpSession(args: {
    options: TextOptions<GrokBuildTextProviderOptions>
    sandbox: SandboxHandle
    cwd: string
    harnessCwd: string
    cliModel: string
    sessionId: string | undefined
    bridge: HostToolBridge | undefined
    bridgedToolNames: Set<string>
    externalSignal: AbortSignal | undefined
  }): Promise<{
    handle: AcpSessionHandle
    queue: AsyncQueue<AcpStreamEvent>
    session: AcpSessionHandle
  }> {
    const {
      options,
      sandbox,
      cwd,
      harnessCwd,
      cliModel,
      sessionId,
      bridge,
      bridgedToolNames,
      externalSignal,
    } = args
    const modelOptions = options.modelOptions
    const exe = await resolveGrokExecutable(
      sandbox,
      this.adapterConfig.grokExecutable,
    )
    const connection = await openGrokAcpConnection({
      sandbox,
      exe,
      cliModel,
      cwd,
      harnessCwd,
      ...(this.adapterConfig.env ? { env: this.adapterConfig.env } : {}),
      extraArgs: this.adapterConfig.extraArgs,
      port: modelOptions?.acpPort ?? this.adapterConfig.acpPort,
      transportPreference:
        modelOptions?.transport ?? this.adapterConfig.transport ?? 'auto',
      ...(externalSignal ? { signal: externalSignal } : {}),
    })
    const mode =
      modelOptions?.permissionMode ??
      this.adapterConfig.permissionMode ??
      'bypassPermissions'
    /** Explicit ACP auth method. Wins over {@link authMode}. */
    const authMethodId = resolveGrokSessionAuthMethod(
      modelOptions?.authMode ?? this.adapterConfig.authMode,
      modelOptions?.authMethodId ?? this.adapterConfig.authMethodId,
      {
        ...process.env,
        ...this.adapterConfig.env,
      },
    )
    const queue = new AsyncQueue<AcpStreamEvent>()
    const onAcpUpdate = (update: AcpSessionUpdate) =>
      queue.push({ kind: 'update', update })
    const handle = await startAcpSession({
      transport: connection.transport,
      cwd: harnessCwd,
      ...(authMethodId !== undefined && { authMethodId }),
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
      onUpdate: onAcpUpdate,
      onExtNotification: createGrokAcpNotificationHandler(onAcpUpdate),
      onPermissionRequest: (request) =>
        resolvePermission(request, mode, bridgedToolNames),
    })
    return { handle, queue, session: handle }
  }

  private bindAcpAbort(
    session: AcpSessionHandle,
    externalSignal: AbortSignal | undefined,
  ): (() => void) | undefined {
    if (externalSignal === undefined) return undefined
    const onAbort = () => void session.cancel().catch(() => undefined)
    if (externalSignal.aborted) onAbort()
    else externalSignal.addEventListener('abort', onAbort, { once: true })
    return onAbort
  }

  private async *pumpAcpStream(
    options: TextOptions<GrokBuildTextProviderOptions>,
    args: {
      session: AcpSessionHandle
      queue: AsyncQueue<AcpStreamEvent>
      channel: ReturnType<typeof createBridgeEventChannel>
      bridgedToolNames: Set<string>
      resumePrompt: string
      sessionId: string | undefined
      runId: string
      threadId: string
      sandbox: SandboxHandle
      cwd: string
    },
  ): AsyncIterable<AdapterYieldChunk> {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((p) => p.content)
      .filter((c) => c.trim() !== '')
    let promptText = this.applySystemPrompts(
      systemPrompts,
      args.session.resumed || args.sessionId === undefined
        ? args.resumePrompt
        : buildPrompt(options.messages, undefined).prompt,
    )
    if (options.outputSchema) {
      promptText = appendOutputSchemaInstruction(
        promptText,
        options.outputSchema,
      )
    }

    args.session
      .prompt(promptText)
      .then(({ stopReason, usage }) => {
        args.queue.push({
          kind: 'done',
          stopReason,
          ...(usage !== undefined && { usage }),
        })
        args.queue.end()
      })
      .catch((error: unknown) => args.queue.fail(error))

    const wantsStructured = options.outputSchema !== undefined
    const assistant = { text: '', messageId: undefined as string | undefined }
    let heldFinished: AdapterYieldChunk | undefined
    const mergedChunks = mergeChunkStreams(
      translateAcpStream(args.queue, {
        model: this.model,
        runId: args.runId,
        threadId: args.threadId,
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        bridgedToolNames: args.bridgedToolNames,
        labels: {
          sessionIdEvent: SESSION_ID_EVENT,
          refusalMessage: 'Grok Build refused the request.',
        },
        onAcpEvent: (event) =>
          options.logger.provider(`provider=grok-build kind=${event.kind}`, {
            chunk: event,
          }),
      }),
      args.channel.stream,
    )
    for await (const chunk of mergedChunks) {
      const holdFinished =
        wantsStructured && chunk.type === EventType.RUN_FINISHED
      if (holdFinished) {
        heldFinished = chunk
        continue
      }
      if (wantsStructured) collectAcpAssistantText(chunk, assistant)
      yield chunk
    }

    if (options.outputSchema) {
      yield* this.emitParsedStructuredOutput(
        assistant.text,
        args.threadId,
        args.runId,
        assistant.messageId,
      )
    }
    if (heldFinished) yield heldFinished
    if (this.adapterConfig.emitDiff !== false) {
      yield* this.emitDiffChunks(
        args.sandbox,
        args.cwd,
        args.threadId,
        args.runId,
      )
    }
  }

  private async maybeProvisionNdjsonBridge(
    options: TextOptions<GrokBuildTextProviderOptions>,
    sandbox: SandboxHandle,
    cwd: string,
  ): Promise<HostToolBridge | undefined> {
    if (!options.tools) return undefined
    if (options.tools.length === 0) return undefined
    const provisioner =
      (options.capabilities
        ? getToolBridgeProvisioner(options.capabilities, { optional: true })
        : undefined) ?? nodeHttpBridgeProvisioner
    const bridge = await provisioner.provision(options.tools, {
      provider: sandbox.provider,
      context: options.context,
      ...(options.abortController?.signal
        ? { signal: options.abortController.signal }
        : {}),
    })
    // Grok reads MCP from `<cwd>/.grok/config.toml`, not `--mcp-config`.
    await projectGrokMcpBridge(sandbox, cwd, bridge)
    return bridge
  }

  private ndjsonPrompt(
    options: TextOptions<GrokBuildTextProviderOptions>,
    prompt: string,
  ): string {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((p) => p.content)
      .filter((c) => c.trim() !== '')
    const fullPrompt =
      systemPrompts.length > 0
        ? `${systemPrompts.join('\n\n')}\n\n${prompt}`
        : prompt
    if (!options.outputSchema) return fullPrompt
    return appendOutputSchemaInstruction(fullPrompt, options.outputSchema)
  }

  private applySystemPrompts(
    systemPrompts: Array<string>,
    prompt: string,
  ): string {
    if (systemPrompts.length === 0) return prompt
    return `${systemPrompts.join('\n\n')}\n\n${prompt}`
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
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to parse structured output'
      yield {
        type: EventType.RUN_ERROR,
        model: this.model,
        timestamp: Date.now(),
        message,
        error: { message },
      }
    }
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
      // ignore
    }
  }

  private async *chatStreamNdjson(
    options: TextOptions<GrokBuildTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    let bridge: HostToolBridge | undefined
    try {
      const sandbox = this.sandboxFrom(options)
      const cwd = this.workdir(options)
      const harnessCwd = this.harnessCwd(sandbox, options)
      const durability = options.capabilities
        ? getSandboxDurability(options.capabilities, { optional: true })
        : undefined
      const runId = resolveDurableRunId(options.runId, {
        durable: durability !== undefined,
        adapter: 'grok-build',
        fallback: () => this.generateId(),
      })
      const threadId = resolveDurableThreadId(options.threadId, {
        durable: durability !== undefined,
        attaching: durability?.attach === true,
        adapter: 'grok-build',
        fallback: () => this.generateId(),
      })

      const projection = options.capabilities
        ? getWorkspaceProjection(options.capabilities, { optional: true })
        : undefined
      if (projection) await projectGrokWorkspace(sandbox, projection)

      const policy = options.capabilities
        ? getSandboxPolicy(options.capabilities, { optional: true })
        : undefined

      bridge = await this.maybeProvisionNdjsonBridge(options, sandbox, cwd)

      const { prompt, resume } = buildPrompt(
        options.messages,
        options.modelOptions?.sessionId,
      )
      const fullPrompt = this.ndjsonPrompt(options, prompt)

      const exe = await resolveGrokExecutable(
        sandbox,
        this.adapterConfig.grokExecutable,
      )
      const runCommand = this.buildCommand(
        options,
        resume,
        harnessCwd,
        mapPolicyToGrokBuildFlags(policy),
        fullPrompt,
        exe,
      )

      logger.request(
        `activity=chat provider=grok-build model=${this.model} cliModel=${resolveGrokCliModel(this.model)} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${resume ?? 'none'}`,
        { provider: 'grok-build', model: this.model },
      )

      const journalOptions = journalOptionsFor(durability, runId)

      const rawEvents = spawnNdjson(sandbox, runCommand, {
        cwd,
        ...(this.adapterConfig.env ? { env: this.adapterConfig.env } : {}),
        ...abortSignalFields(options),
        onNonJsonLine: (line) =>
          logger.provider(`provider=grok-build non-json line: ${line}`, {
            chunk: line,
          }),
        ...(journalOptions === undefined ? {} : { journal: journalOptions }),
      })

      async function* asEvents(): AsyncIterable<GrokBuildStreamEvent> {
        for await (const event of rawEvents) yield event as GrokBuildStreamEvent
      }

      const genId = createRunScopedIdGen(runId)

      yield* alignedIfAttaching(
        translateThreadEvents(asEvents(), {
          model: this.model,
          runId,
          threadId,
          ...(options.parentRunId !== undefined && {
            parentRunId: options.parentRunId,
          }),
          genId,
          ...(options.outputSchema ? { expectStructuredOutput: true } : {}),
          onThreadEvent: (event) =>
            logger.provider(`provider=grok-build type=${event.type}`, {
              chunk: event,
            }),
        }),
        durability,
        logger,
      )

      if (this.adapterConfig.emitDiff !== false) {
        yield* this.emitDiffChunks(sandbox, cwd, threadId, runId)
      }
    } catch (error: unknown) {
      logger.errors('grok-build.chatStream fatal', {
        error,
        source: 'grok-build.chatStream',
      })
      yield grokBuildRunErrorChunk(error, options.model)
    } finally {
      await bridge?.close()
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<GrokBuildTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        'This harness honors outputSchema on chat() in the same turn. ' +
          'Pass outputSchema to chat(), or use a model adapter for a one-shot extract.',
      ),
    )
  }
}

/**
 * Creates a Grok Build harness adapter that runs **inside a sandbox**.
 *
 * Spawns the `grok` CLI (or a configured executable) inside the sandbox
 * provided via `withSandbox(...)`. The adapter declares
 * `requires: [SandboxCapability]`. The sandbox image must provide the
 * executable and `XAI_API_KEY` (or equivalent) for the harness.
 */
export function grokBuildText<TModel extends GrokBuildModel>(
  model: TModel,
  config: GrokBuildTextConfig = {},
): GrokBuildTextAdapter<TModel> {
  return new GrokBuildTextAdapter(config, model)
}
