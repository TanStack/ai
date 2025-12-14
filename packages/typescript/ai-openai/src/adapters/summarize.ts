import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { OPENAI_CHAT_MODELS } from '../model-meta'
import {
  createOpenAIClient,
  generateId,
  getOpenAIApiKeyFromEnv,
} from '../utils'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type { OpenAIClientConfig } from '../utils'

/**
 * Configuration for OpenAI summarize adapter
 */
export interface OpenAISummarizeConfig extends OpenAIClientConfig {}

/**
 * OpenAI-specific provider options for summarization
 */
export interface OpenAISummarizeProviderOptions {
  /** Temperature for response generation (0-2) */
  temperature?: number
  /** Maximum tokens in the response */
  maxTokens?: number
}

/**
 * OpenAI Summarize Adapter
 *
 * Tree-shakeable adapter for OpenAI summarization functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class OpenAISummarizeAdapter extends BaseSummarizeAdapter<
  typeof OPENAI_CHAT_MODELS,
  OpenAISummarizeProviderOptions
> {
  readonly kind = 'summarize' as const
  readonly name = 'openai' as const
  readonly models = OPENAI_CHAT_MODELS

  private client: ReturnType<typeof createOpenAIClient>

  constructor(config: OpenAISummarizeConfig) {
    super({})
    this.client = createOpenAIClient(config)
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    const response = await this.client.chat.completions.create({
      model: options.model || 'gpt-3.5-turbo',
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

  async *summarizeStream(
    options: SummarizationOptions,
  ): AsyncIterable<StreamChunk> {
    const systemPrompt = this.buildSummarizationPrompt(options)
    const id = generateId(this.name)
    const model = options.model || 'gpt-3.5-turbo'
    let accumulatedContent = ''

    const stream = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: options.text },
      ],
      max_tokens: options.maxLength,
      temperature: 0.3,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta.content || ''

      if (delta) {
        accumulatedContent += delta
        yield {
          type: 'content',
          id,
          model,
          timestamp: Date.now(),
          delta,
          content: accumulatedContent,
          role: 'assistant',
        }
      }

      // Check for finish reason and usage (comes in the last chunk)
      if (chunk.choices[0]?.finish_reason) {
        yield {
          type: 'done',
          id,
          model,
          timestamp: Date.now(),
          finishReason: chunk.choices[0].finish_reason as
            | 'stop'
            | 'length'
            | 'content_filter'
            | null,
          usage: chunk.usage
            ? {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              }
            : undefined,
        }
      }
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
 * Creates an OpenAI summarize adapter with explicit API key
 *
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI summarize adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiSummarize("sk-...");
 * ```
 */
export function createOpenaiSummarize(
  apiKey: string,
  config?: Omit<OpenAISummarizeConfig, 'apiKey'>,
): OpenAISummarizeAdapter {
  return new OpenAISummarizeAdapter({ apiKey, ...config })
}

/**
 * Creates an OpenAI summarize adapter with automatic API key detection from environment variables.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI summarize adapter instance
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiSummarize();
 *
 * await generate({
 *   adapter,
 *   model: "gpt-4",
 *   text: "Long article text..."
 * });
 * ```
 */
export function openaiSummarize(
  config?: Omit<OpenAISummarizeConfig, 'apiKey'>,
): OpenAISummarizeAdapter {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiSummarize(apiKey, config)
}
