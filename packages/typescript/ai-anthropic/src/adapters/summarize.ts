import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { ANTHROPIC_MODELS } from '../model-meta'
import {
  createAnthropicClient,
  generateId,
  getAnthropicApiKeyFromEnv,
} from '../utils'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type { AnthropicClientConfig } from '../utils'

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

/**
 * Anthropic Summarize Adapter
 *
 * Tree-shakeable adapter for Anthropic summarization functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class AnthropicSummarizeAdapter extends BaseSummarizeAdapter<
  typeof ANTHROPIC_MODELS,
  AnthropicSummarizeProviderOptions
> {
  readonly kind = 'summarize' as const
  readonly name = 'anthropic'
  readonly models = ANTHROPIC_MODELS

  private client: ReturnType<typeof createAnthropicClient>

  constructor(config: AnthropicSummarizeConfig) {
    super({})
    this.client = createAnthropicClient(config)
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

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
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    }
  }

  async *summarizeStream(
    options: SummarizationOptions,
  ): AsyncIterable<StreamChunk> {
    const systemPrompt = this.buildSummarizationPrompt(options)
    const id = generateId(this.name)
    const model = options.model
    let accumulatedContent = ''
    let inputTokens = 0
    let outputTokens = 0

    const stream = await this.client.messages.create({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      system: systemPrompt,
      max_tokens: options.maxLength || 500,
      temperature: 0.3,
      stream: true,
    })

    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage.input_tokens
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const delta = event.delta.text
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
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage.output_tokens
        yield {
          type: 'done',
          id,
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
 * Creates an Anthropic summarize adapter with explicit API key
 */
export function createAnthropicSummarize(
  apiKey: string,
  config?: Omit<AnthropicSummarizeConfig, 'apiKey'>,
): AnthropicSummarizeAdapter {
  return new AnthropicSummarizeAdapter({ apiKey, ...config })
}

/**
 * Creates an Anthropic summarize adapter with automatic API key detection
 */
export function anthropicSummarize(
  config?: Omit<AnthropicSummarizeConfig, 'apiKey'>,
): AnthropicSummarizeAdapter {
  const apiKey = getAnthropicApiKeyFromEnv()
  return createAnthropicSummarize(apiKey, config)
}
