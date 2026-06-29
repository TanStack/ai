import { query } from '@anthropic-ai/claude-agent-sdk'
import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { buildPrompt } from '../messages/prompt'
import { createToolBridge } from '../tools/bridge'
import {
  BRIDGED_MCP_SERVER_NAME,
  translateSdkStream,
} from '../stream/translate'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  AnyTool,
  DefaultMessageMetadataByModality,
  Modality,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeCodeModel } from '../model-meta'
import type { ClaudeCodeTextProviderOptions } from '../provider-options'
import type { AgentSdkMessage, SdkResultMessage } from '../stream/sdk-types'

type PermissionMode = NonNullable<Options['permissionMode']>

export interface ClaudeCodeTextConfig {
  /** Working directory for the harness session. Defaults to `process.cwd()`. */
  cwd?: string
  /**
   * Claude Code permission mode. Without an explicit mode or a custom
   * `canUseTool`, the adapter's default permission handler auto-allows
   * bridged TanStack tools and denies anything else that would normally
   * prompt — set `'acceptEdits'` / `'bypassPermissions'` (or `allowedTools`)
   * to let the harness edit files and run commands on a headless server.
   */
  permissionMode?: PermissionMode
  /** Built-in tools the harness may use without prompting. */
  allowedTools?: Array<string>
  /** Built-in tools removed from the harness entirely. */
  disallowedTools?: Array<string>
  /** Maximum harness-internal turns per run. */
  maxTurns?: number
  /**
   * How `systemPrompts` from `chat()` are applied:
   * - `'append'` (default): kept on top of the Claude Code preset prompt
   * - `'replace'`: sent as the entire system prompt
   */
  systemPromptMode?: 'append' | 'replace'
  /** Extra MCP servers passed through to the harness untouched. */
  mcpServers?: Options['mcpServers']
  /**
   * Anthropic API key for the harness subprocess. Falls back to the
   * process environment / the local Claude Code login when omitted.
   */
  apiKey?: string
  /** Extra environment variables for the harness subprocess. */
  env?: Record<string, string>
  /** Path to a Claude Code executable (defaults to the SDK's bundled one). */
  pathToClaudeCodeExecutable?: string
  /** JavaScript runtime used to execute Claude Code. */
  executable?: Options['executable']
  /** Emit true token-level deltas via partial messages (default true). */
  streamPartials?: boolean
  /** Custom permission handler; replaces the adapter's default handler. */
  canUseTool?: Options['canUseTool']
  /**
   * Which Claude Code settings tiers the harness loads. Defaults to
   * `['project']`: the working directory's CLAUDE.md and project settings
   * apply, but user-level config on the host machine (personal plugins,
   * hooks, skills under `~/.claude`) is ignored — a server adapter
   * shouldn't inherit whoever happens to be logged in on the box. Pass
   * `['user', 'project', 'local']` to match CLI behavior, or `[]` for full
   * isolation.
   */
  settingSources?: Options['settingSources']
}

function validateTools(tools: Array<AnyTool> | undefined): void {
  if (!tools || tools.length === 0) return
  const unsupported = tools.filter(
    (tool) => typeof tool.execute !== 'function' || tool.needsApproval === true,
  )
  if (unsupported.length > 0) {
    throw new Error(
      `Claude Code harness cannot execute client-side or approval-gated tools: ${unsupported
        .map((tool) => tool.name)
        .join(
          ', ',
        )}. Provide server execute() implementations without needsApproval, or run these tools outside the harness.`,
    )
  }
}

