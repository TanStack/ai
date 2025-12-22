/**
 * Text Activity (Experimental)
 *
 * Simple text generation without tool support.
 * For agentic workflows with tools, use agentLoop instead.
 */

import { chat } from '../chat/index'
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
// Text Function
// ===========================

/**
 * Simple text generation without tool support.
 *
 * Use this for straightforward text generation, chat completions, and structured output.
 * For agentic workflows that require tool execution, use `agentLoop` instead.
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
  // Delegate to chat without tools or agent loop strategy
  return chat({
    ...options,
    tools: undefined,
    agentLoopStrategy: undefined,
  }) as TextResult<TSchema, TStream>
}
