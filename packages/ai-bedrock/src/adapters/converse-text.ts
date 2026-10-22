import {
  CONTEXT_OVERFLOW_CODE,
  EventType,
  convertSchemaToJsonSchema,
} from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { resolveBedrockAuth } from '../utils/auth'
import {
  toConverseMessages,
  toolBlocksToText,
} from '../converse/message-converter'
import { toToolConfig } from '../converse/tool-converter'
import {
  processConverseStream,
  throwIfConverseStreamError,
} from '../converse/stream-processor'
import { buildConverseUsage } from '../converse/usage'
import { converseThinking } from '../converse/reasoning'
import {
  BEDROCK_CLAUDE_NO_FORCED_TOOL_FAMILIES,
  BEDROCK_MODEL_INPUT_MODALITIES,
  BEDROCK_MODEL_REASONING,
} from '../model-meta'
import { addPromptCachePoints } from '../converse/prompt-cache'
import {
  STRUCTURED_TOOL_NAME,
  buildStructuredToolConfig,
} from '../converse/structured-output'
import type { ResolvedBedrockAuth } from '../utils/auth'
import type { ConverseToolInput } from '../converse/tool-converter'
import type * as BedrockRuntime from '@aws-sdk/client-bedrock-runtime'
import type {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  ContentBlock,
  ConverseCommandInput,
  ConverseCommandOutput,
  ConverseStreamCommandInput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'
import type { MiddlewareStack } from '@smithy/types'
import type {
  JSONSchema,
  Modality,
  AdapterYieldChunk,
  TextOptions,
  TokenUsage,
  Tool,
} from '@tanstack/ai'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { BedrockClientConfig } from '../utils/client'
import type {
  BedrockMessageMetadataByModality,
  BedrockSystemPromptMetadata,
  BedrockToolMetadata,
} from '../message-types'
import type {
  BedrockConverseModels,
  BedrockModelReasoningByName,
  ResolveConverseProviderOptions,
  ResolveInputModalities,
} from '../model-meta'

/** Config for the Converse adapter — same client config as the chat adapter. */
export interface BedrockConverseConfig extends BedrockClientConfig {}

/**
 * Bedrock Converse text adapter. Wires the Converse translation modules (message
 * converter, tool converter, stream processor, structured-output forced-tool
 * builder) onto `@tanstack/ai`'s `BaseTextAdapter` and the
 * `@aws-sdk/client-bedrock-runtime` `BedrockRuntimeClient`.
 *
 * The success-path AG-UI lifecycle (`RUN_STARTED`..`RUN_FINISHED`) is owned by
 * `processConverseStream`; this adapter only owns the catch/`RUN_ERROR` path,
 * mirroring openai-base's `chatStream`.
 *
 * The actual SDK calls live behind two protected seams (`sendStream` / `send`)
 * so tests can subclass and inject canned Converse SDK shapes without a real
 * AWS request.
 */
/** The reasoning levels of a model, for `chat({ reasoning })`. `never`: none. */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof BedrockModelReasoningByName
    ? BedrockModelReasoningByName[TModel]
    : never

export class BedrockConverseTextAdapter<
  TModel extends BedrockConverseModels,
  // Constraint mirrors the chat adapter (text.ts): the base parameterises
  // `TProviderOptions extends Record<string, any>`, and our default
  // `ResolveConverseProviderOptions<TModel>` resolves to an interface lacking an
  // implicit index signature — which `Record<string, unknown>` would reject but
  // `Record<string, any>` accepts. Confined to the generic constraint (the
  // established adapter pattern) — no value `as` cast is introduced.
  TProviderOptions extends Record<string, any> =
    ResolveConverseProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  BedrockMessageMetadataByModality,
  // TToolCapabilities — Converse has no per-model tool-capability table; the
  // base default.
  ReadonlyArray<string>,
  // TToolCallMetadata — Converse has no tool-call metadata round-tripping.
  unknown,
  // TSystemPromptMetadata — narrows `systemPrompts[i].metadata` at the chat()
  // call site so users get `cachePoint` autocomplete.
  BedrockSystemPromptMetadata,
  ResolveReasoning<TModel>
> {
  override readonly kind = 'text' as const
  override readonly name = 'bedrock-converse' as const
  override readonly api = 'bedrock-converse-stream'
  override readonly provider = 'amazon-bedrock'
  override readonly inputModalities = BEDROCK_MODEL_INPUT_MODALITIES[this.model]

  private sourceMetadata(model: string) {
    return {
      tanstack: { source: { provider: this.provider, api: this.api, model } },
    }
  }
  private clientPromise?: Promise<BedrockRuntimeClient>
  private readonly clientConfig: BedrockConverseConfig

  constructor(config: BedrockConverseConfig, model: TModel) {
    super({}, model)
    // Defer client construction and auth resolution: the AWS SDK is Node/
    // server-only, so we must not pull it into the static graph here. The
    // client (and its dynamic import) is built lazily on first SDK call.
    this.clientConfig = config
  }

  /**
   * Dynamically import `@aws-sdk/client-bedrock-runtime`. The specifier is held
   * in a variable (not a string literal) so bundler dep scanners (e.g. Vite/
   * esbuild optimizeDeps) cannot statically discover the AWS SDK and try to
   * pre-bundle it for the browser — it would fail on the SDK's Node-only
   * `fromTokenFile` export chain. The SDK is Node/server-only and is only
   * reached on a real request. `typeof import(...)` is a type-only reference
   * (erased at emit) so the imported members keep full typing.
   */
  protected importBedrockRuntime(): Promise<typeof BedrockRuntime> {
    const mod = '@aws-sdk/client-bedrock-runtime'
    return import(/* @vite-ignore */ mod) as Promise<typeof BedrockRuntime>
  }

  /**
   * Lazily construct the `BedrockRuntimeClient`. The dynamic import keeps
   * `@aws-sdk/client-bedrock-runtime` out of the static/browser graph and
   * defers `resolveBedrockAuth` until a real request is made.
   */
  protected async getClient(): Promise<BedrockRuntimeClient> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { BedrockRuntimeClient } = await this.importBedrockRuntime()
        const region = this.clientConfig.region ?? 'us-east-1'
        const resolved = resolveBedrockAuth(
          {
            apiKey: this.clientConfig.apiKey,
            region,
            auth: this.clientConfig.auth,
          },
          'runtime',
        )
        const client = new BedrockRuntimeClient(
          this.buildClientConfig(resolved, region, this.clientConfig.baseURL),
        )
        const defaultHeaders = this.clientConfig.defaultHeaders
        if (defaultHeaders) {
          // `build` runs before SigV4 signing, so gateway headers are signed
          // along with the rest of the request.
          client.middlewareStack.add(
            (next) => (args) => {
              const request = args.request
              if (
                typeof request === 'object' &&
                request !== null &&
                'headers' in request &&
                typeof request.headers === 'object' &&
                request.headers !== null
              ) {
                Object.assign(request.headers, defaultHeaders)
              }
              return next(args)
            },
            { step: 'build', name: 'tanstackDefaultHeaders' },
          )
        }
        return client
      })().catch((error: unknown) => {
        // Don't cache a rejected promise — clear it so a later call can retry
        // (e.g. after a transient import failure or fixed auth config).
        this.clientPromise = undefined
        throw error
      })
    }
    return this.clientPromise
  }

  /**
   * Map resolved auth + endpoint to a `BedrockRuntimeClientConfig`.
   *
   * Recent `@aws-sdk/client-bedrock-runtime` exposes a first-class `token`
   * config field for Bedrock API-key bearer auth. But the client's default
   * auth-scheme order is SigV4 first, then bearer — so passing `token` alone is
   * not enough: the SDK still resolves SigV4 and throws "Could not load
   * credentials from any providers". Pinning `authSchemePreference` to the
   * bearer scheme makes the API key actually get used. SigV4 uses the AWS
   * credential provider chain and the default scheme order.
   */
  protected buildClientConfig(
    resolved: ResolvedBedrockAuth,
    region: string,
    endpoint: string | undefined,
  ): BedrockRuntimeClientConfig {
    if (resolved.kind === 'bearer') {
      return {
        region,
        token: { token: resolved.token },
        authSchemePreference: ['httpBearerAuth'],
        ...(endpoint ? { endpoint } : {}),
      }
    }
    return {
      region: resolved.region,
      credentials: resolved.credentials,
      ...(endpoint ? { endpoint } : {}),
    }
  }

  // ---------------------------------------------------------------------------
  // SDK seams (overridden in tests so no real AWS call happens)
  // ---------------------------------------------------------------------------

  protected async sendStream(
    input: ConverseStreamCommandInput,
  ): Promise<AsyncIterable<ConverseStreamOutput>> {
    const { ConverseStreamCommand } = await this.importBedrockRuntime()
    const client = await this.getClient()
    const command = new ConverseStreamCommand(input)
    addRestoreDocuments(command, input)
    const res = await client.send(command)
    if (!res.stream) {
      throw new Error('Bedrock Converse: empty stream response')
    }
    return res.stream
  }

  protected async send(
    input: ConverseCommandInput,
  ): Promise<ConverseCommandOutput> {
    const { ConverseCommand } = await this.importBedrockRuntime()
    const client = await this.getClient()
    const command = new ConverseCommand(input)
    addRestoreDocuments(command, input)
    return client.send(command)
  }

  // ---------------------------------------------------------------------------
  // Public adapter surface
  // ---------------------------------------------------------------------------

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    try {
      options.logger.request(
        `activity=chat provider=${this.name} model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: this.name, model: this.model },
      )
      const input = this.buildInput(options)
      // Bedrock rejects toolUse and toolResult blocks without a toolConfig,
      // so a request with no tools sends its tool history as text.
      if (!input.toolConfig && input.messages) {
        input.messages = toolBlocksToText(input.messages)
      }
      const stream = await this.sendStream(input)
      for await (const chunk of processConverseStream(
        stream,
        () => this.generateId(),
        {
          threadId: options.threadId,
          parentRunId: options.parentRunId,
          model: options.model,
        },
      )) {
        yield chunk.type === EventType.RUN_STARTED ||
        chunk.type === EventType.RUN_FINISHED
          ? { ...chunk, metadata: this.sourceMetadata(options.model) }
          : chunk
      }
    } catch (error: unknown) {
      const errorPayload = converseRunErrorPayload(
        error,
        `${this.name}.chatStream failed`,
      )
      options.logger.errors(`${this.name}.chatStream fatal`, {
        error: errorPayload,
        source: `${this.name}.chatStream`,
      })
      // Conditional `code` spread keeps the wire shape spec-compliant under
      // `exactOptionalPropertyTypes` (AG-UI's `RunErrorEvent.code` is optional).
      yield {
        type: EventType.RUN_ERROR,
        metadata: this.sourceMetadata(options.model),
        model: options.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        ...(errorPayload.code !== undefined && { code: errorPayload.code }),
        error: {
          message: errorPayload.message,
          ...(errorPayload.code !== undefined && { code: errorPayload.code }),
        },
      }
    }
  }

  /**
   * Structured output via the forced-tool strategy. Converse has no native
   * json_schema response_format, so we force a single tool whose input schema
   * is the requested output schema and read the model's `toolUse.input` back as
   * the structured result.
   */
  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    try {
      chatOptions.logger.request(
        `activity=structuredOutput provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      // Claude rejects a forced tool while thinking is on, so the forced
      // structured-output tool goes without `chat({ reasoning })`.
      const { reasoning: _reasoning, ...requestOptions } = chatOptions
      const input: ConverseCommandInput = {
        ...this.buildInput(requestOptions),
        toolConfig: buildStructuredToolConfig(outputSchema),
      }
      const res = await this.send(input)
      // A forced tool call cut off at the output cap carries partial input,
      // which would read like a schema failure (issue #1426).
      if (res.stopReason === 'max_tokens') {
        throw new Error(
          `${this.name}.structuredOutput: the response was cut off because the maximum token limit was reached (stopReason=max_tokens); raise modelOptions.max_completion_tokens`,
        )
      }
      const structured = extractStructuredToolInput(res)
      if (structured === undefined) {
        throw new Error(
          `${this.name}.structuredOutput: response contained no forced-tool output`,
        )
      }
      const usage = res.usage
      return {
        data: structured,
        rawText: JSON.stringify(structured),
        ...(usage && { usage: buildConverseUsage(usage) }),
      }
    } catch (error: unknown) {
      chatOptions.logger.errors(`${this.name}.structuredOutput fatal`, {
        error: toRunErrorPayload(error, `${this.name}.structuredOutput failed`),
        source: `${this.name}.structuredOutput`,
      })
      throw error
    }
  }

  /**
   * Streaming structured output. Same forced-tool strategy as
   * `structuredOutput`, but streamed: the forced tool's `toolUse.input` JSON
   * fragments are accumulated from the Converse stream and a terminal
   * `CUSTOM 'structured-output.complete'` event carries `{ object, raw }`,
   * mirroring openai-base's `structuredOutputStream` contract exactly.
   */
  async *structuredOutputStream(
    options: StructuredOutputOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { chatOptions, outputSchema } = options
    const runId = this.generateId()
    const threadId = chatOptions.threadId
    const messageId = this.generateId()

    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false
    let accumulatedRaw = ''
    let finishReason: 'stop' | 'length' | 'content_filter' = 'stop'
    // Usage arrives on the trailing `metadata` event, after the finish signal,
    // so it is captured during iteration and folded into RUN_FINISHED below.
    let usage: TokenUsage | undefined

    try {
      chatOptions.logger.request(
        `activity=structuredOutputStream provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      // Claude rejects a forced tool while thinking is on, so the forced
      // structured-output tool goes without `chat({ reasoning })`.
      const { reasoning: _reasoning, ...requestOptions } = chatOptions
      const input: ConverseStreamCommandInput = {
        ...this.buildInput(requestOptions),
        toolConfig: buildStructuredToolConfig(outputSchema),
      }
      const stream = await this.sendStream(input)

      // The forced tool streams its `input` as partial-JSON fragments inside
      // `contentBlockDelta.delta.toolUse.input`. We surface them as
      // TEXT_MESSAGE_CONTENT deltas (raw JSON text), matching openai-base which
      // carries the structured JSON as text deltas.
      for await (const ev of stream) {
        if (!hasEmittedRunStarted) {
          hasEmittedRunStarted = true
          yield {
            type: EventType.RUN_STARTED,
            metadata: this.sourceMetadata(chatOptions.model),
            runId,
            threadId,
            model: chatOptions.model,
            timestamp: Date.now(),
            parentRunId: chatOptions.parentRunId,
          }
        }

        // Surface in-band server/throttle/validation errors instead of
        // letting them fall through and masquerade as an empty response.
        throwIfConverseStreamError(ev)

        if ('contentBlockDelta' in ev) {
          const delta = ev.contentBlockDelta?.delta
          const fragment =
            delta && 'toolUse' in delta ? delta.toolUse?.input : undefined
          if (fragment !== undefined) {
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId,
                role: 'assistant',
                model: chatOptions.model,
                timestamp: Date.now(),
              }
            }
            accumulatedRaw += fragment
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId,
              delta: fragment,
              content: accumulatedRaw,
              model: chatOptions.model,
              timestamp: Date.now(),
            }
          }
          continue
        }

        if ('messageStop' in ev) {
          const stopReason = ev.messageStop?.stopReason
          // The forced structured-output tool produces stopReason 'tool_use' on
          // success, but that's an implementation detail — a cleanly-completed
          // structured run reports 'stop', matching openai-base's contract.
          finishReason =
            stopReason === 'max_tokens'
              ? 'length'
              : stopReason === 'content_filtered'
                ? 'content_filter'
                : 'stop'
          continue
        }

        if ('metadata' in ev) {
          const u = ev.metadata?.usage
          if (u) {
            usage = buildConverseUsage(u)
          }
          continue
        }
      }

      if (!hasEmittedRunStarted) {
        hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          metadata: this.sourceMetadata(chatOptions.model),
          runId,
          threadId,
          model: chatOptions.model,
          timestamp: Date.now(),
          parentRunId: chatOptions.parentRunId,
        }
      }

      if (hasEmittedTextMessageStart) {
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId,
          model: chatOptions.model,
          timestamp: Date.now(),
        }
      }

      // Same truncation check as `structuredOutput()`: report the token limit
      // before the empty-content and parse errors (issue #1426).
      if (finishReason === 'length') {
        const message = `${this.name}.structuredOutputStream: the response was cut off because the maximum token limit was reached (stopReason=max_tokens); raise modelOptions.max_completion_tokens`
        yield {
          type: EventType.RUN_ERROR,
          metadata: this.sourceMetadata(chatOptions.model),
          runId,
          model: chatOptions.model,
          timestamp: Date.now(),
          message,
          code: 'max_tokens',
          error: { message, code: 'max_tokens' },
        }
        return
      }

      if (accumulatedRaw.length === 0) {
        yield {
          type: EventType.RUN_ERROR,
          metadata: this.sourceMetadata(chatOptions.model),
          runId,
          model: chatOptions.model,
          timestamp: Date.now(),
          message: `${this.name}.structuredOutputStream: response contained no content`,
          code: 'empty-response',
          error: {
            message: `${this.name}.structuredOutputStream: response contained no content`,
            code: 'empty-response',
          },
        }
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(accumulatedRaw)
      } catch {
        yield {
          type: EventType.RUN_ERROR,
          metadata: this.sourceMetadata(chatOptions.model),
          runId,
          model: chatOptions.model,
          timestamp: Date.now(),
          message: `Failed to parse structured output as JSON. Content: ${accumulatedRaw.slice(0, 200)}${accumulatedRaw.length > 200 ? '...' : ''}`,
          code: 'parse-error',
          error: {
            message: 'Failed to parse structured output as JSON',
            code: 'parse-error',
          },
        }
        return
      }

      yield {
        type: EventType.CUSTOM,
        name: 'structured-output.complete',
        value: {
          object: parsed,
          raw: accumulatedRaw,
        },
        model: chatOptions.model,
        timestamp: Date.now(),
      }

      yield {
        type: EventType.RUN_FINISHED,
        metadata: this.sourceMetadata(chatOptions.model),
        runId,
        threadId,
        model: chatOptions.model,
        timestamp: Date.now(),
        finishReason,
        ...(usage && { usage }),
      }
    } catch (error: unknown) {
      if (!hasEmittedRunStarted) {
        hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          metadata: this.sourceMetadata(chatOptions.model),
          runId,
          threadId,
          model: chatOptions.model,
          timestamp: Date.now(),
          parentRunId: chatOptions.parentRunId,
        }
      }
      const errorPayload = converseRunErrorPayload(
        error,
        `${this.name}.structuredOutputStream failed`,
      )
      chatOptions.logger.errors(`${this.name}.structuredOutputStream fatal`, {
        error: errorPayload,
        source: `${this.name}.structuredOutputStream`,
      })
      yield {
        type: EventType.RUN_ERROR,
        metadata: this.sourceMetadata(chatOptions.model),
        runId,
        model: chatOptions.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        ...(errorPayload.code !== undefined && { code: errorPayload.code }),
        error: {
          message: errorPayload.message,
          ...(errorPayload.code !== undefined && { code: errorPayload.code }),
        },
      }
    }
  }

  /**
   * Converse sends `tools` and a forced structured-output tool via two separate
   * mechanisms, never together. Declaring `false` makes the engine run the
   * agent loop without `outputSchema` and finalize via `structuredOutput` /
   * `structuredOutputStream`.
   */
  supportsCombinedToolsAndSchema(): boolean {
    return false
  }

  // ---------------------------------------------------------------------------
  // Request construction
  // ---------------------------------------------------------------------------

  /**
   * Translate `TextOptions` into a `ConverseCommandInput`. Shared by chatStream,
   * structuredOutput, and structuredOutputStream (the latter two override
   * `toolConfig` with the forced structured tool afterwards).
   */
  protected buildInput(
    options: TextOptions<TProviderOptions>,
  ): ConverseCommandInput {
    const { system, messages } = toConverseMessages(
      options.messages,
      options.systemPrompts,
      { model: options.model, provider: this.provider },
    )

    // Sampling options live on `modelOptions` (typed as the narrowed
    // `BedrockConverseProviderOptions`, which surfaces the OpenAI Chat
    // Completions field names); translate them into Converse's `inferenceConfig`,
    // which uses AWS-native camelCase keys.
    const modelOptions = options.modelOptions
    const temperature = modelOptions?.temperature
    const topP = modelOptions?.top_p
    // `chat({ reasoning })`: Claude's thinking fields. Budget thinking needs
    // `maxTokens` above the budget, so a smaller or missing value grows.
    const { additionalModelRequestFields, minMaxTokens } = converseThinking(
      this.model,
      options.reasoning,
      BEDROCK_MODEL_REASONING[this.model],
    )

    // `chat({ toolChoice })`. Converse has no `none` choice, so `none` sends
    // no tool config, and `chatStream` sends any tool history as text. Claude
    // rejects a forced tool while thinking is on (only Claude gets thinking
    // fields), and some Claude models reject it on every request. Then a
    // forced choice falls back to auto.
    const canForceTool =
      additionalModelRequestFields === undefined &&
      !BEDROCK_CLAUDE_NO_FORCED_TOOL_FAMILIES.some((name) =>
        this.model.includes(name),
      )
    const toolChoice =
      options.toolChoice === 'none' || canForceTool
        ? options.toolChoice
        : 'auto'
    const toolConfig = options.tools
      ? toToolConfig(convertTools(options.tools), toolChoice)
      : undefined

    const requestedMaxTokens = modelOptions?.max_completion_tokens
    const maxTokens =
      minMaxTokens !== undefined &&
      (requestedMaxTokens == null || requestedMaxTokens < minMaxTokens)
        ? minMaxTokens
        : requestedMaxTokens
    const stop = modelOptions?.stop
    const stopSequences =
      stop == null ? undefined : Array.isArray(stop) ? stop : [stop]

    const inferenceConfig =
      temperature != null ||
      topP != null ||
      maxTokens != null ||
      stopSequences != null
        ? {
            ...(temperature != null && { temperature }),
            ...(topP != null && { topP }),
            ...(maxTokens != null && { maxTokens }),
            ...(stopSequences != null && { stopSequences }),
          }
        : undefined

    const input: ConverseCommandInput = {
      modelId: this.model,
      messages,
      ...(system.length > 0 && { system }),
      ...(toolConfig && { toolConfig }),
      ...(inferenceConfig && { inferenceConfig }),
      ...(additionalModelRequestFields && { additionalModelRequestFields }),
    }
    return addPromptCachePoints(this.model, input, options.promptCache)
  }
}

/**
 * Convert TanStack `Tool[]` to the Converse tool-converter input shape. Reuses
 * the SAME `convertSchemaToJsonSchema` the other adapters use so the Converse
 * tool input schemas match what every other provider sends.
 */
/**
 * The text Bedrock models use for a context overflow. Converse has no error
 * type for it: it is a `ValidationException` like every bad request, and over
 * a stream the SDK does not keep that name. So the message is the only signal.
 * Each model family has its own text.
 */
const CONTEXT_OVERFLOW_MESSAGE =
  /Input Tokens Exceeded|maximum context length|Input is too long for requested model|prompt is too long/

/**
 * `toRunErrorPayload`, with `code` set to `CONTEXT_OVERFLOW_CODE` for a
 * context overflow. A `ThrottlingException` is never an overflow, whatever
 * its text says about tokens.
 */
function converseRunErrorPayload(
  error: unknown,
  fallbackMessage: string,
): { message: string; code: string | undefined } {
  const payload = toRunErrorPayload(error, fallbackMessage)
  const throttled =
    error instanceof Error && error.name === 'ThrottlingException'
  return !throttled && CONTEXT_OVERFLOW_MESSAGE.test(payload.message)
    ? { ...payload, code: CONTEXT_OVERFLOW_CODE }
    : payload
}

function convertTools(tools: Array<Tool>): Array<ConverseToolInput> {
  return tools.map((tool) => {
    const inputSchema: JSONSchema = convertSchemaToJsonSchema(
      tool.inputSchema,
    ) ?? { type: 'object', properties: {}, required: [] }
    const { cachePoint }: BedrockToolMetadata = tool.metadata ?? {}
    return {
      name: tool.name,
      description: tool.description,
      inputSchema,
      ...(cachePoint && { cachePoint }),
    }
  })
}

/**
 * Find the forced structured-output tool's `input` in a non-streaming Converse
 * response. SDK-boundary narrowing only — `ConverseOutput` is a tagged union
 * (`{ message }`) and a tool-use block is `{ toolUse: { input } }`.
 */
function extractStructuredToolInput(
  res: ConverseCommandOutput,
): unknown | undefined {
  const message =
    res.output && 'message' in res.output ? res.output.message : undefined
  const content: Array<ContentBlock> = message?.content ?? []
  for (const block of content) {
    if ('toolUse' in block && block.toolUse) {
      // Only accept the forced structured tool (an unnamed block is allowed,
      // since the forced tool is the only one configured). A differently-named
      // tool-use block is a hallucinated/leftover call whose arbitrary input
      // must not be returned as the validated result — leave it to the caller's
      // `throw` so the failure is accurate instead of silently wrong.
      if (
        block.toolUse.name === STRUCTURED_TOOL_NAME ||
        block.toolUse.name === undefined
      ) {
        return block.toolUse.input
      }
    }
  }
  return undefined
}

/** The parts of a Converse request that hold documents the adapter fills from user data. */
type ConverseDocuments = Pick<ConverseCommandInput, 'messages' | 'toolConfig'>

function hasProtoKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  return (
    Object.hasOwn(value, '__proto__') || Object.values(value).some(hasProtoKey)
  )
}

/**
 * The AWS SDK copies a document (tool input, tool input schema) with
 * `out[key] = value`. For an own key named `__proto__`, the assignment goes
 * to the `__proto__` setter and the key is lost. This puts each such
 * document back in the serialized body. `JSON.stringify` keeps own keys.
 */
function restoreDocuments(request: unknown, input: ConverseDocuments): void {
  const documents = [
    ...(input.messages ?? []).flatMap((message) =>
      (message.content ?? []).map((block) => block.toolUse?.input),
    ),
    ...(input.toolConfig?.tools ?? []).map(
      (tool) => tool.toolSpec?.inputSchema?.json,
    ),
  ]
  // Skip the parse and re-serialize of the body, which can be large (for
  // example with image bytes), unless a document has the key.
  if (!documents.some(hasProtoKey)) return
  if (
    typeof request !== 'object' ||
    request === null ||
    !('body' in request) ||
    typeof request.body !== 'string'
  ) {
    throw new Error(
      'Bedrock Converse: cannot keep a `__proto__` key because the request body is not a JSON string',
    )
  }
  // The SDK serialized this body from `input` one step earlier, so the two
  // line up by position.
  const body: ConverseDocuments = JSON.parse(request.body)
  body.messages?.forEach((message, i) =>
    message.content?.forEach((block, j) => {
      const source = input.messages?.[i]?.content?.[j]?.toolUse?.input
      if (block.toolUse && hasProtoKey(source)) block.toolUse.input = source
    }),
  )
  body.toolConfig?.tools?.forEach((tool, i) => {
    const source = input.toolConfig?.tools?.[i]?.toolSpec?.inputSchema?.json
    if (tool.toolSpec?.inputSchema && hasProtoKey(source))
      tool.toolSpec.inputSchema.json = source
  })
  request.body = JSON.stringify(body)
}

/**
 * Adds {@link restoreDocuments} to a command. It runs at `build` with high
 * priority, before the SDK sets Content-Length and signs the body.
 */
function addRestoreDocuments<TInput extends object, TOutput extends object>(
  command: { middlewareStack: MiddlewareStack<TInput, TOutput> },
  input: ConverseDocuments,
): void {
  command.middlewareStack.add(
    (next) => (args) => {
      restoreDocuments(args.request, input)
      return next(args)
    },
    { step: 'build', name: 'tanstackRestoreDocuments', priority: 'high' },
  )
}

/** Converse adapter with an explicit API key (low-level; mirrors createBedrockChat). */
export function createBedrockConverse<TModel extends BedrockConverseModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<BedrockConverseConfig, 'apiKey'>,
): BedrockConverseTextAdapter<TModel> {
  return new BedrockConverseTextAdapter({ ...config, apiKey }, model)
}
