/**
 * Text Activity
 *
 * Simple one-shot text generation without agent loop support.
 * This is a standalone implementation that directly calls the adapter.
 * For agentic workflows with tools and multi-turn execution, use agentLoop() instead.
 */

import { aiEventClient } from '../../event-client.js'
import { streamToText } from '../../stream-to-response.js'
import {
  convertSchemaToJsonSchema,
  isStandardSchema,
  parseWithStandardSchema,
} from '../chat/tools/schema-converter'
import type { AnyTextAdapter } from '../chat/adapter'
import type {
  ConstrainedModelMessage,
  InferSchemaType,
  SchemaInput,
  StreamChunk,
  TextOptions,
} from '../../types'

// ===========================
// Text Options Type
// ===========================

/**
 * Options for the text function.
 * A simplified version of chat options without tools or agent loop strategy.
 *
 * @template TAdapter - The text adapter type (created by a provider function)
 * @template TSchema - Optional Standard Schema for structured output
 * @template TStream - Whether to stream the output (default: true)
 */
export interface TextOptions_<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined = undefined,
  TStream extends boolean = true,
> {
  /** The text adapter to use (created by a provider function like openaiText('gpt-4o')) */
  adapter: TAdapter
  /** Conversation messages - content types are constrained by the adapter's input modalities */
  messages?: Array<
    ConstrainedModelMessage<{
      inputModalities: TAdapter['~types']['inputModalities']
      messageMetadataByModality: TAdapter['~types']['messageMetadataByModality']
    }>
  >
  /** System prompts to prepend to the conversation */
  systemPrompts?: TextOptions['systemPrompts']
  /** Controls the randomness of the output. Higher values make output more random. Range: [0.0, 2.0] */
  temperature?: TextOptions['temperature']
  /** Nucleus sampling parameter. The model considers tokens with topP probability mass. */
  topP?: TextOptions['topP']
  /** The maximum number of tokens to generate in the response. */
  maxTokens?: TextOptions['maxTokens']
  /** Additional metadata to attach to the request. */
  metadata?: TextOptions['metadata']
  /** Model-specific provider options (type comes from adapter) */
  modelOptions?: TAdapter['~types']['providerOptions']
  /** AbortController for cancellation */
  abortController?: TextOptions['abortController']
  /** Unique conversation identifier for tracking */
  conversationId?: TextOptions['conversationId']
  /**
   * Optional Standard Schema for structured output.
   * When provided, returns a Promise with the parsed output matching the schema.
   *
   * @example
   * ```ts
   * const result = await text({
   *   adapter: openaiText('gpt-4o'),
   *   messages: [{ role: 'user', content: 'Generate a person' }],
   *   outputSchema: z.object({ name: z.string(), age: z.number() })
   * })
   * // result is { name: string, age: number }
   * ```
   */
  outputSchema?: TSchema
  /**
   * Whether to stream the text result.
   * When true (default), returns an AsyncIterable<StreamChunk> for streaming output.
   * When false, returns a Promise<string> with the collected text content.
   *
   * Note: If outputSchema is provided, this option is ignored and the result
   * is always a Promise<InferSchemaType<TSchema>>.
   *
   * @default true
   */
  stream?: TStream
}

// ===========================
// Text Result Type
// ===========================

/**
 * Result type for the text function.
 * - If outputSchema is provided: Promise<InferSchemaType<TSchema>>
 * - If stream is false: Promise<string>
 * - Otherwise (stream is true, default): AsyncIterable<StreamChunk>
 */
export type TextResult<
  TSchema extends SchemaInput | undefined,
  TStream extends boolean = true,
> = TSchema extends SchemaInput
  ? Promise<InferSchemaType<TSchema>>
  : TStream extends false
    ? Promise<string>
    : AsyncIterable<StreamChunk>

// ===========================
// Create Options Helper
// ===========================

/**
 * Create typed options for the text() function without executing.
 * This is useful for pre-defining configurations with full type inference.
 *
 * @example
 * ```ts
 * const textOptions = createTextOptions({
 *   adapter: openaiText('gpt-4o'),
 *   temperature: 0.7,
 * })
 *
 * const stream = text({ ...textOptions, messages })
 * ```
 */
export function createTextOptions<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined = undefined,
  TStream extends boolean = true,
