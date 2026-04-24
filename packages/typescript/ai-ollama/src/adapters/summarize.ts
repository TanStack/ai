import {
  createOllamaClient,
  estimateTokens,
  generateId,
  getOllamaHostFromEnv,
} from '../utils'

import type { OLLAMA_TEXT_MODELS as OllamaSummarizeModels } from '../model-meta'
import type { Ollama } from 'ollama'
import type { SummarizeAdapter } from '@tanstack/ai/adapters'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'

/** Cast an event object to StreamChunk. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

export type OllamaSummarizeModel =
  | (typeof OllamaSummarizeModels)[number]
  | (string & {})

/**
 * Ollama-specific provider options for summarization
 */
export interface OllamaSummarizeProviderOptions {
  /** Number of GPU layers to use */
  num_gpu?: number
  /** Number of threads to use */
  num_thread?: number
  /** Context window size */
  num_ctx?: number
  /** Number of tokens to predict */
  num_predict?: number
  /** Temperature for sampling */
  temperature?: number
  /** Top-p sampling */
  top_p?: number
  /** Top-k sampling */
  top_k?: number
  /** Repeat penalty */
  repeat_penalty?: number
}

export interface OllamaSummarizeAdapterOptions {
  host?: string
}

/**
 * Ollama Summarize Adapter
 * A tree-shakeable summarization adapter for Ollama
 */
export class OllamaSummarizeAdapter<
  TModel extends OllamaSummarizeModel,
> implements SummarizeAdapter<TModel, OllamaSummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'ollama' as const
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: OllamaSummarizeProviderOptions
  }

  private client: Ollama
  constructor(
    hostOrClient: string | Ollama | undefined,
    model: TModel,
    _options: OllamaSummarizeAdapterOptions = {},
  ) {
    if (typeof hostOrClient === 'string' || hostOrClient === undefined) {
      this.client = createOllamaClient({ host: hostOrClient })
    } else {
      this.client = hostOrClient
    }
    this.model = model
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const { logger } = options
    const model = options.model

    logger.request(`activity=summarize provider=ollama`, {
      provider: 'ollama',
      model,
    })

    const prompt = this.buildSummarizationPrompt(options)

    try {
      const response = await this.client.generate({
        model,
        prompt,
        options: {
          temperature: 0.3,
          num_predict: options.maxLength ?? 500,
        },
        stream: false,
      })

      const promptTokens = estimateTokens(prompt)
      const completionTokens = estimateTokens(response.response)

      return {
        id: generateId('sum'),
        model: response.model,
        summary: response.response,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      }
    } catch (error) {
      logger.errors('ollama.summarize fatal', {
        error,
        source: 'ollama.summarize',
      })
      throw error
    }
  }

  async *summarizeStream(
    options: SummarizationOptions,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    const model = options.model
    const id = generateId('sum')
    const prompt = this.buildSummarizationPrompt(options)
    let accumulatedContent = ''

    logger.request(`activity=summarize provider=ollama`, {
      provider: 'ollama',
      model,
      stream: true,
    })

    try {
      const stream = await this.client.generate({
        model,
        prompt,
        options: {
          temperature: 0.3,
          num_predict: options.maxLength ?? 500,
        },
        stream: true,
      })

      for await (const chunk of stream) {
        logger.provider(`provider=ollama`, { chunk })

        if (chunk.response) {
          accumulatedContent += chunk.response
          yield asChunk({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: id,
            model: chunk.model,
            timestamp: Date.now(),
            delta: chunk.response,
            content: accumulatedContent,
          })
        }

        if (chunk.done) {
          const promptTokens = estimateTokens(prompt)
          const completionTokens = estimateTokens(accumulatedContent)
          yield asChunk({
            type: 'RUN_FINISHED',
            runId: id,
            model: chunk.model,
            timestamp: Date.now(),
            finishReason: 'stop',
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
          })
        }
      }
    } catch (error) {
      logger.errors('ollama.summarize fatal', {
        error,
        source: 'ollama.summarize',
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
      case 'concise':
        prompt += 'Provide a very brief one or two sentence summary. '
        break
      case 'paragraph':
      default:
        prompt += 'Provide a clear and concise summary in paragraph format. '
    }

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} words. `
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on: ${options.focus.join(', ')}. `
    }

    prompt += `\n\nText to summarize:\n${options.text}\n\nSummary:`

    return prompt
  }
}

/**
 * Creates an Ollama summarize adapter with explicit host and model
 */
export function createOllamaSummarize<TModel extends OllamaSummarizeModel>(
  model: TModel,
  host?: string,
  options?: OllamaSummarizeAdapterOptions,
): OllamaSummarizeAdapter<TModel> {
  return new OllamaSummarizeAdapter(host, model, options)
}

/**
 * Creates an Ollama summarize adapter with host from environment and required model
 */
export function ollamaSummarize<TModel extends OllamaSummarizeModel>(
  model: TModel,
  options?: OllamaSummarizeAdapterOptions,
): OllamaSummarizeAdapter<TModel> {
  const host = getOllamaHostFromEnv()
  return new OllamaSummarizeAdapter(host, model, options)
}
