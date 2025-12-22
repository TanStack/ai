import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { NebiusTextAdapter } from './text'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'

/**
 * Nebius models suitable for summarization
 * Note: Nebius models are dynamically available, this is a common subset
 */
export const NebiusSummarizeModels = [
  'deepseek-ai/DeepSeek-R1-0528',
  'deepseek-ai/DeepSeek-V3-0324',
  'meta-llama/Meta-Llama-3.1-70B-Instruct',
  'meta-llama/Meta-Llama-3.1-8B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
] as const

export type NebiusSummarizeModel =
  | (typeof NebiusSummarizeModels)[number]
  | (string & {})

/**
 * Nebius-specific provider options for summarization
 */
export interface NebiusSummarizeProviderOptions {
  /** Temperature for response generation (0-2) */
  temperature?: number
  /** Maximum tokens in the response */
  maxTokens?: number
}

export interface NebiusSummarizeAdapterOptions {
  apiKey?: string
  baseURL?: string
}

/**
 * Nebius Summarize Adapter
 *
 * A thin wrapper around the text adapter that adds summarization-specific prompting.
 * Delegates all API calls to the NebiusTextAdapter.
 */
export class NebiusSummarizeAdapter<
  TModel extends NebiusSummarizeModel,
> extends BaseSummarizeAdapter<TModel, NebiusSummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'nebius' as const

  private textAdapter: NebiusTextAdapter<string>

  constructor(
    config: NebiusSummarizeAdapterOptions | undefined,
    model: TModel,
  ) {
    super({}, model)
    this.textAdapter = new NebiusTextAdapter(config, model)
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    // Use the text adapter's streaming and collect the result
    let summary = ''
    let id = ''
    let model = options.model
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    for await (const chunk of this.textAdapter.chatStream({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      maxTokens: options.maxLength,
      temperature: 0.3,
    })) {
      if (chunk.type === 'content') {
        summary = chunk.content
        id = chunk.id
        model = chunk.model
      }
      if (chunk.type === 'done' && chunk.usage) {
        usage = chunk.usage
      }
    }

    return { id, model, summary, usage }
  }

  async *summarizeStream(
    options: SummarizationOptions,
  ): AsyncIterable<StreamChunk> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    // Delegate directly to the text adapter's streaming
    yield* this.textAdapter.chatStream({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      maxTokens: options.maxLength,
      temperature: 0.3,
    })
  }

  private buildSummarizationPrompt(options: SummarizationOptions): string {
    let prompt = 'You are a professional summarizer. '

    switch (options.style) {
      case 'bullet-points':
        prompt += 'Provide a summary in bullet point format. '
        break
      case 'paragraph':
        prompt += 'Provide a summary in paragraph format. '
        break
      case 'concise':
        prompt += 'Provide a very concise summary in 1-2 sentences. '
        break
      default:
        prompt += 'Provide a clear and concise summary. '
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(', ')}. `
    }

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `
    }

    return prompt
  }
}

/**
 * Creates a Nebius summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'deepseek-ai/DeepSeek-R1-0528')
 * @param apiKey - Your Nebius API key
 * @param config - Optional additional configuration
 * @returns Configured Nebius summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createNebiusSummarize('deepseek-ai/DeepSeek-R1-0528', "your-api-key");
 * ```
 */
export function createNebiusSummarize<TModel extends NebiusSummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<NebiusSummarizeAdapterOptions, 'apiKey'>,
): NebiusSummarizeAdapter<TModel> {
  return new NebiusSummarizeAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Nebius summarize adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `NEBIUS_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'deepseek-ai/DeepSeek-R1-0528')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Nebius summarize adapter instance with resolved types
 * @throws Error if NEBIUS_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses NEBIUS_API_KEY from environment
 * const adapter = nebiusSummarize('deepseek-ai/DeepSeek-R1-0528');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function nebiusSummarize<TModel extends NebiusSummarizeModel>(
  model: TModel,
  config?: Omit<NebiusSummarizeAdapterOptions, 'apiKey'>,
): NebiusSummarizeAdapter<TModel> {
  return new NebiusSummarizeAdapter(config, model)
}
