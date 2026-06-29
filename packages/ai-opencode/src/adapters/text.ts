import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { buildPrompt } from '../messages/prompt'
import { startToolBridge } from '../tools/bridge'
import { startOpencodeSession } from '../process/server'
import { resolvePermission } from '../process/permissions'
import { AsyncQueue } from '../stream/queue'
import {
  BRIDGED_MCP_SERVER_NAME,
  translateOpencodeStream,
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
import type { Config } from '@opencode-ai/sdk'
import type { OpencodeSessionHandle } from '../process/server'
import type {
  OpencodePermissionMode,
  PermissionHandler,
} from '../process/permissions'
import type { OpencodeStreamEvent } from '../stream/sdk-types'
import type { OpencodeModel } from '../model-meta'
import type { OpencodeTextProviderOptions } from '../provider-options'
import type { ToolBridgeHandle } from '../tools/bridge'

export interface OpencodeTextConfig {
  /** Working directory for the harness session. Defaults to `process.cwd()`. */
  directory?: string
  /**
   * Attach to an already-running `opencode serve` instead of spawning a new
   * server for each turn (e.g. `http://127.0.0.1:4096`). When omitted, the
   * adapter boots and tears down its own server per turn.
   */
  baseUrl?: string
  /** Hostname for the spawned server. Defaults to the SDK default (`127.0.0.1`). */
  hostname?: string
  /** Port for the spawned server. Defaults to the SDK default (`4096`). */
  port?: number
  /**
   * OpenCode permission mode. Without an explicit mode or a custom
   * `onPermissionRequest`, the adapter's default policy auto-allows bridged
   * TanStack tools and rejects anything else that would normally prompt —
   * set `'acceptEdits'` / `'bypassPermissions'` to let the harness edit files
   * and run commands on a headless server.
   */
  permissionMode?: OpencodePermissionMode
  /** Custom permission handler; replaces the adapter's default policy. */
  onPermissionRequest?: PermissionHandler
  /** Extra OpenCode config merged with the adapter's mcp/permission config. */
  config?: Config
}

function validateTools(tools: Array<AnyTool> | undefined): void {
  if (!tools || tools.length === 0) return
  const unsupported = tools.filter(
    (tool) => typeof tool.execute !== 'function' || tool.needsApproval === true,
  )
  if (unsupported.length > 0) {
    throw new Error(
      `OpenCode harness cannot execute client-side or approval-gated tools: ${unsupported
        .map((tool) => tool.name)
        .join(
          ', ',
        )}. Provide server execute() implementations without needsApproval, or run these tools outside the harness.`,
    )
  }
}

/** Split a `provider/model` id into its provider and model halves. */
function splitModel(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error(
      `OpenCode models must be addressed as "provider/model" (e.g. "anthropic/claude-sonnet-4-5"); received "${model}".`,
    )
  }
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) }
}

/** Baseline server permission config for a mode (the dynamic policy still runs). */
function permissionConfig(
  mode: OpencodePermissionMode,
): NonNullable<Config['permission']> {
  switch (mode) {
    case 'bypassPermissions':
      return { edit: 'allow', bash: 'allow', webfetch: 'allow' }
    case 'acceptEdits':
      return { edit: 'allow', bash: 'ask', webfetch: 'ask' }
    case 'default':
      return { edit: 'ask', bash: 'ask', webfetch: 'ask' }
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
        `OpenCode structured output is not valid JSON: ${text.slice(0, 200)}`,
      )
    }
    const end = Math.max(unfenced.lastIndexOf('}'), unfenced.lastIndexOf(']'))
    return JSON.parse(unfenced.slice(start, end + 1))
  }
}

export class OpencodeTextAdapter<
  TModel extends OpencodeModel,
