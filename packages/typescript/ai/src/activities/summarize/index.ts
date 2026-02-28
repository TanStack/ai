/**
 * Summarize Activity
 *
 * Generates summaries from text input.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '../../event-client.js'
import type { SummarizeAdapter } from './adapter'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'summarize' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract provider options from a SummarizeAdapter via ~types */
export type SummarizeProviderOptions<TAdapter> =
  TAdapter extends SummarizeAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the summarize activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The summarize adapter type
 * @template TStream - Whether to stream the output
 */
export interface SummarizeActivityOptions<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
> {
  /** The summarize adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The text to summarize */
  text: string
  /** Maximum length of the summary (in words or characters, provider-dependent) */
  maxLength?: number
  /** Style of summary to generate */
  style?: 'bullet-points' | 'paragraph' | 'concise'
  /** Topics or aspects to focus on in the summary */
  focus?: Array<string>
  /** Provider-specific options */
  modelOptions?: SummarizeProviderOptions<TAdapter>
  /**
   * Whether to stream the summarization result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming output.
   * When false or not provided, returns a Promise<SummarizationResult>.
   *
   * @default false
   */
  stream?: TStream
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the summarize activity.
 * - If stream is true: AsyncIterable<StreamChunk>
 * - Otherwise: Promise<SummarizationResult>
 */
export type SummarizeActivityResult<TStream extends boolean> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<SummarizationResult>

// ===========================
// Helper Functions
// ===========================

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Summarize activity - generates summaries from text.
 *
 * Supports both streaming and non-streaming modes.
 *
 * @example Basic summarization
 * ```ts
 * import { summarize } from '@tanstack/ai'
 * import { openaiSummarize } from '@tanstack/ai-openai'
 *
 * const result = await summarize({
 *   adapter: openaiSummarize('gpt-4o-mini'),
 *   text: 'Long article text here...'
 * })
 *
 * console.log(result.summary)
 * ```
 *
 * @example Summarization with style
 * ```ts
 * const result = await summarize({
 *   adapter: openaiSummarize('gpt-4o-mini'),
 *   text: 'Long article text here...',
 *   style: 'bullet-points',
 *   maxLength: 100
 * })
 * ```
 *
 * @example Focused summarization
 * ```ts
 * const result = await summarize({
 *   adapter: openaiSummarize('gpt-4o-mini'),
 *   text: 'Long technical document...',
 *   focus: ['key findings', 'methodology']
 * })
 * ```
 *
 * @example Streaming summarization
 * ```ts
 * for await (const chunk of summarize({
 *   adapter: openaiSummarize('gpt-4o-mini'),
 *   text: 'Long article text here...',
 *   stream: true
 * })) {
 *   if (chunk.type === 'content') {
 *     process.stdout.write(chunk.delta)
 *   }
 * }
 * ```
 */
export function summarize<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
>(
  options: SummarizeActivityOptions<TAdapter, TStream>,
): SummarizeActivityResult<TStream> {
  const { stream } = options

  if (stream) {
    return runStreamingSummarize(
      options as unknown as SummarizeActivityOptions<
        SummarizeAdapter<string, object>,
        true
      >,
    ) as SummarizeActivityResult<TStream>
  }

  return runSummarize(
    options as unknown as SummarizeActivityOptions<
      SummarizeAdapter<string, object>,
      false
    >,
  ) as SummarizeActivityResult<TStream>
}

/**
 * Run non-streaming summarization
 */
async function runSummarize(
  options: SummarizeActivityOptions<SummarizeAdapter<string, object>, false>,
): Promise<SummarizationResult> {
  const { adapter, text, maxLength, style, focus } = options
  const model = adapter.model
  const requestId = createId('summarize')
  const inputLength = text.length
  const startTime = Date.now()

  aiEventClient.emit('summarize:request:started', {
    requestId,
    provider: adapter.name,
    model,
    inputLength,
    timestamp: startTime,
  })

  const summarizeOptions: SummarizationOptions = {
    model,
    text,
    maxLength,
    style,
    focus,
  }

  const result = await adapter.summarize(summarizeOptions)

  const duration = Date.now() - startTime
  const outputLength = result.summary.length

  aiEventClient.emit('summarize:request:completed', {
    requestId,
    provider: adapter.name,
    model,
    inputLength,
    outputLength,
    duration,
    timestamp: Date.now(),
  })

  return result
}

/**
 * Run streaming summarization
 * Uses the adapter's native streaming if available, otherwise falls back
 * to non-streaming and yields the result as a single chunk.
 */
async function* runStreamingSummarize(
  options: SummarizeActivityOptions<SummarizeAdapter<string, object>, true>,
): AsyncIterable<StreamChunk> {
  const { adapter, text, maxLength, style, focus } = options
  const model = adapter.model

  const summarizeOptions: SummarizationOptions = {
    model,
    text,
    maxLength,
    style,
    focus,
  }

  // Use real streaming if the adapter supports it
  if (adapter.summarizeStream) {
    yield* adapter.summarizeStream(summarizeOptions)
    return
  }

  // Fall back to non-streaming and yield as a single chunk
  const result = await adapter.summarize(summarizeOptions)

  // Yield TEXT_MESSAGE_CONTENT event with the summary
  yield {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: result.id,
    model: result.model,
    timestamp: Date.now(),
    delta: result.summary,
    content: result.summary,
  }

  // Yield RUN_FINISHED event
  yield {
    type: 'RUN_FINISHED',
    runId: result.id,
    model: result.model,
    timestamp: Date.now(),
    finishReason: 'stop',
    usage: result.usage,
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the summarize() function without executing.
 */
export function createSummarizeOptions<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
>(
  options: SummarizeActivityOptions<TAdapter, TStream>,
): SummarizeActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  SummarizeAdapter,
  SummarizeAdapterConfig,
  AnySummarizeAdapter,
} from './adapter'
export { BaseSummarizeAdapter } from './adapter'
