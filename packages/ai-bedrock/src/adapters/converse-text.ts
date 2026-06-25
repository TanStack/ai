import { EventType, convertSchemaToJsonSchema } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { resolveBedrockAuth } from '../utils/auth'
import { toConverseMessages } from '../converse/message-converter'
import { toToolConfig } from '../converse/tool-converter'
import { processConverseStream } from '../converse/stream-processor'
import {
  STRUCTURED_TOOL_NAME,
  buildStructuredToolConfig,
} from '../converse/structured-output'
import type { ConverseToolInput } from '../converse/tool-converter'
import type * as BedrockRuntime from '@aws-sdk/client-bedrock-runtime'
import type {
  BedrockRuntimeClient,
  ContentBlock,
  ConverseCommandInput,
  ConverseCommandOutput,
  ConverseStreamCommandInput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'
import type {
  JSONSchema,
  Modality,
  StreamChunk,
  TextOptions,
  Tool,
} from '@tanstack/ai'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { BedrockClientConfig } from '../utils/client'
import type { BedrockMessageMetadataByModality } from '../message-types'
import type {
  BedrockConverseModels,
  ResolveInputModalities,
  ResolveProviderOptions,
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
 * `processConverseStream` (per C3); this adapter only owns the catch/`RUN_ERROR`
 * path, mirroring openai-base's `chatStream`.
 *
 * The actual SDK calls live behind two protected seams (`sendStream` / `send`)
 * so tests can subclass and inject canned Converse SDK shapes without a real
 * AWS request.
 */
export class BedrockConverseTextAdapter<
  TModel extends BedrockConverseModels,
  // Constraint mirrors the chat adapter (text.ts): the base parameterises
  // `TProviderOptions extends Record<string, unknown>`, but our default
  // `ResolveProviderOptions<TModel>` resolves to an interface lacking an
  // implicit index signature. `Record<string, any>` is the only constraint
  // that accepts that interface AND satisfies the base. Confined to the
  // generic constraint — no value `as` cast is introduced.
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  BedrockMessageMetadataByModality
> {
  override readonly kind = 'text' as const
  override readonly name = 'bedrock-converse' as const
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
        const endpoint = this.clientConfig.baseURL
        // The installed @aws-sdk/client-bedrock-runtime (v3.1057) exposes a
        // first-class `token: TokenIdentity | TokenIdentityProvider` config
        // field (HttpAuthSchemeInputConfig) for Bedrock API-key bearer auth —
        // no custom requestHandler/middleware needed. SigV4 uses the credential
        // provider.
        if (resolved.kind === 'bearer') {
          return new BedrockRuntimeClient({
            region,
            token: { token: resolved.token },
            ...(endpoint ? { endpoint } : {}),
          })
        }
        return new BedrockRuntimeClient({
          region: resolved.region,
          credentials: resolved.credentials,
          ...(endpoint ? { endpoint } : {}),
        })
      })()
    }
    return this.clientPromise
  }

  // ---------------------------------------------------------------------------
  // SDK seams (overridden in tests so no real AWS call happens)
  // ---------------------------------------------------------------------------

  protected async sendStream(
    input: ConverseStreamCommandInput,
  ): Promise<AsyncIterable<ConverseStreamOutput>> {
    const { ConverseStreamCommand } = await this.importBedrockRuntime()
    const client = await this.getClient()
    const res = await client.send(new ConverseStreamCommand(input))
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
    return client.send(new ConverseCommand(input))
  }

  // ---------------------------------------------------------------------------
  // Public adapter surface
  // ---------------------------------------------------------------------------

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    try {
      options.logger.request(
        `activity=chat provider=${this.name} model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: this.name, model: this.model },
      )
      const input = this.buildInput(options)
      const stream = await this.sendStream(input)
      yield* processConverseStream(stream, () => this.generateId())
    } catch (error: unknown) {
      const errorPayload = toRunErrorPayload(
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
      const input: ConverseCommandInput = {
        ...this.buildInput(chatOptions),
        toolConfig: buildStructuredToolConfig(outputSchema),
      }
      const res = await this.send(input)
      const structured = extractStructuredToolInput(res)
      if (structured === undefined) {
        throw new Error(
          `${this.name}.structuredOutput: response contained no forced-tool output`,
        )
      }
      return {
        data: structured,
        rawText: JSON.stringify(structured),
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
  ): AsyncIterable<StreamChunk> {
    const { chatOptions, outputSchema } = options
    const timestamp = Date.now()
    const runId = this.generateId()
    const threadId = chatOptions.threadId ?? this.generateId()
    const messageId = this.generateId()

    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false
    let accumulatedRaw = ''
    let finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' =
      'stop'

    try {
      chatOptions.logger.request(
        `activity=structuredOutputStream provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      const input: ConverseStreamCommandInput = {
        ...this.buildInput(chatOptions),
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
            runId,
            threadId,
            model: chatOptions.model,
            timestamp,
            parentRunId: chatOptions.parentRunId,
          }
        }

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
                timestamp,
              }
            }
            accumulatedRaw += fragment
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId,
              delta: fragment,
              content: accumulatedRaw,
              model: chatOptions.model,
              timestamp,
            }
          }
          continue
        }

        if ('messageStop' in ev) {
          const stopReason = ev.messageStop?.stopReason
          finishReason =
            stopReason === 'max_tokens'
              ? 'length'
              : stopReason === 'content_filtered'
                ? 'content_filter'
                : 'tool_calls'
          continue
        }
      }

      if (!hasEmittedRunStarted) {
        hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          model: chatOptions.model,
          timestamp,
          parentRunId: chatOptions.parentRunId,
        }
      }

      if (hasEmittedTextMessageStart) {
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId,
          model: chatOptions.model,
          timestamp,
        }
      }

      if (accumulatedRaw.length === 0) {
        yield {
          type: EventType.RUN_ERROR,
          runId,
          model: chatOptions.model,
          timestamp,
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
          runId,
          model: chatOptions.model,
          timestamp,
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
        timestamp,
      }

      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model: chatOptions.model,
        timestamp,
        finishReason,
      }
    } catch (error: unknown) {
      if (!hasEmittedRunStarted) {
        hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          model: chatOptions.model,
          timestamp,
          parentRunId: chatOptions.parentRunId,
        }
      }
      const errorPayload = toRunErrorPayload(
        error,
        `${this.name}.structuredOutputStream failed`,
      )
      chatOptions.logger.errors(`${this.name}.structuredOutputStream fatal`, {
        error: errorPayload,
        source: `${this.name}.structuredOutputStream`,
      })
      yield {
        type: EventType.RUN_ERROR,
        runId,
        model: chatOptions.model,
        timestamp,
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
    )

    const toolConfig = options.tools
      ? toToolConfig(convertTools(options.tools), 'auto')
      : undefined

    // Sampling options live on `modelOptions` (Bedrock surfaces the OpenAI
    // Chat Completions field names); translate them into Converse's
    // `inferenceConfig`, which uses AWS-native camelCase keys.
    const modelOptions = options.modelOptions
    const temperature = modelOptions?.temperature
    const topP = modelOptions?.top_p
    const maxTokens = modelOptions?.max_completion_tokens

    const inferenceConfig =
      temperature != null || topP != null || maxTokens != null
        ? {
            ...(temperature != null && { temperature }),
            ...(topP != null && { topP }),
            ...(maxTokens != null && { maxTokens }),
          }
        : undefined

    return {
      modelId: this.model,
      messages,
      ...(system.length > 0 && { system }),
      ...(toolConfig && { toolConfig }),
      ...(inferenceConfig && { inferenceConfig }),
    }
  }
}

