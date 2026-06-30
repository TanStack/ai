import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  SandboxCapability,
  buildApprovalRequestedEvent,
  createBridgeEventChannel,
  getSandbox,
  getToolBridgeProvisioner,
  mergeChunkStreams,
  nodeHttpBridgeProvisioner,
  resolveHarnessCwd,
} from '@tanstack/ai-sandbox'
import { AsyncQueue } from '../stream/queue'
import { startAcpSession } from '../session/acp-client'
import { translateAcpStream } from '../stream/translate'
import { resolveInteractivePermission, resolvePermission } from '../permissions'
import { buildAcpPrompt } from '../messages/prompt'
import type { HostToolBridge, SandboxHandle } from '@tanstack/ai-sandbox'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  StreamChunk,
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

/**
 * Everything a harness needs to know to launch its ACP server inside the
 * sandbox. Passed to {@link AcpCompatibleConfig.command} /
 * {@link AcpCompatibleConfig.openTransport}.
 */
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
  /**
   * Per-call options from `chat({ modelOptions })` — the base ACP options plus
   * whatever you declared via {@link AcpCompatibleConfig.modelOptions}. Read
   * these to turn options into CLI flags / transport choices.
   */
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
  /**
   * Harness name. Used as the provider label, the log prefix, and the CUSTOM
   * session-id event name (`<name>.session-id`).
   */
  name: string
  /**
   * The models this harness accepts. Declaring them makes the returned factory
   * type-safe — `harness('known-model')` is checked, unknown ids are rejected.
   * Omit to accept any string.
   */
  models?: TModels
  /**
   * Type-only brand for the per-call options accepted via `chat({ modelOptions })`.
   * Declare your harness's options here with `{} as { ... }` (the value is unused
   * at runtime); they are merged with the base {@link AcpCompatibleProviderOptions}
   * and exposed on {@link AcpHarnessContext.modelOptions} so `command` /
   * `openTransport` can turn them into CLI flags.
   *
   * @example modelOptions: {} as { reasoningEffort?: 'low' | 'high' }
   */
  modelOptions?: TModelOptions
  /**
   * Build the shell command that launches the harness's ACP server over
   * **stdio** inside the sandbox (e.g. `` `pi --acp -m ${model}` ``). Required
   * unless {@link openTransport} is provided.
   */
  command?: (
    ctx: AcpHarnessContext<AcpCompatibleProviderOptions & TModelOptions>,
  ) => string
  /**
   * Full transport escape hatch — open any {@link AcpSessionTransport} yourself
   * (e.g. boot a `serve` process and connect over WebSocket, as Grok Build
   * does). Overrides {@link command}. Put ALL teardown in the returned
   * transport's `dispose` (stream) / process (stdio); it is disposed when the
   * session ends.
   */
  openTransport?: (
    ctx: AcpHarnessContext<AcpCompatibleProviderOptions & TModelOptions>,
  ) => Promise<AcpSessionTransport> | AcpSessionTransport
  /** Working directory inside the sandbox. Defaults to `/workspace`. */
  cwd?: string
  /** Extra environment variables for the harness process. */
  env?: Record<string, string>
  /**
   * ACP auth method to select before the session starts, when the harness
   * advertises one (e.g. `'pi-api-key'`). Overridable per call via
   * `modelOptions.authMethodId`.
   */
  authMethodId?: string
  /** ACP permission policy. Defaults to `'bypassPermissions'`. */
  permissionMode?: AcpPermissionMode
  /**
   * Permission strategy:
   * - `'headless'` (default) — auto-resolve via {@link permissionMode}; the
   *   sandbox is the boundary, so the agent runs without prompting.
   * - `'interactive'` — same policy, but `ask`-style prompts emit an
   *   approval-requested event so a client can approve and re-run.
   */
  permissions?: 'headless' | 'interactive'
  /** Custom permission handler; overrides {@link permissions}/{@link permissionMode}. */
  onPermissionRequest?: PermissionHandler
  /** Message used for `RUN_ERROR` when the harness refuses a request. */
  refusalMessage?: string
  /** Emit ACP `plan` updates as a CUSTOM event under this name (off by default). */
  planEventName?: string
  /**
   * After the run, emit the `git diff` of the working dir as a `file.changed`
   * CUSTOM event. Requires a git repo at `cwd`. Off by default.
   */
  emitDiff?: boolean
  /**
   * Harness-specific JSON-RPC notifications (vendor `_x/...` extensions). Must
   * return without throwing — unknown extensions must not tear down the session.
   */
  onExtNotification?: (method: string, params: Record<string, unknown>) => void
  /**
   * Convert chat history into the harness prompt + resume inputs. Defaults to
   * {@link buildAcpPrompt} (trailing user message + flattened transcript).
   */
  buildPrompt?: (
    messages: Array<ModelMessage>,
    sessionId: string | undefined,
  ) => BuiltAcpPrompt
}

