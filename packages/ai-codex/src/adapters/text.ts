import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  SandboxCapability,
  alignedIfAttaching,
  createBridgeEventChannel,
  createRunScopedIdGen,
  encodeRunId,
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
  spawnNdjson,
} from '@tanstack/ai-sandbox'
import { buildPrompt } from '../messages/prompt'
import { translateThreadEvents } from '../stream/translate'
import { projectCodexWorkspace } from './projection'
import { mapPolicyToCodexFlags } from './policy-map'
import type { CodexPolicyFlags } from './policy-map'
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
import type { CodexModel } from '../model-meta'
import type { CodexTextProviderOptions } from '../provider-options'
import type { CodexThreadEvent } from '../stream/sdk-types'

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

function abortSignalFields(
  options: TextOptions<CodexTextProviderOptions>,
): { signal: AbortSignal } | Record<string, never> {
  if (options.abortController?.signal) {
    return { signal: options.abortController.signal }
  }
  if (options.request?.signal) {
    return { signal: options.request.signal }
  }
  return {}
}

export type CodexSandboxMode =
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access'
export type CodexApprovalMode =
  | 'never'
  | 'on-failure'
  | 'on-request'
  | 'untrusted'

const DEFAULT_WORKDIR = '/workspace'

/**
 * Providers that already isolate the agent in a VM or container where Codex
 * cannot create a nested bubblewrap user namespace. Isolation is then the
 * outer sandbox plus `defineSandboxPolicy`. Issue #1081 item 8.
 */
const NESTED_BWRAP_UNSUPPORTED = new Set(['daytona', 'cloudflare'])

function defaultSandboxMode(provider: string): CodexSandboxMode {
  return NESTED_BWRAP_UNSUPPORTED.has(provider)
    ? 'danger-full-access'
    : 'workspace-write'
}

export type CodexAuthMode = 'host' | 'api-key'

export interface CodexTextConfig {
  /** Working directory inside the sandbox. Defaults to `/workspace`. */
  cwd?: string
  /**
   * Codex's own sandbox mode (`--sandbox`). Defaults to `'workspace-write'`
   * so the agent can edit the workspace — the outer TanStack sandbox is the
   * real isolation boundary.
   */
  sandboxMode?: CodexSandboxMode
  /** Codex approval policy (`--config approval_policy=`). Defaults to `'never'`. */
  approvalPolicy?: CodexApprovalMode
  /** Model reasoning effort (`--config model_reasoning_effort=`). */
  modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  /** Skip Codex's git-repo safety check (`--skip-git-repo-check`). Defaults to true. */
  skipGitRepoCheck?: boolean
  /** Allow network in `workspace-write` (`--config sandbox_workspace_write.network_access=`). */
  networkAccessEnabled?: boolean
  /** Web search mode (`--config web_search=`). */
  webSearchMode?: 'disabled' | 'live'
  /** Extra writable directories (`--add-dir`). */
  additionalDirectories?: Array<string>
  /** Path/name of the codex executable inside the sandbox. Defaults to `codex`. */
  codexExecutable?: string
  /**
   * `'api-key'` (default) expects `CODEX_API_KEY` in the process or sandbox
   * secrets. `'host'` uses `codex login`. Not inferred from the sandbox.
   */
  authMode?: CodexAuthMode
  /** Extra environment variables for the codex process inside the sandbox. */
  env?: Record<string, string>
  /** Extra raw `--config key=value` overrides (values passed verbatim as TOML). */
  config?: Record<string, string>
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export class CodexTextAdapter<
  TModel extends CodexModel,
> extends BaseTextAdapter<
  TModel,
  CodexTextProviderOptions,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  readonly name = 'codex' as const

  override readonly requires = [SandboxCapability] as const

  private readonly adapterConfig: CodexTextConfig