function getResultError(result: SdkResultMessage): string {
  return result.errors && result.errors.length > 0
    ? result.errors.join('; ')
    : `Claude Code run failed: ${result.subtype}`
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

  private readonly adapterConfig: ClaudeCodeTextConfig

  constructor(config: ClaudeCodeTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  async *chatStream(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    try {
      validateTools(options.tools)

      const modelOptions = options.modelOptions
      const { prompt, resume } = buildPrompt(
        options.messages,
        modelOptions?.sessionId,
      )
      const sdkOptions = this.buildSdkOptions(options, resume)

      logger.request(
        `activity=chat provider=claude-code model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} resume=${resume ?? 'none'}`,
        { provider: 'claude-code', model: this.model },
      )

      const sdkStream = query({ prompt, options: sdkOptions })

      yield* translateSdkStream(sdkStream as AsyncIterable<AgentSdkMessage>, {
        model: this.model,
        runId: options.runId ?? this.generateId(),
        threadId: options.threadId ?? this.generateId(),
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        onSdkMessage: (message) =>
          logger.provider(`provider=claude-code type=${message.type}`, {
            chunk: message,
          }),
      })
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
    }
  }

  /**
   * Structured output via the harness's native `outputFormat` support: a
   * one-shot run (no tools, single turn) whose final result carries
   * `structured_output` matching the schema.
   */
  async structuredOutput(
    options: StructuredOutputOptions<ClaudeCodeTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions

    // Fresh one-shot run: deliberately no `resume`, so finalization never
    // mutates the caller's interactive session.
    const { prompt } = buildPrompt(chatOptions.messages, undefined)

    const sdkOptions: Options = {
      ...this.buildBaseSdkOptions(),
      model: this.model,
      maxTurns: 1,
      tools: [],
      includePartialMessages: false,
      outputFormat: {
        type: 'json_schema',
        schema: outputSchema,
      },
    }

    logger.request(
      `activity=structured-output provider=claude-code model=${this.model}`,
      { provider: 'claude-code', model: this.model },
    )

    for await (const message of query({ prompt, options: sdkOptions })) {
      logger.provider(`provider=claude-code type=${message.type}`, {
        chunk: message,
      })
      if (message.type !== 'result') continue
      const result = message as SdkResultMessage
      if (result.subtype !== 'success') {
        throw new Error(getResultError(result))
      }
      const rawText = result.result ?? ''
      const data =
        result.structured_output !== undefined
          ? result.structured_output
          : JSON.parse(rawText)
      const usage = result.usage
      const promptTokens = usage?.input_tokens ?? 0
      const completionTokens = usage?.output_tokens ?? 0
      return {
        data,
        rawText,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      }
    }

    throw new Error(
      'Claude Code run ended without a result message during structured output generation.',
    )
  }

  /** Options derived from adapter config alone (shared by both entry points). */
  private buildBaseSdkOptions(): Options {
    const config = this.adapterConfig
    const env =
      config.apiKey !== undefined || config.env !== undefined
        ? {
            ...process.env,
            ...config.env,
            ...(config.apiKey !== undefined && {
              ANTHROPIC_API_KEY: config.apiKey,
            }),
          }
        : undefined

    return {
      settingSources: config.settingSources ?? ['project'],
      ...(config.cwd !== undefined && { cwd: config.cwd }),
      ...(env !== undefined && { env }),
      ...(config.pathToClaudeCodeExecutable !== undefined && {
        pathToClaudeCodeExecutable: config.pathToClaudeCodeExecutable,
      }),
      ...(config.executable !== undefined && { executable: config.executable }),
    }
  }

  private buildSdkOptions(
    options: TextOptions<ClaudeCodeTextProviderOptions>,
    resume: string | undefined,
  ): Options {
    const config = this.adapterConfig
    const modelOptions = options.modelOptions

    const permissionMode = modelOptions?.permissionMode ?? config.permissionMode
    const maxTurns = modelOptions?.maxTurns ?? config.maxTurns
    const allowedTools = modelOptions?.allowedTools ?? config.allowedTools
    const disallowedTools =
      modelOptions?.disallowedTools ?? config.disallowedTools
    const cwd = modelOptions?.cwd ?? config.cwd

    const bridged =
      options.tools && options.tools.length > 0
        ? createToolBridge(options.tools)
        : undefined
    const mcpServers = {
      ...config.mcpServers,
      ...(bridged && { [BRIDGED_MCP_SERVER_NAME]: bridged }),
    }

    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((prompt) => prompt.content)
      .filter((content) => content.trim() !== '')
    const joinedPrompts = systemPrompts.join('\n\n')
    const systemPrompt: Options['systemPrompt'] =
      systemPrompts.length === 0
        ? undefined
        : config.systemPromptMode === 'replace'
          ? joinedPrompts
          : { type: 'preset', preset: 'claude_code', append: joinedPrompts }

    const abortController = new AbortController()
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal
    if (externalSignal) {
      if (externalSignal.aborted) abortController.abort()
      else {
        externalSignal.addEventListener(
          'abort',
          () => abortController.abort(),
          { once: true },
        )
      }
    }

    // Default permission handler: bridged TanStack tools always run; any
    // other call that would prompt is denied with guidance instead of
    // hanging a headless server.
    const canUseTool: Options['canUseTool'] =
      config.canUseTool ??
      ((toolName) => {
        if (toolName.startsWith(`mcp__${BRIDGED_MCP_SERVER_NAME}__`)) {
          return Promise.resolve({ behavior: 'allow' as const })
        }
        return Promise.resolve({
          behavior: 'deny' as const,
          message: `Tool "${toolName}" denied by the @tanstack/ai-claude-code default permission policy. Configure permissionMode, allowedTools, or canUseTool on claudeCodeText() to allow it.`,
        })
      })

    return {
      ...this.buildBaseSdkOptions(),
      model: this.model,
      includePartialMessages: config.streamPartials !== false,
      abortController,
      canUseTool,
      ...(cwd !== undefined && { cwd }),
      ...(resume !== undefined && { resume }),
      ...(modelOptions?.forkSession !== undefined && {
        forkSession: modelOptions.forkSession,
      }),
      ...(maxTurns !== undefined && { maxTurns }),
      ...(permissionMode !== undefined && { permissionMode }),
      ...(permissionMode === 'bypassPermissions' && {
        allowDangerouslySkipPermissions: true,
      }),
      ...(allowedTools !== undefined && { allowedTools }),
      ...(disallowedTools !== undefined && { disallowedTools }),
      ...(Object.keys(mcpServers).length > 0 && { mcpServers }),
      ...(systemPrompt !== undefined && { systemPrompt }),
    }
  }
}

/**
 * Creates a Claude Code text adapter.
 *
 * Unlike HTTP provider adapters, this is a *harness* adapter: Claude Code
 * runs its own agent loop and executes its own tools (bash, file edits,
 * search, ...) locally, server-side. Each `chat()` call runs one full
 * harness turn; harness tool activity streams back as already-resolved
 * tool-call events, and the session id is surfaced via a CUSTOM
 * `claude-code.session-id` event so follow-up calls can resume the session
 * through `modelOptions.sessionId`.
 */
export function claudeCodeText<TModel extends ClaudeCodeModel>(
  model: TModel,
  config: ClaudeCodeTextConfig = {},
): ClaudeCodeTextAdapter<TModel> {
  return new ClaudeCodeTextAdapter(config, model)
}
