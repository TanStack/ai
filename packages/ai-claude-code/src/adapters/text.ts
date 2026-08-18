import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import {
  appendOutputSchemaInstruction,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  SandboxCapability,
  alignedIfAttaching,
  approvalId,
  buildApprovalRequestedEvent,
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
  resolveApproval,
  resolveDurableRunId,
  resolveDurableThreadId,
  spawnNdjson,
} from '@tanstack/ai-sandbox'
import { buildPrompt } from '../messages/prompt'
import { translateSdkStream } from '../stream/translate'
import { mapPolicyToClaudeFlags } from './policy-map'
import { projectClaudeWorkspace } from './projection'
import {
  CLAUDE_JSON_SCHEMA_PLACEHOLDER,
  CLAUDE_RUNNER_SOURCE,
} from './claude-run-source'

import type { ClaudePolicyFlags } from './policy-map'
import type {
  BridgeEventChannel,
  HostToolBridge,
  PermissionToolResult,
  SandboxHandle,
  SandboxPolicy,
} from '@tanstack/ai-sandbox'
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
import type { ClaudeCodeModel } from '../model-meta'
import type { ClaudeCodeTextProviderOptions } from '../provider-options'
import type { AgentSdkMessage } from '../stream/sdk-types'

export type ClaudeCodePermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'

const DEFAULT_WORKDIR = '/workspace'

export interface ClaudeCodeTextConfig {
  /**
   * Working directory inside the sandbox where `claude` runs. Defaults to
   * `/workspace` (the conventional sandbox workspace root).
   */
  cwd?: string
  /**
   * Claude Code permission mode passed via `--permission-mode`. Defaults to
   * `'bypassPermissions'` — a sandbox is isolated, so the agent is allowed to
   * edit files and run commands without prompting. Tighten via `defineSandboxPolicy`
   * / this option for less autonomy.
   */
  permissionMode?: ClaudeCodePermissionMode
  /** Built-in tools the harness may use (`--allowedTools`). */
  allowedTools?: Array<string>
  /** Built-in tools removed from the harness (`--disallowedTools`). */
  disallowedTools?: Array<string>
  /** Extra directories the agent may access (`--add-dir`). */
  addDirs?: Array<string>
  /** Maximum harness-internal turns (`--max-turns`). */
  maxTurns?: number
  /**
   * How `systemPrompts` from `chat()` are applied:
   * - `'append'` (default): `--append-system-prompt` on top of the preset.
   * - `'replace'`: `--system-prompt` as the entire system prompt.
   */
  systemPromptMode?: 'append' | 'replace'
  /** Path/name of the claude executable inside the sandbox. Defaults to `claude`. */
  claudeExecutable?: string
  /** Emit token-level deltas via `--include-partial-messages` (default true). */
  streamPartials?: boolean
  /** Extra environment variables for the claude process inside the sandbox. */
  env?: Record<string, string>
  /**
   * `'host'` uses `claude login` and does not inject `ANTHROPIC_API_KEY`.
   * `'api-key'` injects the key. Not inferred from the sandbox.
   */
  authMode?: 'host' | 'api-key'
  /** Emit a `file.changed` CUSTOM event with the git diff after the run (default true). */
  emitDiff?: boolean
}

/** POSIX single-quote escape for embedding values in the `claude …` command. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Copy host Anthropic auth into the sandbox process. Docker `exec` Env replaces the container env, so a key set only at create time can vanish. */
function hostClaudeAuthEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN
  if (authToken) env.ANTHROPIC_AUTH_TOKEN = authToken
  return env
}

/**
 * Windows Node often has USERPROFILE but no HOME. Claude then cannot find
 * `~/.claude.json` (the `claude login` file) and prints "Not logged in".
 */
function localProcessHomeEnv(provider: string): Record<string, string> {
  if (provider !== 'local-process') return {}
  if (process.env.HOME) return {}
  const home = process.env.USERPROFILE
  return home ? { HOME: home } : {}
}

