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

    if (outputSchemaPath !== undefined) {
      args.push('--output-schema', q(outputSchemaPath))
    }

    // Resume an existing thread (mirrors the SDK's `resume <threadId>`).
    if (resume !== undefined) args.push('resume', q(resume))

    return `${exe} ${args.join(' ')}`
  }

  async *chatStream(
    options: TextOptions<CodexTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    let bridge: HostToolBridge | undefined
    const tempFiles: Array<string> = []
    let cleanupSandbox: SandboxHandle | undefined
    // Durability caveat: the journaled path below derives its journal file
    // path from `runId` alone (see `journalPaths` in `@tanstack/ai-sandbox`),
    // and a successor host must recompute that same path to resume this run.
    // That is only possible when the caller supplies a stable `runId`.
    // `resolveDurableRunId` enforces that when durability is wired (both
    // `runs` and `durability.adapter` given to `withSandbox`) and preserves
    // the generated fallback — `this.generateId()`, a fresh random id every
    // call — when it is not, so a non-durable run's behavior is unchanged.
    const durability = options.capabilities
      ? getSandboxDurability(options.capabilities, { optional: true })
      : undefined
    const runId = resolveDurableRunId(options.runId, {
      durable: durability !== undefined,
      adapter: 'codex',
      fallback: () => this.generateId(),
    })
    // `threadId` is stamped on every chunk `translateThreadEvents` emits, so an
    // ATTACHING run that mints a fresh one replays a stream the stored log
    // cannot match at index 0. `resolveDurableThreadId` refuses that up front
    // instead of letting alignment discover it mid-stream; a durable FRESH run
    // and a non-durable run both keep the generated fallback untouched.
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
          emitCustomEvent: channel.emitCustomEvent,
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

      // Deliver the prompt. Default: over stdin. Providers without a writable
      // host→process stdin can't accept that — Docker's hijacked exec severs
      // stdout when stdin EOF is signalled (losing the agent's output), and
      // Cloudflare can't write stdin at all — so feed the prompt from a file
      // (`codex exec … < file`) instead.
      let runCommand = command
      let stdinInput: string | undefined = fullPrompt
      if (sandbox.capabilities.writableStdin === false) {
        // Reuse the ALREADY-RESOLVED `runId`, not a fresh `options.runId ?? this.generateId()`
        // re-derivation: the latter mints a SECOND random id whenever
        // `options.runId` is absent, so the prompt file's suffix would not
        // even match the journal path derived from the run's own `runId`
        // above (see `resolveDurableRunId`). That mismatch is invisible
        // (the prompt still gets read), but it defeats the whole point of a
        // stable, caller-supplied `runId` for anything keyed off it.
        // `encodeRunId`, because durability makes `runId` CALLER-chosen and this
        // interpolates it into a filesystem path. Raw, a `/` would silently turn
        // the basename into a nested path (writing outside `/tmp` or failing on a
        // missing dir), `..` would climb out of it, and a long id would fail the
        // spawn with `ENAMETOOLONG`. The encoder collapses every id to one
        // bounded, injective path segment — the same one `journalPaths` uses, so
        // the prompt file and the journal agree on how this id spells.
        const promptPath = `/tmp/tanstack-codex-prompt-${encodeRunId(runId)}`
        await sandbox.fs.write(promptPath, fullPrompt)
        tempFiles.push(promptPath)
        runCommand = `${command} < ${q(promptPath)}`
        stdinInput = undefined
      }

      // `undefined` whenever the run is not durable, so `spawnNdjson` takes its
      // original, unjournaled path and behavior stays byte-identical to a
      // pre-durability run. When durable, this also carries `attach`, which is
      // how `spawnNdjson` decides to tail an EXISTING journal instead of
      // starting a new agent — set by the attach route's `drive()` callback,
      // never by an application's POST handler (see `SandboxDurabilityOptions.attach`).
      const journalOptions = journalOptionsFor(durability, runId)

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
        // Route stdout through the in-sandbox journal so a resuming host can
        // re-read it from byte 0 (see `@tanstack/ai-sandbox`'s journal.ts).
        ...(journalOptions === undefined ? {} : { journal: journalOptions }),
      })

      async function* asEvents(): AsyncIterable<CodexThreadEvent> {
        for await (const event of rawEvents) yield event as CodexThreadEvent
      }

      // Deterministic, run-scoped ids: journal replay re-translates the same
      // journal bytes, and `this.generateId()` (Date.now() + Math.random())
      // would mint different message ids on every replay. See
      // chunk-identity.ts in `@tanstack/ai-sandbox` for why this is required.
      const genId = createRunScopedIdGen(runId)

      // `mergeChunkStreams` below interleaves `translateThreadEvents`'s
      // deterministic output with `channel.stream` (host-tool-bridge CUSTOM
      // events from LIVE tool execution — see `createBridgeEventChannel`
      // above). Those events do not occur on a replay, so a takeover's replay
      // is NOT chunk-for-chunk identical to what the log holds.
      // `alignedIfAttaching` handles it: alignment skips stored out-of-band
      // CUSTOM entries within a bounded window (see `align.ts`), so a
      // bridged-tool run can be taken over without a spurious
      // `JournalReplayDivergedError`, while a genuine determinism regression
      // still throws. It is a no-op (passes the stream through untouched)
      // whenever the run is not durable or is not attaching, so a
      // non-durable run's output is unaffected byte for byte.
      //
      // The wrap goes OUTSIDE `mergeChunkStreams`, never around the pre-merge
      // translator alone: the stored log holds the previous host's MERGED
      // output, so comparing against anything else would compare against a
      // stream the log never contained.
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