>(
  options: TextOptions_<TAdapter, TSchema, TStream>,
): TextOptions_<TAdapter, TSchema, TStream> {
  return options
}

// ===========================
// Helper Functions
// ===========================

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Text Function
// ===========================

/**
 * Simple one-shot text generation without agent loop support.
 *
 * Use this for straightforward text generation, chat completions, and structured output.
 * For agentic workflows that require tool execution and multi-turn loops, use `agentLoop()` instead.
 *
 * The return type depends on the options:
 * - Default (streaming): `AsyncIterable<StreamChunk>`
 * - With `stream: false`: `Promise<string>`
 * - With `outputSchema`: `Promise<InferSchemaType<TSchema>>`
 *
 * @example Streaming text generation
 * ```ts
 * import { text } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * for await (const chunk of text({
 *   adapter: openaiText('gpt-4o'),
 *   messages: [{ role: 'user', content: 'Tell me a story' }],
 * })) {
 *   if (chunk.type === 'content') {
 *     process.stdout.write(chunk.delta)
 *   }
 * }
 * ```
 *
 * @example Non-streaming text
 * ```ts
 * const response = await text({
 *   adapter: openaiText('gpt-4o'),
 *   messages: [{ role: 'user', content: 'What is 2+2?' }],
 *   stream: false,
 * })
 * console.log(response) // "4"
 * ```
 *
 * @example Structured output
 * ```ts
 * import { z } from 'zod'
 *
 * const person = await text({
 *   adapter: openaiText('gpt-4o'),
 *   messages: [{ role: 'user', content: 'Generate a fictional person' }],
 *   outputSchema: z.object({
 *     name: z.string(),
 *     age: z.number(),
 *     occupation: z.string(),
 *   }),
 * })
 * // person is { name: string, age: number, occupation: string }
 * ```
 *
 * @example With model options
 * ```ts
 * const creative = await text({
 *   adapter: openaiText('gpt-4o'),
 *   messages: [{ role: 'user', content: 'Write a poem' }],
 *   temperature: 0.9,
 *   maxTokens: 500,
 *   stream: false,
 * })
 * ```
 */
export function text<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined = undefined,
  TStream extends boolean = true,
>(
  options: TextOptions_<TAdapter, TSchema, TStream>,
): TextResult<TSchema, TStream> {
  const { outputSchema, stream } = options

  // If outputSchema is provided, run structured output
  if (outputSchema) {
    return runStructuredOutput(
      options as unknown as TextOptions_<AnyTextAdapter, SchemaInput, boolean>,
    ) as TextResult<TSchema, TStream>
  }

  // If stream is explicitly false, run non-streaming text
  if (stream === false) {
    return runNonStreamingText(
      options as unknown as TextOptions_<AnyTextAdapter, undefined, false>,
    ) as TextResult<TSchema, TStream>
  }

  // Otherwise, run streaming text (default)
  return runStreamingText(
    options as unknown as TextOptions_<AnyTextAdapter, undefined, true>,
  ) as TextResult<TSchema, TStream>
}

/**
 * Run streaming text - directly calls the adapter's chatStream method.
 * This is a simple one-shot request with no agent loop.
 */
