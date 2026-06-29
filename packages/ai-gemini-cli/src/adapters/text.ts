import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { buildPrompt } from '../messages/prompt'
import { startToolBridge } from '../tools/bridge'
import { startAcpSession } from '../process/acp-client'
import { resolvePermission } from '../process/permissions'
import { AsyncQueue } from '../stream/queue'
import {
  BRIDGED_MCP_SERVER_NAME,
  translateAcpStream,
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
import type { AcpSessionHandle } from '../process/acp-client'
import type {
  GeminiCliPermissionMode,
  PermissionHandler,
} from '../process/permissions'
import type { AcpUsage } from '../stream/acp-types'
import type { AcpStreamEvent } from '../stream/translate'
import type { GeminiCliModel } from '../model-meta'
import type { GeminiCliTextProviderOptions } from '../provider-options'
import type { ToolBridgeHandle } from '../tools/bridge'

export interface GeminiCliTextConfig {
  /** Working directory for the harness session. Defaults to `process.cwd()`. */
  cwd?: string
  /** Path to the Gemini CLI executable. Defaults to `gemini` on PATH. */
  executablePath?: string
  /** Extra CLI arguments appended after `--acp`. */
  extraArgs?: Array<string>
  /** Extra environment variables merged over `process.env`. */
  env?: Record<string, string>
  /**
   * Gemini CLI permission mode. Without an explicit mode or a custom
   * `onPermissionRequest`, the adapter's default policy auto-allows bridged
   * TanStack tools and rejects anything else that would normally prompt —
   * set `'acceptEdits'` / `'bypassPermissions'` to let the harness edit
   * files and run commands on a headless server.
   */
  permissionMode?: GeminiCliPermissionMode
  /** Custom permission handler; replaces the adapter's default policy. */
  onPermissionRequest?: PermissionHandler
  /**
   * ACP auth method to select before starting the session, e.g.
   * `'oauth-personal'` (Log in with Google), `'gemini-api-key'`, or
   * `'vertex-ai'`. Needed when the installed CLI isn't already authenticated
   * for headless use; the agent advertises the available method ids in its
   * ACP initialize response. Overridable per call via
   * `modelOptions.authMethodId`.
   */
  authMethodId?: string
}

function validateTools(tools: Array<AnyTool> | undefined): void {
  if (!tools || tools.length === 0) return
  const unsupported = tools.filter(
    (tool) => typeof tool.execute !== 'function' || tool.needsApproval === true,
  )
  if (unsupported.length > 0) {
    throw new Error(
      `Gemini CLI harness cannot execute client-side or approval-gated tools: ${unsupported
        .map((tool) => tool.name)
        .join(
          ', ',
        )}. Provide server execute() implementations without needsApproval, or run these tools outside the harness.`,
    )
  }
}

/** Extract the first JSON object/array from possibly fenced model output. */
function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '')
    : trimmed
  try {
    return JSON.parse(unfenced)
  } catch {
    const start = unfenced.search(/[{[]/)
    if (start === -1) {
      throw new Error(
        `Gemini CLI structured output is not valid JSON: ${text.slice(0, 200)}`,
      )
    }
    const end = Math.max(unfenced.lastIndexOf('}'), unfenced.lastIndexOf(']'))
    return JSON.parse(unfenced.slice(start, end + 1))
  }
}

export class GeminiCliTextAdapter<
  TModel extends GeminiCliModel,
> extends BaseTextAdapter<
  TModel,
  GeminiCliTextProviderOptions,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  readonly name = 'gemini-cli' as const

  private readonly adapterConfig: GeminiCliTextConfig

  constructor(config: GeminiCliTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  async *chatStream(
    options: TextOptions<GeminiCliTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let bridge: ToolBridgeHandle | undefined
    let handle: AcpSessionHandle | undefined
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal ?? undefined
    let onAbort: (() => void) | undefined

    try {
      validateTools(options.tools)

      const modelOptions = options.modelOptions
      const sessionId = modelOptions?.sessionId
      // Validates the trailing user message up front (throws before any
      // subprocess is spawned) and prepares the resume-path prompt.
      const { prompt: resumePrompt } = buildPrompt(options.messages, sessionId)

      if (options.tools && options.tools.length > 0) {
        bridge = await startToolBridge(options.tools)
      }
      const bridgedToolNames = new Set(
        (options.tools ?? []).map((tool) => tool.name),
      )

      const queue = new AsyncQueue<AcpStreamEvent>()
      const mode =
        modelOptions?.permissionMode ??
        this.adapterConfig.permissionMode ??
        'default'
      const permissionHandler: PermissionHandler =
        this.adapterConfig.onPermissionRequest ??
        ((request) => resolvePermission(request, mode, bridgedToolNames))

      logger.request(
        `activity=chat provider=gemini-cli model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} resume=${sessionId ?? 'none'}`,
        { provider: 'gemini-cli', model: this.model },
      )

      handle = await startAcpSession({
        ...(this.adapterConfig.executablePath !== undefined && {
          executablePath: this.adapterConfig.executablePath,
        }),
        ...(this.adapterConfig.extraArgs !== undefined && {
          extraArgs: this.adapterConfig.extraArgs,
        }),
        ...(this.adapterConfig.env !== undefined && {
          env: this.adapterConfig.env,
        }),
        ...((modelOptions?.authMethodId ?? this.adapterConfig.authMethodId) !==
          undefined && {
          authMethodId:
            modelOptions?.authMethodId ?? this.adapterConfig.authMethodId,
        }),
        model: this.model,
        cwd: modelOptions?.cwd ?? this.adapterConfig.cwd ?? process.cwd(),
        ...(bridge !== undefined && {
          mcpServers: [{ name: BRIDGED_MCP_SERVER_NAME, url: bridge.url }],
        }),
        ...(sessionId !== undefined && { resumeSessionId: sessionId }),
        onUpdate: (update) => queue.push({ kind: 'update', update }),
        onPermissionRequest: permissionHandler,
      })
      const session = handle

      if (externalSignal !== undefined) {
        onAbort = () => void session.cancel().catch(() => undefined)
        if (externalSignal.aborted) onAbort()
        else externalSignal.addEventListener('abort', onAbort, { once: true })
      }

      queue.push({ kind: 'session', sessionId: session.sessionId })

      // When resume was requested but the CLI couldn't load the session,
      // fall back to seeding a fresh session with the whole transcript.
      const promptText = this.applySystemPrompts(
        options,
        session.resumed || sessionId === undefined
          ? resumePrompt
          : buildPrompt(options.messages, undefined).prompt,
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

      yield* translateAcpStream(queue, {
        model: this.model,
        runId: options.runId ?? this.generateId(),
        threadId: options.threadId ?? this.generateId(),
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        bridgedToolNames,
        onAcpEvent: (event) =>
          logger.provider(`provider=gemini-cli kind=${event.kind}`, {
            chunk: event,
          }),
      })
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('gemini-cli.chatStream fatal', {
        error,
        source: 'gemini-cli.chatStream',
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
      await handle?.dispose()
      await bridge?.close()
    }
  }

  /**
   * Structured output, best-effort: ACP has no native JSON-schema channel,
   * so the schema is embedded as a prompt instruction and the final text is
   * parsed (stripping markdown fences when present). Runs in a fresh
   * session with the default deny-everything permission policy.
   */
  async structuredOutput(
    options: StructuredOutputOptions<GeminiCliTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions

    // Fresh one-shot run: deliberately no resume, so finalization never
    // mutates the caller's interactive session. No bridge either — tools
    // are a chat concern.
    const { prompt } = buildPrompt(chatOptions.messages, undefined)
    const instruction = `Respond with ONLY a JSON value that conforms to this JSON Schema — no prose, no markdown fences:\n${JSON.stringify(outputSchema)}`
    const promptText = this.applySystemPrompts(
      chatOptions,
      `${prompt}\n\n${instruction}`,
    )

    logger.request(
      `activity=structured-output provider=gemini-cli model=${this.model}`,
      { provider: 'gemini-cli', model: this.model },
    )

    let rawText = ''
    const handle = await startAcpSession({
      ...(this.adapterConfig.executablePath !== undefined && {
        executablePath: this.adapterConfig.executablePath,
      }),
      ...(this.adapterConfig.extraArgs !== undefined && {
        extraArgs: this.adapterConfig.extraArgs,
      }),
      ...(this.adapterConfig.env !== undefined && {
        env: this.adapterConfig.env,
      }),
      ...((chatOptions.modelOptions?.authMethodId ??
        this.adapterConfig.authMethodId) !== undefined && {
        authMethodId:
          chatOptions.modelOptions?.authMethodId ??
          this.adapterConfig.authMethodId,
      }),
      model: this.model,
      cwd:
        chatOptions.modelOptions?.cwd ??
        this.adapterConfig.cwd ??
        process.cwd(),
      onUpdate: (update) => {
        if (
          update.sessionUpdate === 'agent_message_chunk' &&
          typeof update.content.text === 'string'
        ) {
          rawText += update.content.text
        }
      },
      onPermissionRequest: (request) =>
        resolvePermission(request, 'default', undefined),
    })

    let usage: AcpUsage | undefined
    try {
      const result = await handle.prompt(promptText)
      usage = result.usage
      if (result.stopReason === 'refusal') {
        throw new Error('Gemini CLI refused the structured output request.')
      }
    } finally {
      await handle.dispose()
    }

    if (rawText.trim() === '') {
      throw new Error(
        'Gemini CLI run ended without a response during structured output generation.',
      )
    }

    const promptTokens = usage?.inputTokens ?? 0
    const completionTokens = usage?.outputTokens ?? 0
    return {
      data: extractJson(rawText),
      rawText,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: usage?.totalTokens ?? promptTokens + completionTokens,
      },
    }
  }

  /**
   * ACP has no system-prompt channel, so `systemPrompts` from `chat()` are
   * prepended to the prompt text as an instruction preamble.
   */
  private applySystemPrompts(
    options: TextOptions<GeminiCliTextProviderOptions>,
    prompt: string,
  ): string {
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((systemPrompt) => systemPrompt.content)
      .filter((content) => content.trim() !== '')
    if (systemPrompts.length === 0) return prompt
    return `${systemPrompts.join('\n\n')}\n\n${prompt}`
  }
}

/**
 * Creates a Gemini CLI text adapter.
 *
 * Unlike HTTP provider adapters, this is a *harness* adapter: Gemini CLI
 * runs its own agent loop and executes its own tools (shell commands, file
 * edits, search, ...) locally, server-side. The adapter drives the CLI over
 * the Agent Client Protocol (`gemini --acp`), so assistant text and thinking
 * stream as true token-level deltas. Each `chat()` call runs one full
 * harness turn; harness tool activity streams back as already-resolved
 * tool-call events, and the session id is surfaced via a CUSTOM
 * `gemini-cli.session-id` event so follow-up calls can resume the session
 * through `modelOptions.sessionId`.
 *
 * Requires the `gemini` CLI to be installed and authenticated on the host
 * (`npm i -g @google/gemini-cli`).
 */
export function geminiCliText<TModel extends GeminiCliModel>(
  model: TModel,
  config: GeminiCliTextConfig = {},
): GeminiCliTextAdapter<TModel> {
  return new GeminiCliTextAdapter(config, model)
}