/** Format a host tool-bridge as claude's `--mcp-config` JSON. */
function bridgeToMcpConfig(bridge: HostToolBridge): string {
  return JSON.stringify({
    mcpServers: {
      [bridge.name]: {
        type: 'http',
        url: bridge.url,
        headers: { Authorization: `Bearer ${bridge.token}` },
      },
    },
  })
}

export class ClaudeCodeTextAdapter<
  TModel extends ClaudeCodeModel,
> extends BaseTextAdapter<
  TModel,
  ClaudeCodeTextProviderOptions,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  readonly name = 'claude-code' as const

  // Harness adapter: requires a sandbox to run the agent CLI inside.
  override readonly requires = [SandboxCapability] as const

  private readonly adapterConfig: ClaudeCodeTextConfig

  constructor(config: ClaudeCodeTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  private sandboxFrom(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
  ): SandboxHandle {
    const ctx = options.capabilities
    if (!ctx) {
      throw new Error(
        'Adapter "claude-code" requires a sandbox. Add withSandbox(defineSandbox({ ... })) ' +
          'to chat() middleware (e.g. with the local-process or docker provider).',
      )
    }
    return getSandbox(ctx)
  }

  private workdir(options: TextOptions<ClaudeCodeTextProviderOptions>): string {
    return (
      options.modelOptions?.cwd ?? this.adapterConfig.cwd ?? DEFAULT_WORKDIR
    )
  }

  supportsCombinedToolsAndSchema(): boolean {
    return true
  }

  combinedStructuredOutputSource(): 'event' {
    return 'event'
  }

  /** Build the `claude` command line (prompt goes via stdin, not argv). */
  private buildArgv(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
    resume: string | undefined,
    policyFlags: ClaudePolicyFlags,
    mcpConfigPath: string | undefined,
    permissionPromptTool: string | undefined,
    hasJsonSchema: boolean,
  ): Array<string> {
    const config = this.adapterConfig
    const modelOptions = options.modelOptions
    const exeParts = (config.claudeExecutable ?? 'claude').split(' ')

    // `--setting-sources user` before `-p`. Do not pass `--bare`: that flag
    // skips stored `claude login` credentials and prints
    // "Not logged in · Please run /login" (claude-code#51047).
    // `-p` can take the next token as the prompt, so these flags stay first.
    const args: Array<string> = [
      ...exeParts,
      '--setting-sources',
      'user',
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      this.model,
    ]

    if (config.streamPartials !== false) args.push('--include-partial-messages')
    if (resume !== undefined) args.push('--resume', resume)

    const permissionMode =
      modelOptions?.permissionMode ??
      config.permissionMode ??
      policyFlags.permissionMode ??
      'bypassPermissions'
    args.push('--permission-mode', permissionMode)

    const maxTurns = modelOptions?.maxTurns ?? config.maxTurns
    if (maxTurns !== undefined) args.push('--max-turns', String(maxTurns))

    for (const dir of config.addDirs ?? []) args.push('--add-dir', dir)

    const allowedTools = [
      ...(modelOptions?.allowedTools ?? config.allowedTools ?? []),
      ...policyFlags.allowedTools,
    ]
    if (allowedTools.length > 0) {
      args.push('--allowedTools', [...new Set(allowedTools)].join(','))
    }
    const disallowedTools = [
      ...(modelOptions?.disallowedTools ?? config.disallowedTools ?? []),
      ...policyFlags.disallowedTools,
    ]
    if (disallowedTools.length > 0) {
      args.push('--disallowedTools', [...new Set(disallowedTools)].join(','))
    }

    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((prompt) => prompt.content)
      .filter((content) => content.trim() !== '')
    if (systemPrompts.length > 0) {
      const joined = systemPrompts.join('\n\n')
      const flag =
        config.systemPromptMode === 'replace'
          ? '--system-prompt'
          : '--append-system-prompt'
      args.push(flag, joined)
    }

    if (mcpConfigPath !== undefined) args.push('--mcp-config', mcpConfigPath)
    if (hasJsonSchema) {
      args.push('--json-schema', CLAUDE_JSON_SCHEMA_PLACEHOLDER)
    }
    if (permissionPromptTool !== undefined) {
      args.push('--permission-prompt-tool', permissionPromptTool)
    }

    return args
  }

  /**
   * Build the permission-prompt resolver the host MCP bridge exposes to claude
   * (`--permission-prompt-tool`). Maps claude's permission request onto the
   * sandbox policy + client approvals; on an `ask` action with no decision yet,
   * records an approval-requested event and denies (the client re-runs to grant).
   */
  private buildPermissionResolver(
    policy: SandboxPolicy | undefined,
    approvals: ReadonlyMap<string, boolean> | undefined,
    scripts: Record<string, string> | undefined,
    sink: Array<StreamChunk>,
    threadId: string,
    runId: string,
  ): (input: { tool_name?: string; input?: unknown }) => PermissionToolResult {
    const writeTools = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
    const networkTools = new Set(['WebFetch', 'WebSearch'])
    return (request) => {
      const toolName = request.tool_name ?? 'tool'
      const cmdInput = request.input
      const command =
        toolName === 'Bash' &&
        cmdInput !== null &&
        typeof cmdInput === 'object' &&
        'command' in cmdInput &&
        typeof (cmdInput as { command?: unknown }).command === 'string'
          ? (cmdInput as { command: string }).command
          : undefined
      const capability = writeTools.has(toolName)
        ? 'fileWrite'
        : networkTools.has(toolName)
          ? 'network'
          : undefined
      const id = approvalId({
        provider: 'claude-code',
        kind: command !== undefined ? 'command' : (capability ?? 'tool'),
        target: command ?? toolName,
      })
      const outcome = resolveApproval({
        policy,
        approvals,
        id,
        scripts,
        ...(command !== undefined ? { command } : {}),
        ...(capability !== undefined ? { capability } : {}),
      })
      if (outcome.needsApproval) {
        sink.push(
          buildApprovalRequestedEvent({
            approvalId: id,
            title: `Approve ${toolName}${command !== undefined ? `: ${command}` : ''}`,
            threadId,
            runId,
            detail: { provider: 'claude-code', toolName },
          }),
        )
        return {
          behavior: 'deny',
          message:
            'Awaiting client approval. Approve in the UI and re-run to continue.',
        }
      }
      return outcome.decision === 'allow'
        ? { behavior: 'allow' }
        : { behavior: 'deny', message: 'Denied by sandbox policy.' }
    }
  }

  async *chatStream(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let bridge: HostToolBridge | undefined
    let channel: BridgeEventChannel | undefined
    const approvalRequests: Array<StreamChunk> = []
    // Temp files written for the run (bridge MCP config, redirected prompt) that
    // carry the bearer token / prompt; removed in `finally` so they don't linger
    // in the sandbox after the run.
    let cleanupSandbox: SandboxHandle | undefined
    const tempFiles: Array<string> = []
    try {
      const sandbox = this.sandboxFrom(options)
      cleanupSandbox = sandbox
      const cwd = this.workdir(options)

      // Durability comes from `withSandbox(sandbox, { runs, durability })`, read
      // back off the capability bus. Absent it, everything below resolves to
      // exactly today's behavior (no journal option, no alignment, and a
      // generated `runId` when the caller didn't supply one).
      const durability = options.capabilities
        ? getSandboxDurability(options.capabilities, { optional: true })
        : undefined
      // The journaled path below derives its journal path and its
      // message-id generator from `runId`. A resuming host must recompute
      // the same `runId` to find the same journal file and reproduce the
      // same translated ids — that's only possible when the caller supplies
      // `runId` explicitly. `resolveDurableRunId` enforces that loudly (via
      // `DurableRunIdRequiredError`) whenever durability is wired, and falls
      // back to a fresh `this.generateId()` otherwise, preserving today's
      // behavior for non-durable runs.
      const runId = resolveDurableRunId(options.runId, {
        durable: durability !== undefined,
        adapter: 'claude-code',
        fallback: () => this.generateId(),
      })
      // `threadId` is stamped on every chunk `translateSdkStream` emits, so an
      // ATTACHING run that mints a fresh one replays a stream the stored log
      // cannot match at index 0. `resolveDurableThreadId` refuses that up front
      // instead of letting alignment discover it mid-stream; a durable FRESH run
      // and a non-durable run both keep the generated fallback untouched.
      const threadId = resolveDurableThreadId(options.threadId, {
        durable: durability !== undefined,
        attaching: durability?.attach === true,
        adapter: 'claude-code',
        fallback: () => this.generateId(),
      })
      // Surfaces custom events from bridged tools (e.g. code mode console logs)
      // on this run's live output stream.
      channel = createBridgeEventChannel({ model: this.model, threadId, runId })

      // Idempotently project workspace skills/plugins/MCP into the sandbox in
      // claude's native format (guarded by the projection marker file).
      const projection = options.capabilities
        ? getWorkspaceProjection(options.capabilities, { optional: true })
        : undefined
      if (projection) await projectClaudeWorkspace(sandbox, projection)

      const policy = options.capabilities
        ? getSandboxPolicy(options.capabilities, { optional: true })
        : undefined

      // A permission-prompt tool gates the agent's native tools when a policy
      // can `ask`/`deny` (interactive approvals).
      const permission =
        policy !== undefined
          ? {
              toolName: 'approval_prompt',
              resolve: this.buildPermissionResolver(
                policy,
                options.approvals,
                projection?.scripts,
                approvalRequests,
                threadId,
                runId,
              ),
            }
          : undefined

      // Bridge chat()-provided server tools (and/or the permission tool) into
      // the sandbox over MCP.
      const hasTools = options.tools !== undefined && options.tools.length > 0
      if (hasTools || permission !== undefined) {
        const provisioner =
          (options.capabilities
            ? getToolBridgeProvisioner(options.capabilities, { optional: true })
            : undefined) ?? nodeHttpBridgeProvisioner
        bridge = await provisioner.provision(options.tools ?? [], {
          provider: sandbox.provider,
          context: options.context,
          emitCustomEvent: channel.emitCustomEvent,
          ...(permission !== undefined ? { permission } : {}),
          ...(options.abortController?.signal
            ? { signal: options.abortController.signal }
            : {}),
        })
      }

      const built = buildPrompt(
        options.messages,
        options.modelOptions?.sessionId,
      )
      const resume = built.resume
      const prompt =
        options.outputSchema !== undefined
          ? appendOutputSchemaInstruction(built.prompt, options.outputSchema)
          : built.prompt
      // Both files below name themselves after `runId`, and durability makes
      // `runId` CALLER-chosen. Raw, a `/` in it would silently turn each basename
      // into a nested path (writing outside the intended directory, or failing on
      // one that does not exist), `..` would climb out of that directory, and a
      // long id would fail the spawn with `ENAMETOOLONG`. `encodeRunId` collapses
      // any id to one bounded, injective path segment — the same encoder
      // `journalPaths` uses, so these files and the journal agree on how a given
      // id spells. Computed once so the two filenames cannot drift apart.
      const runIdSegment = encodeRunId(runId)

      // The bridge MCP config carries the per-run bearer token. Write it to a
      // file and pass claude the PATH, so the token never appears in argv (where
      // any process in the sandbox could read it via `ps` / `/proc/<pid>/cmdline`).
      let mcpConfigArg: string | undefined
      if (bridge) {
        // Pass claude a path RELATIVE to its cwd (the real workdir the handle
        // runs the process in). An absolute VIRTUAL path like `/workspace/…` is
        // wrong wherever claude runs outside a sandbox that literally uses
        // `/workspace` — e.g. local-process on Windows, where git-bash resolves
        // `/workspace` to `C:\Program Files\Git\workspace` and the file is "not
        // found". The bare filename resolves correctly on every provider.
        const mcpConfigFile = `.tanstack-mcp-bridge-${runIdSegment}.json`
        const mcpConfigPath = `${cwd}/${mcpConfigFile}`
        await sandbox.fs.write(mcpConfigPath, bridgeToMcpConfig(bridge))
        tempFiles.push(mcpConfigPath)
        mcpConfigArg = mcpConfigFile
      }
      let jsonSchemaFile: string | undefined
      if (options.outputSchema !== undefined) {
        jsonSchemaFile = `tanstack-output-schema-${runIdSegment}.json`
        const schemaPath = `${cwd}/${jsonSchemaFile}`
        await sandbox.fs.write(schemaPath, JSON.stringify(options.outputSchema))
        tempFiles.push(schemaPath)
      }
      const runnerFile = `tanstack-claude-run-${runIdSegment}.mjs`
      await sandbox.fs.write(`${cwd}/${runnerFile}`, CLAUDE_RUNNER_SOURCE)
      tempFiles.push(`${cwd}/${runnerFile}`)
      const argv = this.buildArgv(
        options,
        resume,
        mapPolicyToClaudeFlags(policy),
        mcpConfigArg,
        bridge && permission
          ? `mcp__${bridge.name}__${permission.toolName}`
          : undefined,
        jsonSchemaFile !== undefined,
      )
      // Filenames only on the shell line. JSON (schema, system prompt, MCP
      // config path) lives in the argv file so git-bash cannot retokenize it.
      const argvFile = `tanstack-claude-argv-${runIdSegment}.json`
      await sandbox.fs.write(`${cwd}/${argvFile}`, JSON.stringify(argv))
      tempFiles.push(`${cwd}/${argvFile}`)
      const command =
        jsonSchemaFile === undefined
          ? `node ${q(runnerFile)} ${q(argvFile)}`
          : `node ${q(runnerFile)} ${q(argvFile)} ${q(jsonSchemaFile)}`

      // Deliver the prompt. The default feeds it over stdin (keeps it out of
      // argv). Providers without a writable host→process stdin (e.g. Cloudflare)
      // can't accept that write, so write the prompt to a file and redirect the
      // CLI's stdin from it in-shell (`claude -p … < file`) — still out of argv.
      let runCommand = command
      let stdinInput: string | undefined = prompt
      if (sandbox.capabilities.writableStdin === false) {
        const promptPath = `/tmp/tanstack-claude-prompt-${runIdSegment}`
        await sandbox.fs.write(promptPath, prompt)
        tempFiles.push(promptPath)
        runCommand = `${command} < ${q(promptPath)}`
        stdinInput = undefined
      }

      logger.request(
        `activity=chat provider=claude-code model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${resume ?? 'none'}`,
        { provider: 'claude-code', model: this.model },
      )

      const authMode =
        options.modelOptions?.authMode ?? this.adapterConfig.authMode
      const injectApiKey = authMode === 'api-key'

      const journalOptions = journalOptionsFor(durability, runId)
      const rawEvents = spawnNdjson(sandbox, runCommand, {
        cwd,
        ...(stdinInput !== undefined ? { input: stdinInput } : {}),
        // Isolated sandboxes often run as root. Claude refuses
        // `--dangerously-skip-permissions` as root unless IS_SANDBOX=1.
        // CLAUDE_CODE_SANDBOXED marks a real isolation boundary. Do not set
        // either on local-process: that provider runs on the host.
        env: {
          ...(sandbox.provider === 'local-process'
            ? {}
            : {
                IS_SANDBOX: '1',
                CLAUDE_CODE_SANDBOXED: '1',
              }),
          ...(injectApiKey ||
          (authMode === undefined && sandbox.provider !== 'local-process')
            ? hostClaudeAuthEnv()
            : {}),
          ...localProcessHomeEnv(sandbox.provider),
          ...this.adapterConfig.env,
        },
        ...(options.abortController?.signal
          ? { signal: options.abortController.signal }
          : options.request?.signal
            ? { signal: options.request.signal }
            : {}),
        onNonJsonLine: (line) =>
          logger.provider(`provider=claude-code non-json line: ${line}`, {
            chunk: line,
          }),
        // Journal + attach both come from the sandbox durability capability, so
        // the attach route configures takeover by passing `attach: true` to
        // `withSandbox` — `chat()` stays free of sandbox vocabulary. Omitted
        // entirely (not passed as `undefined`) when the run isn't durable, so
        // `spawnNdjson` takes its original, unjournaled path byte-for-byte.
        ...(journalOptions === undefined ? {} : { journal: journalOptions }),
      })

      async function* asMessages(): AsyncIterable<AgentSdkMessage> {
        for await (const event of rawEvents) yield event as AgentSdkMessage
      }

      // `mergeChunkStreams` splices `channel.stream` (host-tool-bridge CUSTOM
      // events from LIVE tool execution) into the deterministic translator
      // output. Those events do not occur on a replay, so a takeover's replay is
      // NOT chunk-for-chunk identical to what the log holds. `alignedIfAttaching`
      // handles it: alignment skips stored out-of-band CUSTOM entries within a
      // bounded window (see `align.ts`), so a bridged-tool run can be taken over
      // without a spurious `JournalReplayDivergedError` — while a genuine
      // determinism regression still throws. The wrap goes OUTSIDE the merge:
      // the stored log holds the previous host's merged output, so aligning the
      // pre-merge translated stream alone would compare against a log it never
      // produced. On a non-attaching run this is a pure passthrough (see
      // `alignedIfAttaching`'s `attach` guard).
      yield* alignedIfAttaching(
        mergeChunkStreams(
          translateSdkStream(asMessages(), {
            model: this.model,
            runId,
            threadId,
            ...(options.parentRunId !== undefined && {
              parentRunId: options.parentRunId,
            }),
            // Deterministic on the journaled path: two translations of the same
            // journal prefix from a fresh generator seeded with the same
            // `runId` mint the same message ids (unlike `this.generateId()`,
            // which mixes in `Date.now()` / `Math.random()`). See
            // `createRunScopedIdGen` in `@tanstack/ai-sandbox`.
            genId: createRunScopedIdGen(runId),
            ...(options.outputSchema ? { expectStructuredOutput: true } : {}),
            onSdkMessage: (message) =>
              logger.provider(`provider=claude-code type=${message.type}`, {
                chunk: message,
              }),
          }),
          channel.stream,
        ),
        durability,
        logger,
      )

      // Surface the working-tree diff so UIs can render what the agent changed.
      if (this.adapterConfig.emitDiff !== false) {
        try {
          const diff = await sandbox.process.exec(`git -C ${q(cwd)} diff`, {
            cwd,
          })
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
          // not a git repo / git unavailable — skip the diff event
        }
      }

      // Surface any pending approval requests (policy `ask` actions awaiting a
      // client decision); the client approves and re-runs to continue.
      for (const event of approvalRequests) yield event
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('claude-code.chatStream fatal', {
        error,
        source: 'claude-code.chatStream',
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
      channel?.close()
      if (bridge) await bridge.close()
      // Remove the per-run token/prompt files. Best-effort: a cleanup failure
      // must not mask the run's own outcome.
      if (cleanupSandbox) {
        for (const path of tempFiles) {
          try {
            await cleanupSandbox.fs.remove(path)
          } catch {
            // file already gone / sandbox torn down — nothing to clean up
          }
        }
      }
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<ClaudeCodeTextProviderOptions>,
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
 * Creates a Claude Code harness adapter that runs **inside a sandbox**.
 *
 * Unlike HTTP provider adapters, this is a *harness* adapter: it spawns the
 * `claude` CLI inside the sandbox provided by `withSandbox(...)` (the adapter
 * declares `requires: [SandboxCapability]`), streams its `stream-json` stdout
 * back as AG-UI events, and lets Claude Code run its own agent loop and native
 * tools (Bash, file edits, search, …) against the sandbox workspace. The
 * sandbox image must provide the `claude` executable and `ANTHROPIC_API_KEY`
 * in its environment (e.g. via `workspace.secrets`). The session id is
 * surfaced via a CUSTOM `claude-code.session-id` event so follow-up calls can
 * resume through `modelOptions.sessionId`.
 */
export function claudeCodeText<TModel extends ClaudeCodeModel>(
  model: TModel,
  config: ClaudeCodeTextConfig = {},
): ClaudeCodeTextAdapter<TModel> {
  return new ClaudeCodeTextAdapter(config, model)
}
