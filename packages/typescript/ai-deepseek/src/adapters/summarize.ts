import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { getDeepSeekApiKeyFromEnv } from '../utils'
import { DeepSeekTextAdapter } from './text'
import type { DEEPSEEK_CHAT_MODELS } from '../model-meta'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type { DeepSeekClientConfig } from '../utils'

/**
 * Configuration for DeepSeek summarize adapter
 */
export interface DeepSeekSummarizeConfig extends DeepSeekClientConfig {}

/**
 * DeepSeek-specific provider options for summarization
 */
export interface DeepSeekSummarizeProviderOptions {
  /** Temperature for response generation (0-2) */
  temperature?: number
  /** Maximum tokens in the response */
  maxTokens?: number
}

/** Model type for DeepSeek summarization */
export type DeepSeekSummarizeModel = (typeof DEEPSEEK_CHAT_MODELS)[number]

/**
 * DeepSeek Summarize Adapter
 *
 * A thin wrapper around the text adapter that adds summarization-specific prompting.
 * Delegates all API calls to the DeepSeekTextAdapter.
 */
export class DeepSeekSummarizeAdapter<
  TModel extends DeepSeekSummarizeModel,
> extends BaseSummarizeAdapter<TModel, DeepSeekSummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'deepseek' as const

  private textAdapter: DeepSeekTextAdapter<TModel>

  constructor(config: DeepSeekSummarizeConfig, model: TModel) {
    super({}, model)
    this.textAdapter = new DeepSeekTextAdapter(config, model)
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
 * Creates a DeepSeek summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'deepseek-chat', 'deepseek-reasoner')
 * @param apiKey - Your DeepSeek API key
 * @param config - Optional additional configuration
 * @returns Configured DeepSeek summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createDeepSeekSummarize('deepseek-chat', "sk-...");
 * ```
 */
export function createDeepSeekSummarize<TModel extends DeepSeekSummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<DeepSeekSummarizeConfig, 'apiKey'>,
): DeepSeekSummarizeAdapter<TModel> {
  return new DeepSeekSummarizeAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a DeepSeek summarize adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `DEEPSEEK_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'deepseek-chat', 'deepseek-reasoner')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured DeepSeek summarize adapter instance with resolved types
 * @throws Error if DEEPSEEK_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses DEEPSEEK_API_KEY from environment
 * const adapter = deepseekSummarize('deepseek-chat');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function deepseekSummarize<TModel extends DeepSeekSummarizeModel>(
  model: TModel,
  config?: Omit<DeepSeekSummarizeConfig, 'apiKey'>,
): DeepSeekSummarizeAdapter<TModel> {
  const apiKey = getDeepSeekApiKeyFromEnv()
  return createDeepSeekSummarize(model, apiKey, config)
}
