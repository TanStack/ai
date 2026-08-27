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
  AdapterYieldChunk,
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

export type ClaudeCodeSettingSource = 'user' | 'project' | 'local'

const DEFAULT_WORKDIR = '/workspace'

export interface ClaudeCodeTextConfig {
  cwd?: string
  permissionMode?: ClaudeCodePermissionMode
  /** Built-in tools the harness may use (`--allowedTools`). */
  allowedTools?: Array<string>
  /** Built-in tools removed from the harness (`--disallowedTools`). */
  disallowedTools?: Array<string>
  /** Extra directories the agent may access (`--add-dir`). */
  addDirs?: Array<string>
  /** Maximum harness-internal turns (`--max-turns`). */
  maxTurns?: number
  settingSources?: Array<ClaudeCodeSettingSource>
  systemPromptMode?: 'append' | 'replace'
  /** Path/name of the claude executable inside the sandbox. Defaults to `claude`. */
  claudeExecutable?: string
  /** Emit token-level deltas via `--include-partial-messages` (default true). */
  streamPartials?: boolean
  /** Extra environment variables for the claude process inside the sandbox. */
  env?: Record<string, string>
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
  options: TextOptions<ClaudeCodeTextProviderOptions>,
): { signal: AbortSignal } | Record<string, never> {
  if (options.abortController?.signal) {
    return { signal: options.abortController.signal }
  }
  if (options.request?.signal) {
    return { signal: options.request.signal }
  }
  return {}
}

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
    const settingSources = config.settingSources ?? ['project']

    const args: Array<string> = [
      ...exeParts,
      '--setting-sources',
      settingSources.join(','),
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

    this.pushClaudeToolFlags(args, options, policyFlags)
    this.pushClaudeSystemPromptFlags(args, options)

    if (mcpConfigPath !== undefined) args.push('--mcp-config', mcpConfigPath)
    if (hasJsonSchema) {
      args.push('--json-schema', CLAUDE_JSON_SCHEMA_PLACEHOLDER)
    }
    if (permissionPromptTool !== undefined) {
      args.push('--permission-prompt-tool', permissionPromptTool)
    }

    return args
  }

  private pushClaudeToolFlags(
    args: Array<string>,
    options: TextOptions<ClaudeCodeTextProviderOptions>,
    policyFlags: ClaudePolicyFlags,
  ): void {
    const config = this.adapterConfig
    const modelOptions = options.modelOptions
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
  }

  private pushClaudeSystemPromptFlags(
    args: Array<string>,
    options: TextOptions<ClaudeCodeTextProviderOptions>,
  ): void {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((prompt) => prompt.content)
      .filter((content) => content.trim() !== '')
    if (systemPrompts.length === 0) return
    const flag =
      this.adapterConfig.systemPromptMode === 'replace'
        ? '--system-prompt'
        : '--append-system-prompt'
    args.push(flag, systemPrompts.join('\n\n'))
  }

  private buildPermissionResolver(
    policy: SandboxPolicy | undefined,
    approvals: ReadonlyMap<string, boolean> | undefined,
    scripts: Record<string, string> | undefined,
    sink: Array<AdapterYieldChunk>,
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

  private claudePermissionTool(
    policy: SandboxPolicy | undefined,
    options: TextOptions<ClaudeCodeTextProviderOptions>,
    scripts: Record<string, string> | undefined,
    approvalRequests: Array<AdapterYieldChunk>,
    threadId: string,
    runId: string,
  ):
    | {
        toolName: string
        resolve: (input: {
          tool_name?: string
          input?: unknown
        }) => PermissionToolResult
      }
    | undefined {
    if (policy === undefined) return undefined
    return {
      toolName: 'approval_prompt',
      resolve: this.buildPermissionResolver(
        policy,
        options.approvals,
        scripts,
        approvalRequests,
        threadId,
        runId,
      ),
    }
  }

  private async maybeProvisionClaudeBridge(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
    sandbox: SandboxHandle,
    channel: BridgeEventChannel,
    permission:
      | {
          toolName: string
          resolve: (input: {
            tool_name?: string
            input?: unknown
          }) => PermissionToolResult
        }
      | undefined,
  ): Promise<HostToolBridge | undefined> {
    const hasTools = options.tools !== undefined && options.tools.length > 0
    const skipBridge = !hasTools && permission === undefined
    if (skipBridge) return undefined
    const provisioner =
      (options.capabilities
        ? getToolBridgeProvisioner(options.capabilities, { optional: true })
        : undefined) ?? nodeHttpBridgeProvisioner
    return await provisioner.provision(options.tools ?? [], {
      provider: sandbox.provider,
      context: options.context,
      emitCustomEvent: channel.emitCustomEvent,
      ...(permission !== undefined ? { permission } : {}),
      ...(options.abortController?.signal
        ? { signal: options.abortController.signal }
        : {}),
    })
  }

  private async writeClaudeRunFiles(args: {
    sandbox: SandboxHandle
    cwd: string
    runIdSegment: string
    bridge: HostToolBridge | undefined
    permission:
      | {
          toolName: string
          resolve: (input: {
            tool_name?: string
            input?: unknown
          }) => PermissionToolResult
        }
      | undefined
    options: TextOptions<ClaudeCodeTextProviderOptions>
    resume: string | undefined
    policy: SandboxPolicy | undefined
    prompt: string
    tempFiles: Array<string>
  }): Promise<{ runCommand: string; stdinInput: string | undefined }> {
    const {
      sandbox,
      cwd,
      runIdSegment,
      bridge,
      permission,
      options,
      resume,
      policy,
      prompt,
      tempFiles,
    } = args
    let mcpConfigArg: string | undefined
    if (bridge) {
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
    const argvFile = `tanstack-claude-argv-${runIdSegment}.json`
    await sandbox.fs.write(`${cwd}/${argvFile}`, JSON.stringify(argv))
    tempFiles.push(`${cwd}/${argvFile}`)
    const command =
      jsonSchemaFile === undefined
        ? `node ${q(runnerFile)} ${q(argvFile)}`
        : `node ${q(runnerFile)} ${q(argvFile)} ${q(jsonSchemaFile)}`
    if (sandbox.capabilities.writableStdin !== false) {
      return { runCommand: command, stdinInput: prompt }
    }
    const promptPath = `/tmp/tanstack-claude-prompt-${runIdSegment}`
    await sandbox.fs.write(promptPath, prompt)
    tempFiles.push(promptPath)
    return {
      runCommand: `${command} < ${q(promptPath)}`,
      stdinInput: undefined,
    }
  }

  private claudeSpawnEnv(
    sandbox: SandboxHandle,
    options: TextOptions<ClaudeCodeTextProviderOptions>,
  ): Record<string, string> {
    const authMode =
      options.modelOptions?.authMode ?? this.adapterConfig.authMode ?? 'api-key'
    return {
      ...(sandbox.provider === 'local-process'
        ? {}
        : {
            IS_SANDBOX: '1',
            CLAUDE_CODE_SANDBOXED: '1',
          }),
      ...(authMode === 'api-key' ? hostClaudeAuthEnv() : {}),
      ...localProcessHomeEnv(sandbox.provider),
      ...this.adapterConfig.env,
    }
  }

  private spawnClaudeNdjson(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
    sandbox: SandboxHandle,
    cwd: string,
    prepared: { runCommand: string; stdinInput: string | undefined },
    durability: ReturnType<typeof getSandboxDurability> | undefined,
    runId: string,
  ) {
    const journalOptions = journalOptionsFor(durability, runId)
    return spawnNdjson(sandbox, prepared.runCommand, {
      cwd,
      ...(prepared.stdinInput !== undefined
        ? { input: prepared.stdinInput }
        : {}),
      env: this.claudeSpawnEnv(sandbox, options),
      ...abortSignalFields(options),
      onNonJsonLine: (line) =>
        options.logger.provider(`provider=claude-code non-json line: ${line}`, {
          chunk: line,
        }),
      ...(journalOptions === undefined ? {} : { journal: journalOptions }),
    })
  }

  private async *emitClaudeDiff(
    sandbox: SandboxHandle,
    cwd: string,
    threadId: string,
    runId: string,
  ): AsyncIterable<AdapterYieldChunk> {
    if (this.adapterConfig.emitDiff === false) return
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
      // not a git repo / git unavailable — skip the diff event
    }
  }

  async *chatStream(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    let bridge: HostToolBridge | undefined
    let channel: BridgeEventChannel | undefined
    const approvalRequests: Array<AdapterYieldChunk> = []
    let cleanupSandbox: SandboxHandle | undefined
    const tempFiles: Array<string> = []
    try {
      const sandbox = this.sandboxFrom(options)
      cleanupSandbox = sandbox
      const cwd = this.workdir(options)

      const durability = options.capabilities
        ? getSandboxDurability(options.capabilities, { optional: true })
        : undefined
      const runId = resolveDurableRunId(options.runId, {
        durable: durability !== undefined,
        adapter: 'claude-code',
        fallback: () => this.generateId(),
      })
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
      const permission = this.claudePermissionTool(
        policy,
        options,
        projection?.scripts,
        approvalRequests,
        threadId,
        runId,
      )
      bridge = await this.maybeProvisionClaudeBridge(
        options,
        sandbox,
        channel,
        permission,
      )

      const built = buildPrompt(
        options.messages,
        options.modelOptions?.sessionId,
      )
      const resume = built.resume
      const prompt =
        options.outputSchema !== undefined
          ? appendOutputSchemaInstruction(built.prompt, options.outputSchema)
          : built.prompt
      const runIdSegment = encodeRunId(runId)
      const prepared = await this.writeClaudeRunFiles({
        sandbox,
        cwd,
        runIdSegment,
        bridge,
        permission,
        options,
        resume,
        policy,
        prompt,
        tempFiles,
      })

      logger.request(
        `activity=chat provider=claude-code model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${resume ?? 'none'}`,
        { provider: 'claude-code', model: this.model },
      )

      const rawEvents = this.spawnClaudeNdjson(
        options,
        sandbox,
        cwd,
        prepared,
        durability,
        runId,
      )

      async function* asMessages(): AsyncIterable<AgentSdkMessage> {
        for await (const event of rawEvents) yield event as AgentSdkMessage
      }

      yield* alignedIfAttaching(
        mergeChunkStreams(
          translateSdkStream(asMessages(), {
            model: this.model,
            runId,
            threadId,
            ...(options.parentRunId !== undefined && {
              parentRunId: options.parentRunId,
            }),
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

      yield* this.emitClaudeDiff(sandbox, cwd, threadId, runId)
      for (const event of approvalRequests) yield event
    } catch (error: unknown) {
      logger.errors('claude-code.chatStream fatal', {
        error,
        source: 'claude-code.chatStream',
      })
      yield chatRunErrorChunk(error, options.model)
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

export function claudeCodeText<TModel extends ClaudeCodeModel>(
  model: TModel,
  config: ClaudeCodeTextConfig = {},
): ClaudeCodeTextAdapter<TModel> {
  return new ClaudeCodeTextAdapter(config, model)
}
