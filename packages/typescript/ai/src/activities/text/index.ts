/**
 * Text Activity
 *
 * Handles text generation - streaming, non-streaming, and structured output.
 * This is a single-pass activity that wraps the adapter.
 * It does NOT do agentic looping or automatic tool execution.
 *
 * For agentic text generation with automatic tool execution, use
 * `experimental_agentLoop` instead.
 */

import { aiEventClient } from '../../event-client.js'
import { convertZodToJsonSchema } from '../chat/tools/zod-converter'
import type { z } from 'zod'
import type { TextAdapter } from '../chat/adapter'
import type {
  DefaultMessageMetadataByModality,
  DoneStreamChunk,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
  Tool,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'text' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract model types from a TextAdapter */
export type TextModels<TAdapter> =
  TAdapter extends TextAdapter<infer M, any, any, any, any> ? M[number] : string

/**
 * Extract model-specific provider options from a TextAdapter.
 */
export type TextProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends TextAdapter<
    any,
    infer BaseOptions,
    infer ModelOptions,
    any,
    any
  >
    ? string extends keyof ModelOptions
      ? BaseOptions
      : TModel extends keyof ModelOptions
        ? ModelOptions[TModel]
        : BaseOptions
    : object

/**
 * Extract input modalities for a specific model from a TextAdapter.
 */
export type InputModalitiesForModel<TAdapter, TModel extends string> =
  TAdapter extends TextAdapter<any, any, any, infer ModalitiesByName, any>
    ? TModel extends keyof ModalitiesByName
      ? ModalitiesByName[TModel]
      : ReadonlyArray<Modality>
    : ReadonlyArray<Modality>

/**
 * Extract message metadata types by modality from a TextAdapter.
 */
export type MessageMetadataForAdapter<TAdapter> =
  TAdapter extends TextAdapter<any, any, any, any, infer MetadataByModality>
    ? MetadataByModality
    : DefaultMessageMetadataByModality

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the text activity.
 *
 * This is a single-pass text activity. It passes tools to the adapter
 * but does NOT automatically execute them or loop.
 *
 * For agentic behavior with automatic tool execution, use `experimental_agentLoop` instead.
 *
 * @template TAdapter - The text adapter type
 * @template TModel - The model name type (inferred from adapter)
 * @template TSchema - Optional Zod schema for structured output
 * @template TStream - Whether to stream the output (default: true)
 */
export interface TextActivityOptions<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
> {
  /** The text adapter to use */
  adapter: TAdapter & { kind: typeof kind }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Conversation messages */
  messages: Array<ModelMessage>
  /** System prompts to prepend to the conversation */
  systemPrompts?: TextOptions['systemPrompts']
  /** Tools for function calling (passed to adapter but NOT auto-executed) */
  tools?: ReadonlyArray<Tool>
  /** Additional options like temperature, maxTokens, etc. */
  options?: TextOptions['options']
  /** Model-specific options */
  modelOptions?: TextProviderOptionsForModel<TAdapter, TModel>
  /** AbortController for cancellation */
  abortController?: TextOptions['abortController']
  /** Unique conversation identifier for tracking */
  conversationId?: TextOptions['conversationId']
  /**
   * Optional Zod schema for structured output.
   * When provided, returns a Promise with the parsed output matching the schema.
   */
  outputSchema?: TSchema
  /**
   * Whether to stream the text result.
   * When true (default), returns an AsyncIterable<StreamChunk> for streaming output.
   * When false, returns a Promise<string> with the collected text content.
   *
   * @default true
   */
  stream?: TStream
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the text activity.
 * - If outputSchema is provided: Promise<z.infer<TSchema>>
 * - If stream is false: Promise<string>
 * - Otherwise (stream is true, default): AsyncIterable<StreamChunk>
 */
export type TextActivityResult<
  TSchema extends z.ZodType | undefined,
  TStream extends boolean = true,
> = TSchema extends z.ZodType
  ? Promise<z.infer<TSchema>>
  : TStream extends false
    ? Promise<string>
    : AsyncIterable<StreamChunk>

// ===========================
// Simple Text Engine
// ===========================

interface SimpleTextEngineConfig<
  TAdapter extends TextAdapter<any, any, any, any, any>,
  TParams extends TextOptions<any, any> = TextOptions<any>,
> {
  adapter: TAdapter
  params: TParams
}

class SimpleTextEngine<
  TAdapter extends TextAdapter<any, any, any, any, any>,
  TParams extends TextOptions<any, any> = TextOptions<any>,
> {
  private readonly adapter: TAdapter
  private readonly params: TParams
  private readonly systemPrompts: Array<string>
  private readonly tools: ReadonlyArray<Tool>
  private readonly requestId: string
  private readonly streamId: string
  private readonly effectiveRequest?: Request | RequestInit
  private readonly effectiveSignal?: AbortSignal

  private streamStartTime = 0
  private totalChunkCount = 0
  private currentMessageId: string | null = null
  private accumulatedContent = ''
  private doneChunk: DoneStreamChunk | null = null
  private lastFinishReason: string | null = null

  constructor(config: SimpleTextEngineConfig<TAdapter, TParams>) {
    this.adapter = config.adapter
    this.params = config.params
    this.systemPrompts = config.params.systemPrompts || []
    this.tools = config.params.tools || []
    this.requestId = this.createId('text')
    this.streamId = this.createId('stream')
    this.effectiveRequest = config.params.abortController
      ? { signal: config.params.abortController.signal }
      : undefined
    this.effectiveSignal = config.params.abortController?.signal
  }

  /** Get the accumulated content after streaming completes */
  getAccumulatedContent(): string {
    return this.accumulatedContent
  }

  async *run(): AsyncGenerator<StreamChunk> {
    this.beforeRun()

    try {
      yield* this.streamModelResponse()
    } finally {
      this.afterRun()
    }
  }

  private beforeRun(): void {
    this.streamStartTime = Date.now()
    this.currentMessageId = this.createId('msg')
    const { model, options, modelOptions, conversationId } = this.params

    aiEventClient.emit('text:started', {
      requestId: this.requestId,
      streamId: this.streamId,
      model: model,
      provider: this.adapter.name,
      messageCount: this.params.messages.length,
      hasTools: this.tools.length > 0,
      streaming: true,
      timestamp: Date.now(),
      clientId: conversationId,
      toolNames: this.tools.map((t) => t.name),
      options: options as Record<string, unknown> | undefined,
      modelOptions: modelOptions as Record<string, unknown> | undefined,
    })

    aiEventClient.emit('stream:started', {
      streamId: this.streamId,
      model,
      provider: this.adapter.name,
      timestamp: Date.now(),
    })
  }

  private afterRun(): void {
    const now = Date.now()

    aiEventClient.emit('text:completed', {
      requestId: this.requestId,
      streamId: this.streamId,
      model: this.params.model,
      content: this.accumulatedContent,
      messageId: this.currentMessageId || undefined,
      finishReason: this.lastFinishReason || undefined,
      usage: this.doneChunk?.usage,
      timestamp: now,
    })

    aiEventClient.emit('stream:ended', {
      requestId: this.requestId,
      streamId: this.streamId,
      totalChunks: this.totalChunkCount,
      duration: now - this.streamStartTime,
      timestamp: now,
    })
  }

  private async *streamModelResponse(): AsyncGenerator<StreamChunk> {
    const adapterOptions = this.params.options || {}
    const modelOptions = this.params.modelOptions

    // Convert tool schemas from Zod to JSON Schema before passing to adapter
    const toolsWithJsonSchemas = this.tools.map((tool) => ({
      ...tool,
      inputSchema: tool.inputSchema
        ? convertZodToJsonSchema(tool.inputSchema)
        : undefined,
      outputSchema: tool.outputSchema
        ? convertZodToJsonSchema(tool.outputSchema)
        : undefined,
    }))

    for await (const chunk of this.adapter.chatStream({
      model: this.params.model,
      messages: this.params.messages,
      tools: toolsWithJsonSchemas.length > 0 ? toolsWithJsonSchemas : undefined,
      options: adapterOptions,
      request: this.effectiveRequest,
      modelOptions,
      systemPrompts: this.systemPrompts,
    })) {
      if (this.isAborted()) {
        break
      }

      this.totalChunkCount++
      yield chunk
      this.handleStreamChunk(chunk)
    }
  }

  private handleStreamChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'content':
        this.handleContentChunk(chunk)
        break
      case 'tool_call':
        this.handleToolCallChunk(chunk)
        break
      case 'done':
        this.handleDoneChunk(chunk)
        break
      case 'error':
        this.handleErrorChunk(chunk)
        break
      case 'thinking':
        this.handleThinkingChunk(chunk)
        break
      default:
        break
    }
  }

  private handleContentChunk(chunk: Extract<StreamChunk, { type: 'content' }>) {
    this.accumulatedContent = chunk.content
    aiEventClient.emit('stream:chunk:content', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      content: chunk.content,
      delta: chunk.delta,
      timestamp: Date.now(),
    })
  }

  private handleToolCallChunk(
    chunk: Extract<StreamChunk, { type: 'tool_call' }>,
  ): void {
    // Just emit the event - we don't execute tools in text()
    aiEventClient.emit('stream:chunk:tool-call', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCall.id,
      toolName: chunk.toolCall.function.name,
      index: chunk.index,
      arguments: chunk.toolCall.function.arguments,
      timestamp: Date.now(),
    })
  }

  private handleDoneChunk(chunk: DoneStreamChunk): void {
    this.doneChunk = chunk
    this.lastFinishReason = chunk.finishReason
    aiEventClient.emit('stream:chunk:done', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      finishReason: chunk.finishReason,
      usage: chunk.usage,
      timestamp: Date.now(),
    })

    if (chunk.usage) {
      aiEventClient.emit('usage:tokens', {
        requestId: this.requestId,
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        model: this.params.model,
        usage: chunk.usage,
        timestamp: Date.now(),
      })
    }
  }

  private handleErrorChunk(
    chunk: Extract<StreamChunk, { type: 'error' }>,
  ): void {
    aiEventClient.emit('stream:chunk:error', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      error: chunk.error.message,
      timestamp: Date.now(),
    })
  }

  private handleThinkingChunk(
    chunk: Extract<StreamChunk, { type: 'thinking' }>,
  ): void {
    aiEventClient.emit('stream:chunk:thinking', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      content: chunk.content,
      delta: chunk.delta,
      timestamp: Date.now(),
    })
  }

  private isAborted(): boolean {
    return !!this.effectiveSignal?.aborted
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

// ===========================
// Stream Helper
// ===========================

/**
 * Collect all text content from a stream into a string.
 *
 * @param stream - An AsyncIterable of StreamChunks
 * @returns Promise resolving to the accumulated text content
 *
 * @example
 * ```ts
 * const stream = text({ adapter: openaiText(), model: 'gpt-4o', messages: [...] })
 * const result = await toText(stream)
 * ```
 */
export async function toText(
  stream: AsyncIterable<StreamChunk>,
): Promise<string> {
  let content = ''
  for await (const chunk of stream) {
    if (chunk.type === 'content') {
      content = chunk.content
    }
  }
  return content
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Text activity - single-pass text generation.
 *
 * This wraps the adapter for text generation. It can:
 * - Stream text responses
 * - Return collected text (stream: false)
 * - Return structured output (outputSchema)
 * - Pass tools to the adapter (but NOT auto-execute them)
 *
 * For agentic behavior with automatic tool execution, use `experimental_agentLoop` instead.
 *
 * @example Streaming text
 * ```ts
 * import { experimental_text as text } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * for await (const chunk of text({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * })) {
 *   if (chunk.type === 'content') {
 *     console.log(chunk.delta)
 *   }
 * }
 * ```
 *
 * @example Using toText helper
 * ```ts
 * const stream = text({ adapter, model, messages })
 * const response = await toText(stream)
 * ```
 *
 * @example Non-streaming text (stream: false)
 * ```ts
 * const response = await text({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   stream: false
 * })
 * ```
 *
 * @example Structured output
 * ```ts
 * import { z } from 'zod'
 *
 * const result = await text({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Generate a person' }],
 *   outputSchema: z.object({
 *     name: z.string(),
 *     age: z.number()
 *   })
 * })
 * // result is { name: string, age: number }
 * ```
 */
export function text<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
>(
  options: TextActivityOptions<TAdapter, TModel, TSchema, TStream>,
): TextActivityResult<TSchema, TStream> {
  const { outputSchema, stream } = options

  // If outputSchema is provided, run structured output
  if (outputSchema) {
    return runStructuredOutput(
      options as unknown as TextActivityOptions<
        TextAdapter<ReadonlyArray<string>, object, any, any, any>,
        string,
        z.ZodType,
        boolean
      >,
    ) as TextActivityResult<TSchema, TStream>
  }

  // If stream is explicitly false, run non-streaming text
  if (stream === false) {
    return runNonStreamingText(
      options as unknown as TextActivityOptions<
        TextAdapter<ReadonlyArray<string>, object, any, any, any>,
        string,
        undefined,
        false
      >,
    ) as TextActivityResult<TSchema, TStream>
  }

  // Otherwise, run streaming text (default)
  return runStreamingText(
    options as unknown as TextActivityOptions<
      TextAdapter<ReadonlyArray<string>, object, any, any, any>,
      string,
      undefined,
      true
    >,
  ) as TextActivityResult<TSchema, TStream>
}

/**
 * Run streaming text (single-pass)
 */
async function* runStreamingText(
  options: TextActivityOptions<
    TextAdapter<ReadonlyArray<string>, object, any, any, any>,
    string,
    undefined,
    true
  >,
): AsyncIterable<StreamChunk> {
  const { adapter, ...textOptions } = options

  const engine = new SimpleTextEngine({
    adapter,
    params: textOptions as TextOptions<
      string,
      Record<string, any>,
      undefined,
      Record<string, any>
    >,
  })

  for await (const chunk of engine.run()) {
    yield chunk
  }
}

/**
 * Run non-streaming text - collects all content and returns as a string.
 */
function runNonStreamingText(
  options: TextActivityOptions<
    TextAdapter<ReadonlyArray<string>, object, any, any, any>,
    string,
    undefined,
    false
  >,
): Promise<string> {
  const stream = runStreamingText(
    options as unknown as TextActivityOptions<
      TextAdapter<ReadonlyArray<string>, object, any, any, any>,
      string,
      undefined,
      true
    >,
  )

  return toText(stream)
}

/**
 * Run structured output (single-pass):
 * Call adapter.structuredOutput directly with the conversation context
 */
async function runStructuredOutput<TSchema extends z.ZodType>(
  options: TextActivityOptions<
    TextAdapter<ReadonlyArray<string>, object, any, any, any>,
    string,
    TSchema,
    boolean
  >,
): Promise<z.infer<TSchema>> {
  const { adapter, outputSchema, model, ...textOptions } = options

  if (!outputSchema) {
    throw new Error('outputSchema is required for structured output')
  }

  if (!model) {
    throw new Error('Model is required for structured output')
  }

  const jsonSchema = convertZodToJsonSchema(outputSchema)
  if (!jsonSchema) {
    throw new Error('Failed to convert output schema to JSON Schema')
  }

  // Exclude tools from textOptions since they're not needed for structured output
  const { tools: _tools, ...restOptions } = textOptions

  const result = await adapter.structuredOutput({
    chatOptions: {
      ...restOptions,
      model,
      messages: options.messages,
    },
    outputSchema: jsonSchema,
  })

  const validationResult = outputSchema.safeParse(result.data)
  if (!validationResult.success) {
    throw new Error(
      `Structured output validation failed: ${validationResult.error.message}`,
    )
  }

  return validationResult.data
}

// Re-export adapter types for convenience
export type {
  TextAdapter,
  TextAdapterConfig,
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../chat/adapter'
export { BaseTextAdapter } from '../chat/adapter'
