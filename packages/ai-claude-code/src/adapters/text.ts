import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  SandboxCapability,
  approvalId,
  buildApprovalRequestedEvent,
  getSandbox,
  getSandboxPolicy,
  getToolBridgeProvisioner,
  getWorkspaceProjection,
  nodeHttpBridgeProvisioner,
  resolveApproval,
  spawnNdjson,
} from '@tanstack/ai-sandbox'
import { buildPrompt } from '../messages/prompt'
import { translateSdkStream } from '../stream/translate'
import { mapPolicyToClaudeFlags } from './policy-map'
import { projectClaudeWorkspace } from './projection'
import type { ClaudePolicyFlags } from './policy-map'
import type {
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
  /** Emit a `file.changed` CUSTOM event with the git diff after the run (default true). */
  emitDiff?: boolean
}

/** POSIX single-quote escape for embedding values in the `claude …` command. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
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

  /** Build the `claude` command line (prompt goes via stdin, not argv). */
  private buildCommand(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
    resume: string | undefined,
    policyFlags: ClaudePolicyFlags,
    mcpConfigPath: string | undefined,
    permissionPromptTool: string | undefined,
  ): string {
    const config = this.adapterConfig
    const modelOptions = options.modelOptions
    const exe = config.claudeExecutable ?? 'claude'

    const args: Array<string> = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      q(this.model),
    ]

    if (config.streamPartials !== false) args.push('--include-partial-messages')
    if (resume !== undefined) args.push('--resume', q(resume))

    // Precedence: per-call modelOptions > adapter config > policy > sandbox default.
    const permissionMode =
      modelOptions?.permissionMode ??
      config.permissionMode ??
      policyFlags.permissionMode ??
      'bypassPermissions'
    args.push('--permission-mode', q(permissionMode))

    const maxTurns = modelOptions?.maxTurns ?? config.maxTurns
    if (maxTurns !== undefined) args.push('--max-turns', String(maxTurns))

    for (const dir of config.addDirs ?? []) args.push('--add-dir', q(dir))

    const allowedTools = [
      ...(modelOptions?.allowedTools ?? config.allowedTools ?? []),
      ...policyFlags.allowedTools,
    ]
    if (allowedTools.length > 0) {
      args.push('--allowedTools', q([...new Set(allowedTools)].join(',')))
    }
    const disallowedTools = [
      ...(modelOptions?.disallowedTools ?? config.disallowedTools ?? []),
      ...policyFlags.disallowedTools,
    ]
    if (disallowedTools.length > 0) {
      args.push('--disallowedTools', q([...new Set(disallowedTools)].join(',')))
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
      args.push(flag, q(joined))
    }

    if (mcpConfigPath !== undefined) args.push('--mcp-config', q(mcpConfigPath))
    if (permissionPromptTool !== undefined) {
      args.push('--permission-prompt-tool', q(permissionPromptTool))
    }

    return `${exe} ${args.join(' ')}`
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
    const approvalRequests: Array<StreamChunk> = []
    try {
      const sandbox = this.sandboxFrom(options)
      const cwd = this.workdir(options)
      const runId = options.runId ?? this.generateId()
      const threadId = options.threadId ?? this.generateId()

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
          ...(permission !== undefined ? { permission } : {}),
          ...(options.abortController?.signal
            ? { signal: options.abortController.signal }
            : {}),
        })
      }

      const { prompt, resume } = buildPrompt(
        options.messages,
        options.modelOptions?.sessionId,
      )
      // The bridge MCP config carries the per-run bearer token. Write it to a
      // file and pass claude the PATH, so the token never appears in argv (where
      // any process in the sandbox could read it via `ps` / `/proc/<pid>/cmdline`).
      let mcpConfigPath: string | undefined
      if (bridge) {
        mcpConfigPath = `${cwd}/.tanstack-mcp-bridge-${runId}.json`
        await sandbox.fs.write(mcpConfigPath, bridgeToMcpConfig(bridge))
      }
      const command = this.buildCommand(
        options,
        resume,
        mapPolicyToClaudeFlags(policy),
        mcpConfigPath,
        bridge && permission
          ? `mcp__${bridge.name}__${permission.toolName}`
          : undefined,
      )

      // Deliver the prompt. The default feeds it over stdin (keeps it out of
      // argv). Providers without a writable host→process stdin (e.g. Cloudflare)
      // can't accept that write, so write the prompt to a file and redirect the
      // CLI's stdin from it in-shell (`claude -p … < file`) — still out of argv.
      let runCommand = command
      let stdinInput: string | undefined = prompt
      if (sandbox.capabilities.writableStdin === false) {
        const promptPath = `/tmp/tanstack-claude-prompt-${runId}`
        await sandbox.fs.write(promptPath, prompt)
        runCommand = `${command} < ${q(promptPath)}`
        stdinInput = undefined
      }

      logger.request(
        `activity=chat provider=claude-code model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${resume ?? 'none'}`,
        { provider: 'claude-code', model: this.model },
      )

      const rawEvents = spawnNdjson(sandbox, runCommand, {
        cwd,
        ...(stdinInput !== undefined ? { input: stdinInput } : {}),
        ...(options.modelOptions === undefined &&
        this.adapterConfig.env === undefined
          ? {}
          : { env: this.adapterConfig.env }),
        ...(options.abortController?.signal
          ? { signal: options.abortController.signal }
          : options.request?.signal
            ? { signal: options.request.signal }
            : {}),
        onNonJsonLine: (line) =>
          logger.provider(`provider=claude-code non-json line: ${line}`, {
            chunk: line,
          }),
      })

      async function* asMessages(): AsyncIterable<AgentSdkMessage> {
        for await (const event of rawEvents) yield event as AgentSdkMessage
      }

      yield* translateSdkStream(asMessages(), {
        model: this.model,
        runId,
        threadId,
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        onSdkMessage: (message) =>
          logger.provider(`provider=claude-code type=${message.type}`, {
            chunk: message,
          }),
      })

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
      if (bridge) await bridge.close()
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<ClaudeCodeTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        'Structured output is not yet supported by the in-sandbox Claude Code adapter. ' +
          'Use a model adapter (e.g. anthropic) for structured output, or omit outputSchema.',
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
