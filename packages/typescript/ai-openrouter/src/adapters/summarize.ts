import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import { OpenRouterTextAdapter } from './text'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type { OpenRouterConfig } from './text'
import type { OPENROUTER_CHAT_MODELS } from '../model-meta'
import type { SDKOptions } from '@openrouter/sdk'

export type OpenRouterTextModels = (typeof OPENROUTER_CHAT_MODELS)[number]

/**
 * Configuration for OpenRouter summarize adapter
 */
export interface OpenRouterSummarizeConfig extends OpenRouterConfig {
  /** Default temperature for summarization (0-2). Defaults to 0.3. */
  temperature?: number
  /** Default maximum tokens in the response */
  maxTokens?: number
}

/**
 * OpenRouter-specific provider options for summarization
 */
export interface OpenRouterSummarizeProviderOptions {
  /** Temperature for response generation (0-2) */
  temperature?: number
  /** Maximum tokens in the response */
  maxTokens?: number
}

/**
 * OpenRouter Summarize Adapter
 *
 * A thin wrapper around the text adapter that adds summarization-specific prompting.
 * Delegates all API calls to the OpenRouterTextAdapter.
 */
export class OpenRouterSummarizeAdapter<
  TModel extends OpenRouterTextModels,
> extends BaseSummarizeAdapter<TModel, OpenRouterSummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'openrouter' as const

  private textAdapter: OpenRouterTextAdapter<TModel>
  private temperature: number
  private maxTokens: number | undefined

  constructor(config: OpenRouterSummarizeConfig, model: TModel) {
    super({}, model)
    this.textAdapter = new OpenRouterTextAdapter(config, model)
    this.temperature = config.temperature ?? 0.3
    this.maxTokens = config.maxTokens
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    let summary = ''
    const id = ''
    let model = options.model
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    for await (const chunk of this.textAdapter.chatStream({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      maxTokens: this.maxTokens ?? options.maxLength,
      temperature: this.temperature,
    })) {
      // AG-UI TEXT_MESSAGE_CONTENT event
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        if (chunk.content) {
          summary = chunk.content
        } else {
          summary += chunk.delta
        }
        model = chunk.model || model
      }
      // AG-UI RUN_FINISHED event
      if (chunk.type === 'RUN_FINISHED') {
        if (chunk.usage) {
          usage = chunk.usage
        }
      }
      // AG-UI RUN_ERROR event
      if (chunk.type === 'RUN_ERROR') {
        throw new Error(`Error during summarization: ${chunk.error.message}`)
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
      maxTokens: this.maxTokens ?? options.maxLength,
      temperature: this.temperature,
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
 * Creates an OpenRouter summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'openai/gpt-4o-mini', 'anthropic/claude-3-5-sonnet')
 * @param apiKey - Your OpenRouter API key
 * @param config - Optional additional configuration
 * @returns Configured OpenRouter summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenRouterSummarize('openai/gpt-4o-mini', "sk-or-...");
 * ```
 */
export function createOpenRouterSummarize<TModel extends OpenRouterTextModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterSummarizeAdapter<TModel> {
  return new OpenRouterSummarizeAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenRouter summarize adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENROUTER_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'openai/gpt-4o-mini', 'anthropic/claude-3-5-sonnet')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenRouter summarize adapter instance with resolved types
 * @throws Error if OPENROUTER_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENROUTER_API_KEY from environment
 * const adapter = openRouterSummarize('openai/gpt-4o-mini');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function openRouterSummarize<TModel extends OpenRouterTextModels>(
  model: TModel,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterSummarizeAdapter<TModel> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterSummarize(model, apiKey, config)
}
