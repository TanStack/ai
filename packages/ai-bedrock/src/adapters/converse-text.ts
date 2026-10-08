import { GENERATED_BEDROCK_MODELS } from '../model-catalog.generated'
import { EventType, convertSchemaToJsonSchema } from '@tanstack/ai'
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
import { addPromptCachePoints } from '../converse/prompt-cache'
import { BEDROCK_MODEL_REASONING } from '../model-reasoning'
import type { BedrockModelReasoningByName } from '../model-reasoning'
import {
  STRUCTURED_TOOL_NAME,
  buildStructuredOutputConfig,
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
import type {
  ConfigReasoning,
  JSONSchema,
  Modality,
  ModelReasoning,
  AdapterYieldChunk,
  ReasoningCapability,
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
  ResolveConverseProviderOptions,
  ResolveInputModalities,
} from '../model-meta'

/**
 * The Claude models that reject a forced tool (`any` or a named `tool`) on
 * every request, with or without thinking. A Bedrock id has the family name
 * inside it, for example `us.anthropic.claude-opus-5-5-...`.
 * ponytail: a hand list, the same as the Anthropic adapter. Move it to the
 * model catalog when the catalog script can set it.
 */
const CLAUDE_NO_FORCED_TOOL_MODELS = [
  'claude-fable-5-1',
  'claude-mythos-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
]

/** Config for the Converse adapter — same client config as the chat adapter. */
export interface BedrockConverseConfig extends BedrockClientConfig {
  /**
   * The model's reasoning data, for example `modelReasoning(record)` from a
   * `@tanstack/ai-models` record. It wins over the adapter's own table, for
   * the Claude thinking fields in `additionalModelRequestFields` and for the
   * levels `chat({ reasoning })` takes. `false`: no thinking fields go out.
   */
  reasoning?: ModelReasoning
}

/**
 * A model id: a known Converse model, or any other id, for example a
 * catalog id or an inference profile id that this package does not list.
 */
export type BedrockConverseModelId = BedrockConverseModels | (string & {})

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
  TModel extends BedrockConverseModelId,
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
  TReasoning extends ReasoningCapability = ResolveReasoning<TModel>,
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
  TReasoning
> {
  override readonly kind = 'text' as const
  override readonly name = 'bedrock-converse' as const
  override readonly api = 'bedrock-converse-stream'
  override readonly provider = 'amazon-bedrock'
  override readonly inputModalities: ReadonlyArray<Modality> =
    GENERATED_BEDROCK_MODELS.find((entry) => entry.id === this.model)
      ?.input ?? ['text']
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
    command.middlewareStack.add(
      (next) => async (args) => {
        this.restoreDocumentInputs(args.request, input)
        return next(args)
      },
      { step: 'build', name: 'tanstackDocumentInputs', priority: 'high' },
    )
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
    command.middlewareStack.add(
      (next) => async (args) => {
        this.restoreDocumentInputs(args.request, input)
        return next(args)
      },
      { step: 'build', name: 'tanstackDocumentInputs', priority: 'high' },
    )
    return client.send(command)
  }

  private restoreDocumentInputs(
    request: unknown,
    input: ConverseCommandInput,
  ): void {
    if (
      typeof request !== 'object' ||
      request === null ||
      !('body' in request) ||
      typeof request.body !== 'string'
    )
      return
    const body: unknown = JSON.parse(request.body)
    if (
      typeof body !== 'object' ||
      body === null ||
      !('messages' in body) ||
      !Array.isArray(body.messages)
    )
      return
    let changed = false
    const restore = (
      target: unknown,
      key: 'input' | 'json',
      value: unknown,
    ) => {
      if (value === undefined || typeof target !== 'object' || target === null)
        return
      const previous = key in target ? Reflect.get(target, key) : undefined
      if (
        Object.hasOwn(target, key) &&
        JSON.stringify(previous) === JSON.stringify(value)
      )
        return
      Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
      changed = true
    }
    for (const [messageIndex, message] of (input.messages ?? []).entries()) {
      const wireMessage: unknown = body.messages[messageIndex]
      if (
        typeof wireMessage !== 'object' ||
        wireMessage === null ||
        !('content' in wireMessage) ||
        !Array.isArray(wireMessage.content)
      )
        continue
      for (const [blockIndex, block] of (message.content ?? []).entries()) {
        const wireBlock: unknown = wireMessage.content[blockIndex]
        if (typeof wireBlock !== 'object' || wireBlock === null) continue
        if (block.toolUse && 'toolUse' in wireBlock)
          restore(wireBlock.toolUse, 'input', block.toolUse.input)
        if (!block.toolResult || !('toolResult' in wireBlock)) continue
        const wireResult = wireBlock.toolResult
        if (
          typeof wireResult !== 'object' ||
          wireResult === null ||
          !('content' in wireResult) ||
          !Array.isArray(wireResult.content)
        )
          continue
        for (const [resultIndex, result] of (
          block.toolResult.content ?? []
        ).entries())
          if ('json' in result)
            restore(wireResult.content[resultIndex], 'json', result.json)
      }
    }
    if (
      'toolConfig' in body &&
      typeof body.toolConfig === 'object' &&
      body.toolConfig !== null &&
      'tools' in body.toolConfig &&
      Array.isArray(body.toolConfig.tools)
    ) {
      for (const [index, tool] of (input.toolConfig?.tools ?? []).entries()) {
        if (
          !('toolSpec' in tool) ||
          !tool.toolSpec?.inputSchema ||
          !('json' in tool.toolSpec.inputSchema)
        )
          continue
        const wireTool: unknown = body.toolConfig.tools[index]
        if (
          typeof wireTool !== 'object' ||
          wireTool === null ||
          !('toolSpec' in wireTool)
        )
          continue
        const wireSpec = wireTool.toolSpec
        if (
          typeof wireSpec !== 'object' ||
          wireSpec === null ||
          !('inputSchema' in wireSpec)
        )
          continue
        restore(wireSpec.inputSchema, 'json', tool.toolSpec.inputSchema.json)
      }
    }
    if (changed) request.body = JSON.stringify(body)
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
          ? {
              ...chunk,
              metadata: {
                tanstack: {
                  source: {
                    provider: this.provider,
                    api: this.api,
                    model: options.model,
                  },
                },
              },
            }
          : chunk
      }
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
        metadata: {
          tanstack: {
            source: {
              provider: this.provider,
              api: this.api,
              model: options.model,
            },
          },
        },
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
   * Structured output. A model that takes a forced tool gets a single forced
   * tool whose input schema is the requested output schema, and its
   * `toolUse.input` is the result. A model that rejects a forced tool gets
   * Converse's native JSON schema output, and its text answer is the result.
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
      const input = this.buildInput(chatOptions, outputSchema)
      const res = await this.send(input)
      // An answer cut off at the output cap carries partial JSON or a partial
      // forced tool input, which would read like a schema failure (#1426).
      if (res.stopReason === 'max_tokens') {
        throw new Error(
          `${this.name}.structuredOutput: the response was cut off because the maximum token limit was reached (stopReason=max_tokens); raise modelOptions.max_completion_tokens`,
        )
      }
      const structured = input.outputConfig
        ? parseJsonAnswer(res, `${this.name}.structuredOutput: ${this.model}`)
        : extractStructuredToolInput(res)
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
   * Streaming structured output. Same strategy as `structuredOutput`, but
   * streamed: the JSON fragments (the forced tool's `toolUse.input`, or the
   * text of the native JSON schema output) are accumulated from the Converse
   * stream and a terminal `CUSTOM 'structured-output.complete'` event carries
   * `{ object, raw }`, mirroring openai-base's `structuredOutputStream`
   * contract exactly.
   */
  async *structuredOutputStream(
    options: StructuredOutputOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { chatOptions, outputSchema } = options
    const runId = this.generateId()
    const threadId = chatOptions.threadId ?? this.generateId()
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
      const input = this.buildInput(chatOptions, outputSchema)
      const native = input.outputConfig !== undefined
      const stream = await this.sendStream(input)

      // The forced tool streams its `input` as partial-JSON fragments inside
      // `contentBlockDelta.delta.toolUse.input`. The native output streams
      // them as `delta.text` (reasoning deltas are not part of the JSON). We
      // surface them as TEXT_MESSAGE_CONTENT deltas (raw JSON text), matching
      // openai-base which carries the structured JSON as text deltas.
      for await (const ev of stream) {
        if (!hasEmittedRunStarted) {
          hasEmittedRunStarted = true
          yield {
            type: EventType.RUN_STARTED,
            metadata: {
              tanstack: {
                source: {
                  provider: this.provider,
                  api: this.api,
                  model: chatOptions.model,
                },
              },
            },
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
          const fragment = native ? delta?.text : delta?.toolUse?.input
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
          metadata: {
            tanstack: {
              source: {
                provider: this.provider,
                api: this.api,
                model: chatOptions.model,
              },
            },
          },
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
          metadata: {
            tanstack: {
              source: {
                provider: this.provider,
                api: this.api,
                model: chatOptions.model,
              },
            },
          },
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
          metadata: {
            tanstack: {
              source: {
                provider: this.provider,
                api: this.api,
                model: chatOptions.model,
              },
            },
          },
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
        metadata: {
          tanstack: {
            source: {
              provider: this.provider,
              api: this.api,
              model: chatOptions.model,
            },
          },
        },
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
          metadata: {
            tanstack: {
              source: {
                provider: this.provider,
                api: this.api,
                model: chatOptions.model,
              },
            },
          },
          runId,
          threadId,
          model: chatOptions.model,
          timestamp: Date.now(),
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
        metadata: {
          tanstack: {
            source: {
              provider: this.provider,
              api: this.api,
              model: chatOptions.model,
            },
          },
        },
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
   * structuredOutput, and structuredOutputStream (the latter two pass the
   * `outputSchema`, which replaces the tools of `options`).
   */
  protected buildInput(
    options: TextOptions<TProviderOptions>,
    outputSchema?: JSONSchema,
  ): ConverseCommandInput {
    const { system, messages } = toConverseMessages(
      options.messages,
      options.systemPrompts,
      {
        model: options.model,
        provider: this.provider,
        inputModalities: this.inputModalities,
      },
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
      this.clientConfig.reasoning ?? BEDROCK_MODEL_REASONING[this.model],
    )

    // `chat({ toolChoice })`. Converse has no `none` choice, so `none` sends
    // no tool config. But Bedrock rejects `toolUse` or `toolResult` blocks
    // without a tool config, so with tool blocks in the history `none` sends
    // the tools with auto (the model can still call one). Claude rejects a
    // forced tool while thinking is on (only Claude gets thinking fields), and
    // some Claude models reject it on every request. Then a forced choice
    // falls back to auto.
    const canForceTool =
      additionalModelRequestFields === undefined &&
      !CLAUDE_NO_FORCED_TOOL_MODELS.some((name) => this.model.includes(name))
    const hasToolBlocks = messages.some((message) =>
      message.content?.some((block) => block.toolUse || block.toolResult),
    )
    const toolChoice =
      options.toolChoice === 'none'
        ? hasToolBlocks
          ? 'auto'
          : 'none'
        : canForceTool
          ? options.toolChoice
          : 'auto'
    // Structured output forces the `structured_output` tool. A model that
    // rejects a forced tool gets the native JSON schema output, with no tools.
    // ponytail: native output only where a forced tool fails, because not
    // every Bedrock model takes `outputConfig`. A model that takes neither
    // (for example an older Claude with thinking on) still fails. Add the
    // `structured_output` tool with auto plus an instruction if that matters.
    const toolConfig =
      outputSchema === undefined
        ? options.tools
          ? toToolConfig(convertTools(options.tools), toolChoice)
          : undefined
        : canForceTool
          ? buildStructuredToolConfig(outputSchema)
          : undefined
    const outputConfig =
      outputSchema !== undefined && !canForceTool
        ? buildStructuredOutputConfig(outputSchema)
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
      // Bedrock rejects toolUse and toolResult blocks without a tool config.
      // So a request with no tools sends its tool history as text. Only this
      // provider input changes, the transcript stays the same.
      messages:
        hasToolBlocks && !toolConfig ? toolBlocksToText(messages) : messages,
      ...(system.length > 0 && { system }),
      ...(toolConfig && { toolConfig }),
      ...(outputConfig && { outputConfig }),
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

/**
 * Parse the text answer of the native JSON schema output. A text that is not
 * JSON fails with `source` (the model name) and the text, so no unchecked
 * text becomes the structured result.
 */
function parseJsonAnswer(res: ConverseCommandOutput, source: string): unknown {
  const text = (res.output?.message?.content ?? [])
    .map((block) => block.text ?? '')
    .join('')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `${source} did not answer with JSON for the output schema. Content: ${text.slice(0, 200)}`,
    )
  }
}

/** Converse adapter with an explicit API key (low-level; mirrors createBedrockChat). */
export function createBedrockConverse<
  TModel extends BedrockConverseModelId,
  TConfig extends Omit<BedrockConverseConfig, 'apiKey'> = Omit<
    BedrockConverseConfig,
    'apiKey'
  >,
>(
  model: TModel,
  apiKey: string,
  config?: TConfig,
): BedrockConverseTextAdapter<
  TModel,
  ResolveConverseProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  ConfigReasoning<TConfig, ResolveReasoning<TModel>>
> {
  return new BedrockConverseTextAdapter({ ...config, apiKey }, model)
}