> extends BaseTextAdapter<
  TModel,
  OpencodeTextProviderOptions,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  readonly name = 'opencode' as const

  private readonly adapterConfig: OpencodeTextConfig

  constructor(config: OpencodeTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  async *chatStream(
    options: TextOptions<OpencodeTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let bridge: ToolBridgeHandle | undefined
    let handle: OpencodeSessionHandle | undefined
    const externalSignal =
      options.abortController?.signal ?? options.request?.signal ?? undefined
    let onAbort: (() => void) | undefined

    try {
      validateTools(options.tools)

      const modelOptions = options.modelOptions
      const sessionId = modelOptions?.sessionId
      // Validates the trailing user message up front (throws before any
      // server is spawned) and prepares the resume-path prompt.
      const { prompt: resumePrompt } = buildPrompt(options.messages, sessionId)
      const { providerID, modelID } = splitModel(this.model)

      if (options.tools && options.tools.length > 0) {
        bridge = await startToolBridge(options.tools)
      }
      const bridgedToolNames = new Set(
        (options.tools ?? []).map((tool) => tool.name),
      )

      const queue = new AsyncQueue<OpencodeStreamEvent>()
      const mode =
        modelOptions?.permissionMode ??
        this.adapterConfig.permissionMode ??
        'default'
      const permissionHandler: PermissionHandler =
        this.adapterConfig.onPermissionRequest ??
        ((request) => resolvePermission(request, mode, bridgedToolNames))

      logger.request(
        `activity=chat provider=opencode model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} resume=${sessionId ?? 'none'}`,
        { provider: 'opencode', model: this.model },
      )

      handle = await startOpencodeSession({
        ...(this.adapterConfig.baseUrl !== undefined && {
          baseUrl: this.adapterConfig.baseUrl,
        }),
        ...(this.adapterConfig.hostname !== undefined && {
          hostname: this.adapterConfig.hostname,
        }),
        ...(this.adapterConfig.port !== undefined && {
          port: this.adapterConfig.port,
        }),
        ...(this.adapterConfig.config !== undefined && {
          config: this.adapterConfig.config,
        }),
        directory:
          modelOptions?.directory ??
          this.adapterConfig.directory ??
          process.cwd(),
        providerID,
        modelID,
        permission: permissionConfig(mode),
        ...(bridge !== undefined && {
          mcpServers: [{ name: BRIDGED_MCP_SERVER_NAME, url: bridge.url }],
        }),
        ...(sessionId !== undefined && { resumeSessionId: sessionId }),
        onEvent: (event) => queue.push({ kind: 'event', event }),
        onPermissionRequest: permissionHandler,
        onError: (error) => queue.fail(error),
      })
      const session = handle

      if (externalSignal !== undefined) {
        onAbort = () => void session.abort().catch(() => undefined)
        if (externalSignal.aborted) onAbort()
        else externalSignal.addEventListener('abort', onAbort, { once: true })
      }

      queue.push({ kind: 'session', sessionId: session.sessionId })

      // When resume was requested but the server no longer has the session,
      // fall back to seeding a fresh session with the whole transcript.
      const promptText = this.applySystemPrompts(
        options,
        session.resumed || sessionId === undefined
          ? resumePrompt
          : buildPrompt(options.messages, undefined).prompt,
      )

      session
        .prompt(promptText)
        .then(({ message }) => {
          queue.push({ kind: 'done', message })
          queue.end()
        })
        .catch((error: unknown) => queue.fail(error))

      yield* translateOpencodeStream(queue, {
        model: this.model,
        runId: options.runId ?? this.generateId(),
        threadId: options.threadId ?? this.generateId(),
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        bridgedToolNames,
        onStreamEvent: (event) =>
          logger.provider(`provider=opencode kind=${event.kind}`, {
            chunk: event,
          }),
      })
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('opencode.chatStream fatal', {
        error,
        source: 'opencode.chatStream',
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
   * Structured output, best-effort: OpenCode's typed prompt API has no native
   * JSON-schema channel, so the schema is embedded as a prompt instruction in
   * a fresh one-shot session and the final text is parsed (markdown fences are
   * stripped when present). Runs with the default deny-everything permission
   * policy.
   */
  async structuredOutput(
    options: StructuredOutputOptions<OpencodeTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions

    // Fresh one-shot run: deliberately no resume, so finalization never
    // mutates the caller's interactive session. No bridge either — tools are
    // a chat concern.
    const { prompt } = buildPrompt(chatOptions.messages, undefined)
    const { providerID, modelID } = splitModel(this.model)
    const instruction = `Respond with ONLY a JSON value that conforms to this JSON Schema — no prose, no markdown fences:\n${JSON.stringify(outputSchema)}`
    const promptText = this.applySystemPrompts(
      chatOptions,
      `${prompt}\n\n${instruction}`,
    )

    logger.request(
      `activity=structured-output provider=opencode model=${this.model}`,
      { provider: 'opencode', model: this.model },
    )

    const handle = await startOpencodeSession({
      ...(this.adapterConfig.baseUrl !== undefined && {
        baseUrl: this.adapterConfig.baseUrl,
      }),
      ...(this.adapterConfig.hostname !== undefined && {
        hostname: this.adapterConfig.hostname,
      }),
      ...(this.adapterConfig.port !== undefined && {
        port: this.adapterConfig.port,
      }),
      ...(this.adapterConfig.config !== undefined && {
        config: this.adapterConfig.config,
      }),
      directory:
        chatOptions.modelOptions?.directory ??
        this.adapterConfig.directory ??
        process.cwd(),
      providerID,
      modelID,
      permission: permissionConfig('default'),
      onEvent: () => undefined,
      onPermissionRequest: (request) =>
        resolvePermission(request, 'default', undefined),
    })

    let rawText = ''
    let usage: { input?: number; output?: number } | undefined
    try {
      const result = await handle.prompt(promptText)
      rawText = result.text
      usage = result.message.tokens
      if (result.message.error) {
        throw new Error(
          result.message.error.data?.message ?? result.message.error.name,
        )
      }
    } finally {
      await handle.dispose()
    }

    if (rawText.trim() === '') {
      throw new Error(
        'OpenCode run ended without a response during structured output generation.',
      )
    }

    const promptTokens = usage?.input ?? 0
    const completionTokens = usage?.output ?? 0
    return {
      data: extractJson(rawText),
      rawText,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    }
  }

  /**
   * OpenCode prompts have no separate system-prompt channel here, so
   * `systemPrompts` from `chat()` are prepended to the prompt text as an
   * instruction preamble.
   */
  private applySystemPrompts(
    options: TextOptions<OpencodeTextProviderOptions>,
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
 * Creates an OpenCode text adapter.
 *
 * Unlike HTTP provider adapters, this is a *harness* adapter: OpenCode runs
 * its own agent loop and executes its own tools (shell commands, file edits,
 * search, ...) locally, server-side. The adapter drives OpenCode over its
 * HTTP server (`@opencode-ai/sdk`), so assistant text and reasoning stream as
 * true token-level deltas. Each `chat()` call runs one full harness turn;
 * harness tool activity streams back as already-resolved tool-call events, and
 * the session id is surfaced via a CUSTOM `opencode.session-id` event so
 * follow-up calls can resume the session through `modelOptions.sessionId`.
 *
 * Models are addressed as `provider/model` (e.g.
 * `anthropic/claude-sonnet-4-5`). Requires the `opencode` CLI to be installed
 * and its providers authenticated on the host (`npm i -g opencode-ai`).
 */
export function opencodeText<TModel extends OpencodeModel>(
  model: TModel,
  config: OpencodeTextConfig = {},
): OpencodeTextAdapter<TModel> {
  return new OpencodeTextAdapter(config, model)
}