/**
 * Convert TanStack `Tool[]` to the Converse tool-converter input shape. Reuses
 * the SAME `convertSchemaToJsonSchema` the other adapters use so the Converse
 * tool input schemas match what every other provider sends.
 */
function convertTools(tools: Array<Tool>): Array<ConverseToolInput> {
  return tools.map((tool) => {
    const inputSchema: JSONSchema = convertSchemaToJsonSchema(
      tool.inputSchema,
    ) ?? { type: 'object', properties: {}, required: [] }
    return {
      name: tool.name,
      description: tool.description,
      inputSchema,
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
      // Prefer the forced tool by name, but fall back to any toolUse block so a
      // provider that omits/renames the tool name still yields its structured
      // input rather than failing loud on a name mismatch.
      if (
        block.toolUse.name === STRUCTURED_TOOL_NAME ||
        block.toolUse.name === undefined
      ) {
        return block.toolUse.input
      }
    }
  }
  // Second pass: accept the first toolUse block regardless of name.
  for (const block of content) {
    if ('toolUse' in block && block.toolUse) {
      return block.toolUse.input
    }
  }
  return undefined
}

/** Converse adapter with an explicit API key (low-level; mirrors createBedrockChat). */
export function createBedrockConverse<TModel extends BedrockConverseModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<BedrockConverseConfig, 'apiKey'>,
): BedrockConverseTextAdapter<TModel> {
  return new BedrockConverseTextAdapter({ ...config, apiKey }, model)
}
