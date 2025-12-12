import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { GROK_CHAT_MODELS } from '../model-meta'
import { createGrokClient, getGrokApiKeyFromEnv } from '../utils'
import type { SummarizationOptions, SummarizationResult } from '@tanstack/ai'
import type { GrokClientConfig } from '../utils'

/**
 * Configuration for Grok summarize adapter
 */
export interface GrokSummarizeConfig extends GrokClientConfig {}

/**
 * Grok-specific provider options for summarization
 */
export interface GrokSummarizeProviderOptions {
  /** Temperature for response generation (0-2) */
  temperature?: number
  /** Maximum tokens in the response */
  maxTokens?: number
}

/**
 * Grok Summarize Adapter
 *
 * Tree-shakeable adapter for Grok summarization functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class GrokSummarizeAdapter extends BaseSummarizeAdapter<
  typeof GROK_CHAT_MODELS,
  GrokSummarizeProviderOptions
> {
  readonly kind = 'summarize' as const
  readonly name = 'grok' as const
  readonly models = GROK_CHAT_MODELS

  private client: ReturnType<typeof createGrokClient>

  constructor(config: GrokSummarizeConfig) {
    super({})
    this.client = createGrokClient(config)
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    const response = await this.client.chat.completions.create({
      model: options.model || 'grok-3',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: options.text },
      ],
      max_tokens: options.maxLength,
      temperature: 0.3,
      stream: false,
    })

    return {
      id: response.id,
      model: response.model,
      summary: response.choices[0]?.message.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    }
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
 * Creates a Grok summarize adapter with explicit API key
 *
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok summarize adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGrokSummarize("xai-...");
 * ```
 */
export function createGrokSummarize(
  apiKey: string,
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
): GrokSummarizeAdapter {
  return new GrokSummarizeAdapter({ apiKey, ...config })
}

/**
 * Creates a Grok summarize adapter with automatic API key detection from environment variables.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok summarize adapter instance
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokSummarize();
 *
 * await summarize({
 *   adapter,
 *   model: "grok-3",
 *   text: "Long article text..."
 * });
 * ```
 */
export function grokSummarize(
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
): GrokSummarizeAdapter {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokSummarize(apiKey, config)
}
