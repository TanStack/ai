import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import {
  createAnthropicClient,
  generateId,
  getAnthropicApiKeyFromEnv,
} from '../utils'
import type { ANTHROPIC_MODELS } from '../model-meta'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type { AnthropicClientConfig } from '../utils'

/** Cast an event object to StreamChunk. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

/**
 * Configuration for Anthropic summarize adapter
 */
export interface AnthropicSummarizeConfig extends AnthropicClientConfig {}

/**
 * Anthropic-specific provider options for summarization
 */
export interface AnthropicSummarizeProviderOptions {
  /** Temperature for response generation (0-1) */
  temperature?: number
  /** Maximum tokens in the response */
  maxTokens?: number
}

/** Model type for Anthropic summarization */
export type AnthropicSummarizeModel = (typeof ANTHROPIC_MODELS)[number]

/**
 * Anthropic Summarize Adapter
 *
 * Tree-shakeable adapter for Anthropic summarization functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class AnthropicSummarizeAdapter<
  TModel extends AnthropicSummarizeModel,
> extends BaseSummarizeAdapter<TModel, AnthropicSummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'anthropic' as const

  private client: ReturnType<typeof createAnthropicClient>

  constructor(config: AnthropicSummarizeConfig, model: TModel) {
    super({}, model)
    this.client = createAnthropicClient(config)
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const { logger } = options
    const systemPrompt = this.buildSummarizationPrompt(options)

    logger.request(`activity=summarize provider=anthropic`, {
      provider: 'anthropic',
      model: options.model,
    })

    try {
      const response = await this.client.messages.create({
        model: options.model,
        messages: [{ role: 'user', content: options.text }],
        system: systemPrompt,
        max_tokens: options.maxLength || 500,
        temperature: 0.3,
        stream: false,
      })

      const content = response.content
        .map((c) => (c.type === 'text' ? c.text : ''))
        .join('')

      return {
        id: response.id,
        model: response.model,
        summary: content,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
        },
      }
    } catch (error) {
      logger.errors('anthropic.summarize fatal', {
        error,
        source: 'anthropic.summarize',
      })
      throw error
    }
  }

  async *summarizeStream(
    options: SummarizationOptions,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    const systemPrompt = this.buildSummarizationPrompt(options)
    const id = generateId(this.name)
    const model = options.model
    let accumulatedContent = ''
    let inputTokens = 0
    let outputTokens = 0

    logger.request(`activity=summarize provider=anthropic`, {
      provider: 'anthropic',
      model,
      stream: true,
    })

    try {
      const stream = await this.client.messages.create({
        model: options.model,
        messages: [{ role: 'user', content: options.text }],
        system: systemPrompt,
        max_tokens: options.maxLength || 500,
        temperature: 0.3,
        stream: true,
      })

      for await (const event of stream) {
        logger.provider(`provider=anthropic type=${event.type}`, {
          chunk: event,
        })

        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const delta = event.delta.text
            accumulatedContent += delta
            yield asChunk({
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: id,
              model,
              timestamp: Date.now(),
              delta,
              content: accumulatedContent,
            })
          }
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens
          yield asChunk({
            type: 'RUN_FINISHED',
            runId: id,
            model,
            timestamp: Date.now(),
            finishReason: event.delta.stop_reason as
              | 'stop'
              | 'length'
              | 'content_filter'
              | null,
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          })
        }
      }
    } catch (error) {
      logger.errors('anthropic.summarize fatal', {
        error,
        source: 'anthropic.summarize',
      })
      throw error
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
 * Creates an Anthropic summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'claude-sonnet-4-5', 'claude-3-5-haiku-latest')
 * @param apiKey - Your Anthropic API key
 * @param config - Optional additional configuration
 * @returns Configured Anthropic summarize adapter instance with resolved types
 */
export function createAnthropicSummarize<
  TModel extends AnthropicSummarizeModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<AnthropicSummarizeConfig, 'apiKey'>,
): AnthropicSummarizeAdapter<TModel> {
  return new AnthropicSummarizeAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an Anthropic summarize adapter with automatic API key detection.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'claude-sonnet-4-5', 'claude-3-5-haiku-latest')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Anthropic summarize adapter instance with resolved types
 */
export function anthropicSummarize<TModel extends AnthropicSummarizeModel>(
  model: TModel,
  config?: Omit<AnthropicSummarizeConfig, 'apiKey'>,
): AnthropicSummarizeAdapter<TModel> {
  const apiKey = getAnthropicApiKeyFromEnv()
  return createAnthropicSummarize(model, apiKey, config)
}