  constructor(config: CodexTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  private sandboxFrom(
    options: TextOptions<CodexTextProviderOptions>,
  ): SandboxHandle {
    const ctx = options.capabilities
    if (!ctx) {
      throw new Error(
        'Adapter "codex" requires a sandbox. Add withSandbox(defineSandbox({ ... })) to chat() middleware.',
      )
    }
    return getSandbox(ctx)
  }

  private workdir(options: TextOptions<CodexTextProviderOptions>): string {
    return (
      options.modelOptions?.workingDirectory ??
      this.adapterConfig.cwd ??
      DEFAULT_WORKDIR
    )
  }

  supportsCombinedToolsAndSchema(): boolean {
    return true
  }

  combinedStructuredOutputSource(): 'event' {
    return 'event'
  }

  /** Mirror @openai/codex-sdk's `codex exec --experimental-json` invocation. */
  private buildCommand(
    options: TextOptions<CodexTextProviderOptions>,
    resume: string | undefined,
    bridge: HostToolBridge | undefined,
    policyFlags: CodexPolicyFlags,
    provider: string,
    outputSchemaPath: string | undefined,
  ): string {
    /** Extra raw `--config key=value` overrides (values passed verbatim as TOML). */
    const config = this.adapterConfig
    const modelOptions = options.modelOptions
    const exe = config.codexExecutable ?? 'codex'
    const args: Array<string> = ['exec', '--experimental-json']

    // Precedence: per-call modelOptions > adapter config > sandbox policy >
    // provider default. Daytona/Cloudflare cannot nest bubblewrap.
    const sandboxMode =
      modelOptions?.sandboxMode ??
      config.sandboxMode ??
      policyFlags.sandboxMode ??
      defaultSandboxMode(provider)
    /** Codex approval policy (`--config approval_policy=`). Defaults to `'never'`. */
    const approvalPolicy =
      modelOptions?.approvalPolicy ??
      config.approvalPolicy ??
      policyFlags.approvalPolicy ??
      'never'
    /** Allow network in `workspace-write` (`--config sandbox_workspace_write.network_access=`). */
    const networkAccessEnabled =
      config.networkAccessEnabled ?? policyFlags.networkAccessEnabled
    const reasoning =
      modelOptions?.modelReasoningEffort ?? config.modelReasoningEffort
    /** Skip Codex's git-repo safety check (`--skip-git-repo-check`). Defaults to true. */
    const skipGitRepoCheck =
      modelOptions?.skipGitRepoCheck ?? config.skipGitRepoCheck

    args.push('--model', q(this.model))
    args.push('--sandbox', q(sandboxMode))
    this.pushCodexDirFlags(args, skipGitRepoCheck, config.additionalDirectories)

    const cfg = this.codexConfigFlags(
      approvalPolicy,
      reasoning,
      networkAccessEnabled,
      bridge,
    )
    const configFlags = Object.entries(cfg)
    for (const [key, value] of configFlags) {
      args.push('--config', q(`${key}=${value}`))
    }

    if (outputSchemaPath !== undefined) {
      args.push('--output-schema', q(outputSchemaPath))
    }

    // Resume an existing thread (mirrors the SDK's `resume <threadId>`).
    if (resume !== undefined) args.push('resume', q(resume))

    return `${exe} ${args.join(' ')}`
  }

  private pushCodexDirFlags(
    args: Array<string>,
    skipGitRepoCheck: boolean | undefined,
    additionalDirectories: Array<string> | undefined,
  ): void {
    if (skipGitRepoCheck !== false) args.push('--skip-git-repo-check')
    for (const dir of additionalDirectories ?? []) {
      args.push('--add-dir', q(dir))
    }
  }

  private codexConfigFlags(
    approvalPolicy: string,
    reasoning: string | undefined,
    networkAccessEnabled: boolean | undefined,
    bridge: HostToolBridge | undefined,
  ): Record<string, string> {
    const config = this.adapterConfig
    return {
      approval_policy: `"${approvalPolicy}"`,
      ...(reasoning ? { model_reasoning_effort: `"${reasoning}"` } : {}),
      ...(networkAccessEnabled !== undefined
        ? {
            'sandbox_workspace_write.network_access':
              String(networkAccessEnabled),
          }
        : {}),
      ...(config.webSearchMode
        ? { web_search: `"${config.webSearchMode}"` }
        : {}),
      ...(bridge
        ? {
            [`mcp_servers.${bridge.name}.url`]: `"${bridge.url}"`,
            [`mcp_servers.${bridge.name}.http_headers`]: `{ "Authorization" = "Bearer ${bridge.token}" }`,
          }
        : {}),
      ...config.config,
    }
  }

  private async maybeProvisionCodexBridge(
    options: TextOptions<CodexTextProviderOptions>,
    sandbox: SandboxHandle,
    channel: ReturnType<typeof createBridgeEventChannel>,
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
      ...(options.abortController?.signal
        ? { signal: options.abortController.signal }
        : {}),
    })
  }

  private codexPrompt(
    options: TextOptions<CodexTextProviderOptions>,
    prompt: string,
  ): string {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((p) => p.content)
      .filter((c) => c.trim() !== '')
    if (systemPrompts.length === 0) return prompt
    return `${systemPrompts.join('\n\n')}\n\n${prompt}`
  }

  private async prepareCodexStdin(
    sandbox: SandboxHandle,
    command: string,
    fullPrompt: string,
    runId: string,
    tempFiles: Array<string>,
  ): Promise<{ runCommand: string; stdinInput: string | undefined }> {
    if (sandbox.capabilities.writableStdin !== false) {
      return { runCommand: command, stdinInput: fullPrompt }
    }
    const promptPath = `/tmp/tanstack-codex-prompt-${encodeRunId(runId)}`
    await sandbox.fs.write(promptPath, fullPrompt)
    tempFiles.push(promptPath)
    return {
      runCommand: `${command} < ${q(promptPath)}`,
      stdinInput: undefined,
    }
  }

  async *chatStream(
    options: TextOptions<CodexTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    let bridge: HostToolBridge | undefined
    const tempFiles: Array<string> = []
    let cleanupSandbox: SandboxHandle | undefined
    const durability = options.capabilities
      ? getSandboxDurability(options.capabilities, { optional: true })
      : undefined
    const runId = resolveDurableRunId(options.runId, {
      durable: durability !== undefined,
      adapter: 'codex',
      fallback: () => this.generateId(),
    })
    const threadId = resolveDurableThreadId(options.threadId, {
      durable: durability !== undefined,
      attaching: durability?.attach === true,
      adapter: 'codex',
      fallback: () => this.generateId(),
    })
    // Surfaces custom events from bridged tools (e.g. code mode console logs)
    // on this run's live output stream.
    const channel = createBridgeEventChannel({
      model: this.model,
      threadId,
      runId,
    })
    try {
      const sandbox = this.sandboxFrom(options)
      cleanupSandbox = sandbox
      /** Working directory inside the sandbox. Defaults to `/workspace`. */
      const cwd = this.workdir(options)

      const projection = options.capabilities
        ? getWorkspaceProjection(options.capabilities, { optional: true })
        : undefined
      if (projection) await projectCodexWorkspace(sandbox, projection)

      bridge = await this.maybeProvisionCodexBridge(options, sandbox, channel)

      const { prompt, resume } = buildPrompt(
        options.messages,
        options.modelOptions?.sessionId,
      )
      const fullPrompt = this.codexPrompt(options, prompt)

      const policy = options.capabilities
        ? getSandboxPolicy(options.capabilities, { optional: true })
        : undefined
      let outputSchemaArg: string | undefined
      if (options.outputSchema) {
        const schemaFile = `.tanstack-output-schema-${encodeRunId(runId)}.json`
        const schemaPath = `${cwd}/${schemaFile}`
        await sandbox.fs.write(schemaPath, JSON.stringify(options.outputSchema))
        tempFiles.push(schemaPath)
        outputSchemaArg = schemaFile
      }
      const command = this.buildCommand(
        options,
        resume,
        bridge,
        mapPolicyToCodexFlags(policy),
        sandbox.provider,
        outputSchemaArg,
      )

      logger.request(
        `activity=chat provider=codex model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${resume ?? 'none'}`,
        { provider: 'codex', model: this.model },
      )

      const prepared = await this.prepareCodexStdin(
        sandbox,
        command,
        fullPrompt,
        runId,
        tempFiles,
      )

      const journalOptions = journalOptionsFor(durability, runId)

      const rawEvents = spawnNdjson(sandbox, prepared.runCommand, {
        cwd,
        ...(prepared.stdinInput !== undefined
          ? { input: prepared.stdinInput }
          : {}),
        ...(this.adapterConfig.env ? { env: this.adapterConfig.env } : {}),
        ...abortSignalFields(options),
        onNonJsonLine: (line) =>
          logger.provider(`provider=codex non-json line: ${line}`, {
            chunk: line,
          }),
        // Route stdout through the in-sandbox journal so a resuming host can
        // re-read it from byte 0 (see `@tanstack/ai-sandbox`'s journal.ts).
        ...(journalOptions === undefined ? {} : { journal: journalOptions }),
      })

      async function* asEvents(): AsyncIterable<CodexThreadEvent> {
        for await (const event of rawEvents) yield event as CodexThreadEvent
      }

      const genId = createRunScopedIdGen(runId)

      yield* alignedIfAttaching(
        mergeChunkStreams(
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
              logger.provider(`provider=codex type=${event.type}`, {
                chunk: event,
              }),
          }),
          channel.stream,
        ),
        durability,
        logger,
      )
    } catch (error: unknown) {
      logger.errors('codex.chatStream fatal', {
        error,
        source: 'codex.chatStream',
      })
      yield chatRunErrorChunk(error, options.model)
    } finally {
      channel.close()
      await bridge?.close()
      if (cleanupSandbox) {
        for (const path of tempFiles) {
          try {
            await cleanupSandbox.fs.remove(path)
          } catch {
            // already gone / sandbox torn down — nothing to clean up
          }
        }
      }
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<CodexTextProviderOptions>,
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
 * Creates a Codex harness adapter that runs **inside a sandbox**.
 *
 * It declares `requires: [SandboxCapability]` and spawns
 * `codex exec --experimental-json` inside the sandbox (mirroring
 * `@openai/codex-sdk`'s own CLI invocation), feeding the prompt via stdin and
 * streaming its JSONL thread events back as AG-UI chunks. The sandbox image
 * must provide the `codex` executable and `CODEX_API_KEY` (or a `codex login`)
 * in its environment.
 */
export function codexText<TModel extends CodexModel>(
  model: TModel,
  config: CodexTextConfig = {},
): CodexTextAdapter<TModel> {
  return new CodexTextAdapter(config, model)
}
