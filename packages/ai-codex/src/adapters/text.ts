import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  SandboxCapability,
  getSandbox,
  getSandboxPolicy,
  getToolBridgeProvisioner,
  getWorkspaceProjection,
  nodeHttpBridgeProvisioner,
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
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { CodexModel } from '../model-meta'
import type { CodexTextProviderOptions } from '../provider-options'
import type { CodexThreadEvent } from '../stream/sdk-types'

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

  /** Mirror @openai/codex-sdk's `codex exec --experimental-json` invocation. */
  private buildCommand(
    options: TextOptions<CodexTextProviderOptions>,
    resume: string | undefined,
    bridge: HostToolBridge | undefined,
    policyFlags: CodexPolicyFlags,
  ): string {
    const config = this.adapterConfig
    const modelOptions = options.modelOptions
    const exe = config.codexExecutable ?? 'codex'
    const args: Array<string> = ['exec', '--experimental-json']

    // Precedence: per-call modelOptions > adapter config > sandbox policy > default.
    const sandboxMode =
      modelOptions?.sandboxMode ??
      config.sandboxMode ??
      policyFlags.sandboxMode ??
      'workspace-write'
    const approvalPolicy =
      modelOptions?.approvalPolicy ??
      config.approvalPolicy ??
      policyFlags.approvalPolicy ??
      'never'
    const networkAccessEnabled =
      config.networkAccessEnabled ?? policyFlags.networkAccessEnabled
    const reasoning =
      modelOptions?.modelReasoningEffort ?? config.modelReasoningEffort
    const skipGitRepoCheck =
      modelOptions?.skipGitRepoCheck ?? config.skipGitRepoCheck

    args.push('--model', q(this.model))
    args.push('--sandbox', q(sandboxMode))
    // NOTE: do NOT pass `--cd <cwd>`. `cwd` is the VIRTUAL `/workspace` root; the
    // provider handle already maps it to the sandbox's real workdir and runs the
    // process there (e.g. Daytona's `/home/daytona/workspace`). Passing it as a
    // literal `--cd` makes codex chdir to a path that doesn't exist on the real
    // filesystem → "No such file or directory (os error 2)". Codex inherits the
    // handle-set process cwd instead.
    if (skipGitRepoCheck !== false) args.push('--skip-git-repo-check')
    for (const dir of config.additionalDirectories ?? []) {
      args.push('--add-dir', q(dir))
    }

    const cfg: Record<string, string> = {
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
      // Bridge chat()-provided tools via a streamable-HTTP MCP server. A `url`
      // makes codex use its streamable-HTTP transport, which authenticates via an
      // `Authorization` header — codex REJECTS inline `bearer_token` for this
      // transport ("bearer_token is not supported for streamable_http"; that field
      // is only for the stdio transport). Pass the per-run bearer as an HTTP header
      // instead; the host tool-bridge checks `Authorization: Bearer <token>`.
      ...(bridge
        ? {
            [`mcp_servers.${bridge.name}.url`]: `"${bridge.url}"`,
            [`mcp_servers.${bridge.name}.http_headers`]: `{ "Authorization" = "Bearer ${bridge.token}" }`,
          }
        : {}),
      ...config.config,
    }
    for (const [key, value] of Object.entries(cfg)) {
      args.push('--config', q(`${key}=${value}`))
    }

    // Resume an existing thread (mirrors the SDK's `resume <threadId>`).
    if (resume !== undefined) args.push('resume', q(resume))

    return `${exe} ${args.join(' ')}`
  }

  async *chatStream(
    options: TextOptions<CodexTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let bridge: HostToolBridge | undefined
    const tempFiles: Array<string> = []
    let cleanupSandbox: SandboxHandle | undefined
    try {
      const sandbox = this.sandboxFrom(options)
      cleanupSandbox = sandbox
      const cwd = this.workdir(options)

      // Project declarative workspace inputs (MCP/skills) into codex's native
      // format. Re-runs each call so rotated secrets re-apply; idempotent ops
      // are marker-gated inside the projector.
      const projection = options.capabilities
        ? getWorkspaceProjection(options.capabilities, { optional: true })
        : undefined
      if (projection) await projectCodexWorkspace(sandbox, projection)

      if (options.tools && options.tools.length > 0) {
        const provisioner =
          (options.capabilities
            ? getToolBridgeProvisioner(options.capabilities, { optional: true })
            : undefined) ?? nodeHttpBridgeProvisioner
        bridge = await provisioner.provision(options.tools, {
          provider: sandbox.provider,
          context: options.context,
          ...(options.abortController?.signal
            ? { signal: options.abortController.signal }
            : {}),
        })
      }

      const { prompt, resume } = buildPrompt(
        options.messages,
        options.modelOptions?.sessionId,
      )
      const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
        .map((p) => p.content)
        .filter((c) => c.trim() !== '')
      const fullPrompt =
        systemPrompts.length > 0
          ? `${systemPrompts.join('\n\n')}\n\n${prompt}`
          : prompt

      const policy = options.capabilities
        ? getSandboxPolicy(options.capabilities, { optional: true })
        : undefined
      const command = this.buildCommand(
        options,
        resume,
        bridge,
        mapPolicyToCodexFlags(policy),
      )

      logger.request(
        `activity=chat provider=codex model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${resume ?? 'none'}`,
        { provider: 'codex', model: this.model },
      )

      // Deliver the prompt. Default: over stdin. Providers without a writable
      // host→process stdin can't accept that — Docker's hijacked exec severs
      // stdout when stdin EOF is signalled (losing the agent's output), and
      // Cloudflare can't write stdin at all — so feed the prompt from a file
      // (`codex exec … < file`) instead.
      let runCommand = command
      let stdinInput: string | undefined = fullPrompt
      if (sandbox.capabilities.writableStdin === false) {
        const promptPath = `/tmp/tanstack-codex-prompt-${options.runId ?? this.generateId()}`
        await sandbox.fs.write(promptPath, fullPrompt)
        tempFiles.push(promptPath)
        runCommand = `${command} < ${q(promptPath)}`
        stdinInput = undefined
      }

      const rawEvents = spawnNdjson(sandbox, runCommand, {
        cwd,
        ...(stdinInput !== undefined ? { input: stdinInput } : {}),
        ...(this.adapterConfig.env ? { env: this.adapterConfig.env } : {}),
        ...(options.abortController?.signal
          ? { signal: options.abortController.signal }
          : options.request?.signal
            ? { signal: options.request.signal }
            : {}),
        onNonJsonLine: (line) =>
          logger.provider(`provider=codex non-json line: ${line}`, {
            chunk: line,
          }),
      })

      async function* asEvents(): AsyncIterable<CodexThreadEvent> {
        for await (const event of rawEvents) yield event as CodexThreadEvent
      }

      yield* translateThreadEvents(asEvents(), {
        model: this.model,
        runId: options.runId ?? this.generateId(),
        threadId: options.threadId ?? this.generateId(),
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        onThreadEvent: (event) =>
          logger.provider(`provider=codex type=${event.type}`, {
            chunk: event,
          }),
      })
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('codex.chatStream fatal', {
        error,
        source: 'codex.chatStream',
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
        'Structured output is not yet supported by the in-sandbox Codex adapter. ' +
          'Use a model adapter for structured output, or omit outputSchema.',
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
