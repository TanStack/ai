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
} from '@tanstack/ai-sandbox'
import { buildPrompt } from '../messages/prompt'
import { startOpencodeSession } from '../process/server'
import { startOpencodeServerInSandbox } from '../process/sandbox-server'
import { resolveInteractivePermission } from '../process/permissions'
import { AsyncQueue } from '../stream/queue'
import { translateOpencodeStream } from '../stream/translate'
import { projectOpencodeWorkspace } from './projection'
import type { HostToolBridge, SandboxHandle } from '@tanstack/ai-sandbox'
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
  port?: number
  /** Hostname the in-sandbox server binds. Defaults to `0.0.0.0`. */
  hostname?: string
  permissionMode?: OpencodePermissionMode
  /** Custom permission handler; replaces the adapter's default policy. */
  onPermissionRequest?: PermissionHandler
}

/** Split a `provider/model` id into its provider and model halves. */
function chatRunErrorChunk(error: unknown, model: string): AdapterYieldChunk {
  const err = error as Error & { code?: string }
  const rawEvent = toRunErrorRawEvent(error)
  const message = err.message || 'Unknown error occurred'
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

async function* emitOpencodeStructuredOutput(
  lastAssistantText: string,
  messageId: string,
  model: string,
  threadId: string,
  runId: string,
): AsyncIterable<AdapterYieldChunk> {
  try {
    const object = parseJsonFromAssistantText(lastAssistantText)
    yield structuredOutputStartChunk({
      messageId,
      model,
      threadId,
      runId,
    })
    yield structuredOutputCompleteChunk({
      messageId,
      model,
      threadId,
      runId,
      object,
      raw: lastAssistantText,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to parse structured output'
    yield {
      type: EventType.RUN_ERROR,
      model,
      timestamp: Date.now(),
      message,
      error: { message },
    }
  }
}

function splitModel(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf('/')
  const missingProviderOrModel = slash <= 0 || slash === model.length - 1
  if (missingProviderOrModel) {
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

  supportsCombinedToolsAndSchema(): boolean {
    return true
  }

  combinedStructuredOutputSource(): 'event' {
    return 'event'
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
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    let server:
      | Awaited<ReturnType<typeof startOpencodeServerInSandbox>>
      | undefined
    let handle: OpencodeSessionHandle | undefined
    let bridge: HostToolBridge | undefined
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal ?? undefined
    let onAbort: (() => void) | undefined
    const runId = resolveDurableRunId(options.runId, {
      durable: false,
      adapter: 'opencode',
      fallback: () => this.generateId(),
    })
    const threadId = options.threadId ?? this.generateId()
    // Surfaces custom events from bridged tools (e.g. code mode console logs)
    // on this run's live output stream.
    const channel = createBridgeEventChannel({
      model: this.model,
      threadId,
      runId,
    })

    try {
      yield* this.runOpencodeSession(options, {
        runId,
        threadId,
        channel,
        externalSignal,
        setServer: (next) => {
          server = next
        },
        setHandle: (next) => {
          handle = next
        },
        setBridge: (next) => {
          bridge = next
        },
        setOnAbort: (next) => {
          onAbort = next
        },
      })
    } catch (error: unknown) {
      logger.errors('opencode.chatStream fatal', {
        error,
        source: 'opencode.chatStream',
      })
      yield chatRunErrorChunk(error, options.model)
    } finally {
      if (externalSignal !== undefined && onAbort !== undefined) {
        externalSignal.removeEventListener('abort', onAbort)
      }
      channel.close()
      await handle?.dispose()
      await server?.dispose()
      await bridge?.close()
    }
  }

  private guardOpencodeDurability(
    options: TextOptions<OpencodeTextProviderOptions>,
    runId: string,
  ): void {
    const durability = options.capabilities
      ? getSandboxDurability(options.capabilities, { optional: true })
      : undefined
    if (durability === undefined) return
    if (durability.attach) {
      throw new DurableAttachNotSupportedError(
        'opencode',
        'this adapter drives the harness over the opencode HTTP server ' +
          'and does not journal',
      )
    }
    options.logger.warn(
      'opencode: sandbox durability is wired but this adapter never ' +
        'journals — this run will not be recoverable on reconnect. Use a ' +
        'journaling harness adapter for runs that must survive a host ' +
        'restart, or drop durability if these runs are not meant to.',
      { runId, adapter: 'opencode' },
    )
  }

  private async maybeProjectOpencodeWorkspace(
    options: TextOptions<OpencodeTextProviderOptions>,
    sandbox: SandboxHandle,
  ): Promise<void> {
    if (options.capabilities === undefined) return
    const projection = getWorkspaceProjection(options.capabilities, {
      optional: true,
    })
    if (projection !== undefined) {
      await projectOpencodeWorkspace(sandbox, projection)
    }
  }

  private async maybeProvisionOpencodeBridge(
    options: TextOptions<OpencodeTextProviderOptions>,
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
    return await provisioner.provision(options.tools, {
      provider: sandbox.provider,
      context: options.context,
      emitCustomEvent: channel.emitCustomEvent,
      ...(externalSignal ? { signal: externalSignal } : {}),
    })
  }

  private opencodePermissionHandler(
    options: TextOptions<OpencodeTextProviderOptions>,
    bridgedToolNames: Set<string>,
    threadId: string,
    runId: string,
    approvalRequests: Array<AdapterYieldChunk>,
  ): PermissionHandler {
    const mode =
      options.modelOptions?.permissionMode ??
      this.adapterConfig.permissionMode ??
      'default'
    return (
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
    )
  }

  private async *runOpencodeSession(
    options: TextOptions<OpencodeTextProviderOptions>,
    ctx: {
      runId: string
      threadId: string
      channel: ReturnType<typeof createBridgeEventChannel>
      externalSignal: AbortSignal | undefined
      setServer: (
        server: Awaited<ReturnType<typeof startOpencodeServerInSandbox>>,
      ) => void
      setHandle: (handle: OpencodeSessionHandle) => void
      setBridge: (bridge: HostToolBridge | undefined) => void
      setOnAbort: (onAbort: (() => void) | undefined) => void
    },
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    const sandbox = this.sandboxFrom(options)
    const directory =
      options.modelOptions?.directory ??
      this.adapterConfig.directory ??
      DEFAULT_WORKDIR
    this.guardOpencodeDurability(options, ctx.runId)
    await this.maybeProjectOpencodeWorkspace(options, sandbox)

    const sessionId = options.modelOptions?.sessionId
    const { prompt: resumePrompt } = buildPrompt(options.messages, sessionId)
    const { providerID, modelID } = splitModel(this.model)
    const bridgedToolNames = new Set(
      (options.tools ?? []).map((tool) => tool.name),
    )
    const bridge = await this.maybeProvisionOpencodeBridge(
      options,
      sandbox,
      ctx.channel,
      ctx.externalSignal,
    )
    ctx.setBridge(bridge)

    const approvalRequests: Array<AdapterYieldChunk> = []
    const queue = new AsyncQueue<OpencodeStreamEvent>()
    const permissionHandler = this.opencodePermissionHandler(
      options,
      bridgedToolNames,
      ctx.threadId,
      ctx.runId,
      approvalRequests,
    )

    logger.request(
      `activity=chat provider=opencode model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${sessionId ?? 'none'}`,
      { provider: 'opencode', model: this.model },
    )

    const server = await startOpencodeServerInSandbox(sandbox, {
      port: this.adapterConfig.port ?? DEFAULT_PORT,
      ...(this.adapterConfig.hostname !== undefined && {
        hostname: this.adapterConfig.hostname,
      }),
      cwd: directory,
      ...(bridge
        ? {
            env: {
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
            },
          }
        : {}),
      ...(ctx.externalSignal ? { signal: ctx.externalSignal } : {}),
    })
    ctx.setServer(server)

    const handle = await startOpencodeSession({
      baseUrl: server.baseUrl,
      // Forward the channel's auth headers (e.g. Daytona's preview token) so
      // the host client can reach a token-gated preview proxy.
      ...(server.headers !== undefined && { headers: server.headers }),
      providerID,
      modelID,
      ...(sessionId !== undefined && { resumeSessionId: sessionId }),
      onEvent: (event) => queue.push({ kind: 'event', event }),
      onPermissionRequest: permissionHandler,
      onError: (error) => queue.fail(error),
    })
    ctx.setHandle(handle)

    if (ctx.externalSignal !== undefined) {
      const onAbort = () => void handle.abort().catch(() => undefined)
      ctx.setOnAbort(onAbort)
      if (ctx.externalSignal.aborted) onAbort()
      else ctx.externalSignal.addEventListener('abort', onAbort, { once: true })
    }

    queue.push({ kind: 'session', sessionId: handle.sessionId })
    yield* this.pumpOpencodeStream(options, {
      handle,
      queue,
      bridgedToolNames,
      resumePrompt,
      sessionId,
      runId: ctx.runId,
      threadId: ctx.threadId,
      channel: ctx.channel,
      approvalRequests,
    })
  }

  private async *pumpOpencodeStream(
    options: TextOptions<OpencodeTextProviderOptions>,
    args: {
      handle: OpencodeSessionHandle
      queue: AsyncQueue<OpencodeStreamEvent>
      bridgedToolNames: Set<string>
      resumePrompt: string
      sessionId: string | undefined
      runId: string
      threadId: string
      channel: ReturnType<typeof createBridgeEventChannel>
      approvalRequests: Array<AdapterYieldChunk>
    },
  ): AsyncIterable<AdapterYieldChunk> {
    let promptText = this.applySystemPrompts(
      options,
      args.handle.resumed || args.sessionId === undefined
        ? args.resumePrompt
        : buildPrompt(options.messages, undefined).prompt,
    )
    if (options.outputSchema) {
      promptText = appendOutputSchemaInstruction(
        promptText,
        options.outputSchema,
      )
    }

    let lastAssistantText = ''
    args.handle
      .prompt(promptText)
      .then(({ message, text }) => {
        lastAssistantText = text
        args.queue.push({ kind: 'done', message })
        args.queue.end()
      })
      .catch((error: unknown) => args.queue.fail(error))

    let heldFinished: AdapterYieldChunk | undefined
    let lastTextMessageId: string | undefined
    const mergedChunks = mergeChunkStreams(
      translateOpencodeStream(args.queue, {
        model: this.model,
        runId: args.runId,
        threadId: args.threadId,
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        bridgedToolNames: args.bridgedToolNames,
        onStreamEvent: (event) =>
          options.logger.provider(`provider=opencode kind=${event.kind}`, {
            chunk: event,
          }),
      }),
      args.channel.stream,
    )
    for await (const chunk of mergedChunks) {
      const holdFinished =
        Boolean(options.outputSchema) && chunk.type === EventType.RUN_FINISHED
      if (holdFinished) {
        heldFinished = chunk
        continue
      }
      if (
        chunk.type === EventType.TEXT_MESSAGE_START &&
        typeof chunk.messageId === 'string' &&
        chunk.messageId !== ''
      ) {
        lastTextMessageId = chunk.messageId
      }
      yield chunk
    }

    if (options.outputSchema) {
      yield* emitOpencodeStructuredOutput(
        lastAssistantText,
        lastTextMessageId ?? this.generateId(),
        this.model,
        args.threadId,
        args.runId,
      )
    }
    if (heldFinished) yield heldFinished
    for (const event of args.approvalRequests) yield event
  }

  structuredOutput(
    _options: StructuredOutputOptions<OpencodeTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        'This harness honors outputSchema on chat() in the same turn. ' +
          'Pass outputSchema to chat(), or use a model adapter for a one-shot extract.',
      ),
    )
  }
}

export function opencodeText<TModel extends OpencodeModel>(
  model: TModel,
  config: OpencodeTextConfig = {},
): OpencodeTextAdapter<TModel> {
  return new OpencodeTextAdapter(config, model)
}
