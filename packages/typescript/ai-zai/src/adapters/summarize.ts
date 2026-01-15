import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { getZAIApiKeyFromEnv } from '../utils/client'
import { ZAITextAdapter } from './text'
import type { ZAI_CHAT_MODELS } from '../model-meta'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type { ZAITextAdapterConfig } from './text'

/**
 * Configuration for Z.AI summarize adapter
 */
export interface ZAISummarizeConfig extends ZAITextAdapterConfig {}

/**
 * Z.AI-specific provider options for summarization
 */
export interface ZAISummarizeProviderOptions {
  /** Temperature for response generation (0-1) */
  temperature?: number
  /** Maximum tokens in the response */
  maxTokens?: number
}

/** Model type for Z.AI summarization */
export type ZAISummarizeModel = (typeof ZAI_CHAT_MODELS)[number]

/**
 * Z.AI Summarize Adapter
 *
 * A thin wrapper around the text adapter that adds summarization-specific prompting.
 * Delegates all API calls to the ZAITextAdapter.
 */
export class ZAISummarizeAdapter<
  TModel extends ZAISummarizeModel,
> extends BaseSummarizeAdapter<TModel, ZAISummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'zai' as const

  private textAdapter: ZAITextAdapter<TModel>

  constructor(config: ZAISummarizeConfig, model: TModel) {
    super({}, model)
    this.textAdapter = new ZAITextAdapter(config, model)
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

    yield* this.textAdapter.chatStream({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      maxTokens: options.maxLength,
      temperature: 0.3,
    })
  }

  /**
   * Constructs a system prompt based on the summarization options.
   * Handles style, focus points, and length constraints.
   */
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
 * Creates a Z.AI summarize adapter with explicit API key.
 *
 * @param model - The model name (e.g., 'glm-4.7', 'glm-4.6')
 * @param apiKey - Your Z.AI API key
 * @param config - Optional additional configuration
 * @returns Configured Z.AI summarize adapter instance
 */
export function createZAISummarize<TModel extends ZAISummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ZAISummarizeConfig, 'apiKey'>,
): ZAISummarizeAdapter<TModel> {
  return new ZAISummarizeAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Z.AI summarize adapter with automatic API key detection from environment variables.
 *
 * Looks for `ZAI_API_KEY` in environment.
 *
 * @param model - The model name (e.g., 'glm-4.7', 'glm-4.6')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Z.AI summarize adapter instance
 */
export function zaiSummarize<TModel extends ZAISummarizeModel>(
  model: TModel,
  config?: Omit<ZAISummarizeConfig, 'apiKey'>,
): ZAISummarizeAdapter<TModel> {
  const apiKey = getZAIApiKeyFromEnv()
  return createZAISummarize(model, apiKey, config)
}
