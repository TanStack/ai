import { Codex } from '@openai/codex-sdk'
import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { buildPrompt } from '../messages/prompt'
import { startToolBridge } from '../tools/bridge'
import {
  BRIDGED_MCP_SERVER_NAME,
  translateThreadEvents,
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
import type {
  ApprovalMode,
  CodexOptions,
  ModelReasoningEffort,
  SandboxMode,
  ThreadOptions,
  WebSearchMode,
} from '@openai/codex-sdk'
import type { CodexModel } from '../model-meta'
import type { CodexTextProviderOptions } from '../provider-options'
import type { CodexThreadEvent, CodexUsage } from '../stream/sdk-types'

type CodexConfigValue = NonNullable<CodexOptions['config']>[string]

export interface CodexTextConfig {
  /** Working directory for the harness session. Defaults to `process.cwd()`. */
  cwd?: string
  /**
   * Codex sandbox mode. Defaults to the harness default (`read-only`); set
   * `'workspace-write'` to let the harness edit files and run commands
   * inside the working directory.
   */
  sandboxMode?: SandboxMode
  /**
   * Codex approval policy. Headless runs have no approval UI, so this
   * defaults to `'never'` — the sandbox mode is the safety boundary.
   */
  approvalPolicy?: ApprovalMode
  /** Model reasoning effort forwarded to the harness. */
  modelReasoningEffort?: ModelReasoningEffort
  /**
   * Whether to skip the harness's git-repo safety check. Defaults to `true`:
   * a server adapter routinely points at scratch directories that aren't
   * repositories, and the sandbox mode is the real safety boundary.
   */
  skipGitRepoCheck?: boolean
  /** Allow network access inside the `workspace-write` sandbox. */
  networkAccessEnabled?: boolean
  /** Web search mode forwarded to the harness. */
  webSearchMode?: WebSearchMode
  /** Extra writable directories beyond the working directory. */
  additionalDirectories?: Array<string>
  /**
   * OpenAI API key for the harness subprocess (exported as `CODEX_API_KEY`).
   * Falls back to the local `codex login` credentials when omitted.
   */
  apiKey?: string
  /** Override the Codex backend base URL. */
  baseUrl?: string
  /** Path to a Codex executable (defaults to the SDK's bundled binary). */
  codexPathOverride?: string
  /**
   * Environment variables for the harness subprocess. When set, the
   * subprocess does NOT inherit `process.env` (Codex SDK semantics).
   */
  env?: Record<string, string>
  /**
   * Extra `--config key=value` overrides passed to the Codex CLI, e.g.
   * additional `mcp_servers` entries. Merged with (and overridden by) the
   * adapter's own bridged-tools server config.
   */
  config?: CodexOptions['config']
}

function validateTools(tools: Array<AnyTool> | undefined): void {
  if (!tools || tools.length === 0) return
  const unsupported = tools.filter(
    (tool) => typeof tool.execute !== 'function' || tool.needsApproval === true,
  )
  if (unsupported.length > 0) {
    throw new Error(
      `Codex harness cannot execute client-side or approval-gated tools: ${unsupported
        .map((tool) => tool.name)
        .join(
          ', ',
        )}. Provide server execute() implementations without needsApproval, or run these tools outside the harness.`,
    )
  }
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

  private readonly adapterConfig: CodexTextConfig

  constructor(config: CodexTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  async *chatStream(
    options: TextOptions<CodexTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let bridge: Awaited<ReturnType<typeof startToolBridge>> | undefined
    try {
      validateTools(options.tools)

      const modelOptions = options.modelOptions
      const { prompt, resume } = buildPrompt(
        options.messages,
        modelOptions?.sessionId,
      )

      if (options.tools && options.tools.length > 0) {
        bridge = await startToolBridge(options.tools)
      }

      const codex = this.createCodex(bridge?.url)
      const threadOptions = this.buildThreadOptions(options)
      const thread =
        resume !== undefined
          ? codex.resumeThread(resume, threadOptions)
          : codex.startThread(threadOptions)

      logger.request(
        `activity=chat provider=codex model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} resume=${resume ?? 'none'}`,
        { provider: 'codex', model: this.model },
      )

      const signal =
        options.abortController?.signal ?? options.request?.signal ?? undefined
      const { events } = await thread.runStreamed(
        this.applySystemPrompts(options, prompt),
        signal !== undefined ? { signal } : {},
      )

      yield* translateThreadEvents(events as AsyncIterable<CodexThreadEvent>, {
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
    }
  }

  /**
   * Structured output via the harness's native `outputSchema` support: a
   * fresh one-shot read-only thread whose final agent message is a JSON
   * string conforming to the schema.
   */
  async structuredOutput(
    options: StructuredOutputOptions<CodexTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions

    // Fresh one-shot run: deliberately no `resume`, so finalization never
    // mutates the caller's interactive session. No bridge either — tools
    // are a chat concern.
    const { prompt } = buildPrompt(chatOptions.messages, undefined)

    const codex = this.createCodex(undefined)
    const thread = codex.startThread({
      ...this.buildThreadOptions(chatOptions),
      sandboxMode: 'read-only',
    })

    logger.request(
      `activity=structured-output provider=codex model=${this.model}`,
      { provider: 'codex', model: this.model },
    )

    const signal =
      chatOptions.abortController?.signal ??
      chatOptions.request?.signal ??
      undefined
    const { events } = await thread.runStreamed(
      this.applySystemPrompts(chatOptions, prompt),
      {
        outputSchema,
        ...(signal !== undefined && { signal }),
      },
    )

    let rawText = ''
    let usage: CodexUsage | undefined
    for await (const event of events as AsyncIterable<CodexThreadEvent>) {
      logger.provider(`provider=codex type=${event.type}`, { chunk: event })
      if (
        event.type === 'item.completed' &&
        event.item.type === 'agent_message'
      ) {
        rawText = event.item.text
      } else if (event.type === 'turn.completed') {
        usage = event.usage
      } else if (event.type === 'turn.failed') {
        throw new Error(event.error?.message ?? 'Codex turn failed')
      } else if (event.type === 'error') {
        throw new Error(event.message)
      }
    }

    if (rawText === '') {
      throw new Error(
        'Codex run ended without an agent message during structured output generation.',
      )
    }

    const promptTokens = usage?.input_tokens ?? 0
    const completionTokens = usage?.output_tokens ?? 0
    return {
      data: JSON.parse(rawText),
      rawText,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    }
  }

  /**
   * Codex threads have no system-prompt channel, so `systemPrompts` from
   * `chat()` are prepended to the prompt text as an instruction preamble.
   */
  private applySystemPrompts(
    options: TextOptions<CodexTextProviderOptions>,
    prompt: string,
  ): string {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((systemPrompt) => systemPrompt.content)
      .filter((content) => content.trim() !== '')
    if (systemPrompts.length === 0) return prompt
    return `${systemPrompts.join('\n\n')}\n\n${prompt}`
  }

  private createCodex(bridgeUrl: string | undefined): Codex {
    const config = this.adapterConfig
    const mergedConfig: CodexOptions['config'] = {
      ...config.config,
      ...(bridgeUrl !== undefined && {
        mcp_servers: {
          ...(config.config?.mcp_servers as
            | Record<string, CodexConfigValue>
            | undefined),
          [BRIDGED_MCP_SERVER_NAME]: { url: bridgeUrl },
        },
      }),
    }
    return new Codex({
      ...(config.apiKey !== undefined && { apiKey: config.apiKey }),
      ...(config.baseUrl !== undefined && { baseUrl: config.baseUrl }),
      ...(config.codexPathOverride !== undefined && {
        codexPathOverride: config.codexPathOverride,
      }),
      ...(config.env !== undefined && { env: config.env }),
      ...(Object.keys(mergedConfig).length > 0 && { config: mergedConfig }),
    })
  }

  private buildThreadOptions(
    options: TextOptions<CodexTextProviderOptions>,
  ): ThreadOptions {
    const config = this.adapterConfig
    const modelOptions = options.modelOptions

    const sandboxMode = modelOptions?.sandboxMode ?? config.sandboxMode
    const approvalPolicy =
      modelOptions?.approvalPolicy ?? config.approvalPolicy ?? 'never'
    const modelReasoningEffort =
      modelOptions?.modelReasoningEffort ?? config.modelReasoningEffort
    const workingDirectory = modelOptions?.workingDirectory ?? config.cwd
    const skipGitRepoCheck =
      modelOptions?.skipGitRepoCheck ?? config.skipGitRepoCheck ?? true

    return {
      model: this.model,
      approvalPolicy,
      skipGitRepoCheck,
      ...(sandboxMode !== undefined && { sandboxMode }),
      ...(modelReasoningEffort !== undefined && { modelReasoningEffort }),
      ...(workingDirectory !== undefined && { workingDirectory }),
      ...(config.networkAccessEnabled !== undefined && {
        networkAccessEnabled: config.networkAccessEnabled,
      }),
      ...(config.webSearchMode !== undefined && {
        webSearchMode: config.webSearchMode,
      }),
      ...(config.additionalDirectories !== undefined && {
        additionalDirectories: config.additionalDirectories,
      }),
    }
  }
}

/**
 * Creates a Codex text adapter.
 *
 * Unlike HTTP provider adapters, this is a *harness* adapter: Codex runs its
 * own agent loop and executes its own tools (shell commands, file edits,
 * web search, ...) locally, server-side, inside its sandbox. Each `chat()`
 * call runs one full harness turn; harness tool activity streams back as
 * already-resolved tool-call events, and the thread id is surfaced via a
 * CUSTOM `codex.session-id` event so follow-up calls can resume the session
 * through `modelOptions.sessionId`.
 *
 * Note: Codex reports assistant text only as completed messages — there are
 * no token-level text deltas, so text arrives message-at-a-time while tool
 * activity still streams live.
 */
export function codexText<TModel extends CodexModel>(
  model: TModel,
  config: CodexTextConfig = {},
): CodexTextAdapter<TModel> {
  return new CodexTextAdapter(config, model)
}