async function* runStreamingText<TAdapter extends AnyTextAdapter>(
  options: TextOptions_<TAdapter, undefined, true>,
): AsyncIterable<StreamChunk> {
  const {
    adapter,
    messages = [],
    systemPrompts,
    temperature,
    topP,
    maxTokens,
    metadata,
    modelOptions,
    abortController,
    conversationId,
  } = options

  const model = adapter.model
  const requestId = createId('text')
  const streamId = createId('stream')
  const messageId = createId('msg')
  const streamStartTime = Date.now()
  let totalChunkCount = 0
  let accumulatedContent = ''
  let lastFinishReason: string | null | undefined
  let lastUsage:
    | { promptTokens: number; completionTokens: number; totalTokens: number }
    | undefined

  const effectiveRequest = abortController
    ? { signal: abortController.signal }
    : undefined

  // Emit start events
  const startOptions: Record<string, unknown> = {}
  if (temperature !== undefined) startOptions.temperature = temperature
  if (topP !== undefined) startOptions.topP = topP
  if (maxTokens !== undefined) startOptions.maxTokens = maxTokens
  if (metadata !== undefined) startOptions.metadata = metadata

  aiEventClient.emit('text:started', {
    requestId,
    streamId,
    model,
    provider: adapter.name,
    messageCount: messages.length,
    hasTools: false,
    streaming: true,
    timestamp: Date.now(),
    clientId: conversationId,
    toolNames: undefined,
    options: Object.keys(startOptions).length > 0 ? startOptions : undefined,
    modelOptions: modelOptions as Record<string, unknown> | undefined,
  })

  aiEventClient.emit('stream:started', {
    streamId,
    model,
    provider: adapter.name,
    timestamp: Date.now(),
  })

  try {
    for await (const chunk of adapter.chatStream({
      model,
      messages,
      tools: undefined,
      temperature,
      topP,
      maxTokens,
      metadata,
      request: effectiveRequest,
      modelOptions,
      systemPrompts,
    })) {
      if (abortController?.signal.aborted) {
        break
      }

      totalChunkCount++
      yield chunk

      // Track content and emit events
      switch (chunk.type) {
        case 'content':
          accumulatedContent = chunk.content
          aiEventClient.emit('stream:chunk:content', {
            streamId,
            messageId,
            content: chunk.content,
            delta: chunk.delta,
            timestamp: Date.now(),
          })
          break
        case 'done':
          lastFinishReason = chunk.finishReason
          lastUsage = chunk.usage
          aiEventClient.emit('stream:chunk:done', {
            streamId,
            messageId,
            finishReason: chunk.finishReason,
            usage: chunk.usage,
            timestamp: Date.now(),
          })
          if (chunk.usage) {
            aiEventClient.emit('usage:tokens', {
              requestId,
              streamId,
              messageId,
              model,
              usage: chunk.usage,
              timestamp: Date.now(),
            })
          }
          break
        case 'error':
          aiEventClient.emit('stream:chunk:error', {
            streamId,
            messageId,
            error: chunk.error.message,
            timestamp: Date.now(),
          })
          break
        case 'thinking':
          aiEventClient.emit('stream:chunk:thinking', {
            streamId,
            messageId,
            content: chunk.content,
            delta: chunk.delta,
            timestamp: Date.now(),
          })
          break
      }
    }
  } finally {
    const now = Date.now()

    aiEventClient.emit('text:completed', {
      requestId,
      streamId,
      model,
      content: accumulatedContent,
      messageId,
      finishReason: lastFinishReason ?? undefined,
      usage: lastUsage,
      timestamp: now,
    })

    aiEventClient.emit('stream:ended', {
      requestId,
      streamId,
      totalChunks: totalChunkCount,
      duration: now - streamStartTime,
      timestamp: now,
    })
  }
}

/**
 * Run non-streaming text - collects all content and returns as a string.
 */
function runNonStreamingText<TAdapter extends AnyTextAdapter>(
  options: TextOptions_<TAdapter, undefined, false>,
): Promise<string> {
  const stream = runStreamingText(
    options as unknown as TextOptions_<TAdapter, undefined, true>,
  )
  return streamToText(stream)
}

/**
 * Run structured output - calls the adapter's structuredOutput method.
 */
async function runStructuredOutput<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput,
>(
  options: TextOptions_<TAdapter, TSchema, boolean>,
): Promise<InferSchemaType<TSchema>> {
  const {
    adapter,
    messages = [],
    systemPrompts,
    temperature,
    topP,
    maxTokens,
    metadata,
    modelOptions,
    outputSchema,
  } = options

  if (!outputSchema) {
    throw new Error('outputSchema is required for structured output')
  }

  const model = adapter.model

  // Convert the schema to JSON Schema before passing to the adapter
  const jsonSchema = convertSchemaToJsonSchema(outputSchema)
  if (!jsonSchema) {
    throw new Error('Failed to convert output schema to JSON Schema')
  }

  // Call the adapter's structured output method
  const result = await adapter.structuredOutput({
    chatOptions: {
      model,
      messages,
      systemPrompts,
      temperature,
      topP,
      maxTokens,
      metadata,
      modelOptions,
    },
    outputSchema: jsonSchema,
  })

  // Validate the result against the schema if it's a Standard Schema
  if (isStandardSchema(outputSchema)) {
    return parseWithStandardSchema<InferSchemaType<TSchema>>(
      outputSchema,
      result.data,
    )
  }

  // For plain JSON Schema, return the data as-is
  return result.data as InferSchemaType<TSchema>
}