/** Per-call provider options, passed via `modelOptions` on `chat()`. */
export interface AcpCompatibleProviderOptions {
  /**
   * Resume an existing harness session. The adapter emits the session id of
   * every run via a CUSTOM `<name>.session-id` event; thread it back here to
   * continue (only the trailing user message is sent).
   */
  sessionId?: string
  /** Per-call override of the harness working directory. */
  cwd?: string
  /** Per-call override of the ACP auth method. */
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

/**
 * A generic ACP harness adapter built from {@link AcpCompatibleConfig}. Runs the
 * configured coding-agent CLI inside the sandbox provided by `withSandbox(...)`
 * and translates its ACP session into AG-UI `StreamChunk`s.
 */
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

  private readonly harness: AcpCompatibleConfig<ReadonlyArray<string>, TModelOptions>

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
    approvalRequests: Array<StreamChunk>
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

  async *chatStream(
    options: TextOptions<ResolvedOptions<TModelOptions>>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let handle: AcpSessionHandle | undefined
    let bridge: HostToolBridge | undefined
    let transport: AcpSessionTransport | undefined
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal ?? undefined
    let onAbort: (() => void) | undefined

    try {
      const sandbox = this.sandboxFrom(options)
      const modelOptions = options.modelOptions
      const cwd = modelOptions?.cwd ?? this.harness.cwd ?? DEFAULT_WORKDIR
      const harnessCwd = resolveHarnessCwd(sandbox, cwd)
      const runId = options.runId ?? this.generateId()
      const threadId = options.threadId ?? this.generateId()
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

      // Bridge chat()-provided tools into the agent over MCP (ACP http server).
      const bridgedToolNames = new Set(
        (options.tools ?? []).map((tool) => tool.name),
      )
      if (options.tools && options.tools.length > 0) {
        const provisioner =
          (options.capabilities
            ? getToolBridgeProvisioner(options.capabilities, { optional: true })
            : undefined) ?? nodeHttpBridgeProvisioner
        bridge = await provisioner.provision(options.tools, {
          provider: sandbox.provider,
          context: options.context,
          emitCustomEvent: channel.emitCustomEvent,
          ...(externalSignal ? { signal: externalSignal } : {}),
        })
      }

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

      const mode =
        modelOptions?.permissionMode ??
        this.harness.permissionMode ??
        'bypassPermissions'
      const authMethodId =
        modelOptions?.authMethodId ?? this.harness.authMethodId

      const approvalRequests: Array<StreamChunk> = []
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

      const onAcpUpdate = (update: AcpSessionUpdate) =>
        queue.push({ kind: 'update', update })
      handle = await startAcpSession({
        transport,
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
        ...(this.harness.onExtNotification && {
          onExtNotification: this.harness.onExtNotification,
        }),
        onPermissionRequest: permissionHandler,
      })
      const session = handle

      if (externalSignal !== undefined) {
        onAbort = () => void session.cancel().catch(() => undefined)
        if (externalSignal.aborted) onAbort()
        else externalSignal.addEventListener('abort', onAbort, { once: true })
      }

      queue.push({ kind: 'session', sessionId: session.sessionId })

      const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
        .map((p) => p.content)
        .filter((c) => c.trim() !== '')
      const promptText = this.applySystemPrompts(
        systemPrompts,
        session.resumed || sessionId === undefined
          ? resumePrompt
          : this.buildPrompt(options.messages, undefined).prompt,
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

      yield* mergeChunkStreams(
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
            logger.provider(`provider=${this.name} kind=${event.kind}`, {
              chunk: event,
            }),
        }),
        channel.stream,
      )

      // Surface any pending approval requests (interactive ask-policy actions
      // awaiting a client decision); the client approves and re-runs to continue.
      for (const event of approvalRequests) yield event

      if (this.harness.emitDiff) {
        yield* this.emitDiffChunks(sandbox, cwd, threadId, runId)
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors(`${this.name}.chatStream fatal`, {
        error,
        source: `${this.name}.chatStream`,
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
      // startAcpSession owns transport teardown once a handle exists (and tears
      // it down itself on a failed init). Only dispose here if we opened a
      // transport but never reached a session.
      if (handle !== undefined) await handle.dispose()
      else if (transport !== undefined) await disposeTransport(transport)
      await bridge?.close()
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
  ): AsyncIterable<StreamChunk> {
    try {
      const diff = await sandbox.process.exec(`git -C ${q(cwd)} diff`, { cwd })
      if (diff.exitCode === 0 && diff.stdout.trim() !== '') {
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

  structuredOutput(
    _options: StructuredOutputOptions<ResolvedOptions<TModelOptions>>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        `Structured output is not supported by the in-sandbox "${this.name}" ACP harness adapter. ` +
          'Use a model adapter for structured output, or omit outputSchema.',
      ),
    )
  }
}

/**
 * Configure an ACP-compatible harness once, then select a model per call.
 *
 * Mirrors `openaiCompatible`: it lets you plug ANY Agent Client Protocol agent
 * into a TanStack AI sandbox without a dedicated adapter package.
 *
 * @example
 * ```ts
 * import { acpCompatible } from '@tanstack/ai-acp'
 * import { chat } from '@tanstack/ai'
 * import { defineSandbox, withSandbox } from '@tanstack/ai-sandbox'
 *
 * const pi = acpCompatible({
 *   name: 'pi',
 *   // declaring `models` makes pi('…') type-safe; omit to accept any string
 *   models: ['pi-fast', 'pi-pro'],
 *   // declare per-call options; merged with the base ACP options and exposed
 *   // on ctx.modelOptions inside `command` / `openTransport`
 *   modelOptions: {} as { reasoningEffort?: 'low' | 'high' },
 *   command: ({ model, harnessCwd, modelOptions }) =>
 *     `pi --acp -m ${model} --cwd ${harnessCwd}` +
 *     (modelOptions?.reasoningEffort ? ` --effort ${modelOptions.reasoningEffort}` : ''),
 *   authMethodId: 'pi-api-key',
 * })
 *
 * chat({
 *   adapter: pi('pi-pro'),
 *   modelOptions: { reasoningEffort: 'high' }, // typed
 *   messages,
 *   middleware: [withSandbox(defineSandbox({ /* provider, install pi *\/ }))],
 * })
 * ```
 */
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

/**
 * One-shot helper: build a single-model ACP-compatible harness adapter inline.
 *
 * @example
 * ```ts
 * chat({
 *   adapter: acpCompatibleText('pi-fast', {
 *     name: 'pi',
 *     command: ({ model }) => `pi --acp -m ${model}`,
 *   }),
 *   messages,
 *   middleware: [withSandbox(defineSandbox({ ... }))],
 * })
 * ```
 */
export function acpCompatibleText<
  TModel extends string,
  TModelOptions extends Record<string, any> = AcpCompatibleProviderOptions,
>(
  model: TModel,
  config: AcpCompatibleConfig<ReadonlyArray<string>, TModelOptions>,
): AcpCompatibleTextAdapter<TModel, TModelOptions> {
  return new AcpCompatibleTextAdapter<TModel, TModelOptions>(config, model)
}
