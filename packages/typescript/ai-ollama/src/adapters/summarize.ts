import {
  createOllamaClient,
  estimateTokens,
  generateId,
  getOllamaHostFromEnv,
} from '../utils'

import type { Ollama } from 'ollama'
import type { SummarizeAdapter } from '@tanstack/ai/adapters'
import type { SummarizationOptions, SummarizationResult } from '@tanstack/ai'

/**
 * Ollama models suitable for summarization
 * Note: Ollama models are dynamically loaded, this is a common subset
 */
export const OllamaSummarizeModels = [
  'llama2',
  'llama3',
  'llama3.1',
  'llama3.2',
  'mistral',
  'mixtral',
  'phi',
  'phi3',
  'qwen2',
  'qwen2.5',
] as const

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
  model?: OllamaSummarizeModel
  host?: string
}

/**
 * Ollama Summarize Adapter
 * A tree-shakeable summarization adapter for Ollama
 */
export class OllamaSummarizeAdapter implements SummarizeAdapter<
  typeof OllamaSummarizeModels,
  OllamaSummarizeProviderOptions
> {
  readonly kind = 'summarize' as const
  readonly name = 'ollama' as const
  readonly models = OllamaSummarizeModels

  /** Type-only property for provider options inference */
  declare _providerOptions?: OllamaSummarizeProviderOptions

  private client: Ollama
  private defaultModel: OllamaSummarizeModel

  constructor(
    hostOrClient?: string | Ollama,
    options: OllamaSummarizeAdapterOptions = {},
  ) {
    if (typeof hostOrClient === 'string' || hostOrClient === undefined) {
      this.client = createOllamaClient({ host: hostOrClient })
    } else {
      this.client = hostOrClient
    }
    this.defaultModel = options.model ?? 'llama3'
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const model = options.model || this.defaultModel

    const prompt = this.buildSummarizationPrompt(options)

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
 * Creates an Ollama summarize adapter with explicit host
 */
export function createOllamaSummarize(
  host?: string,
  options?: OllamaSummarizeAdapterOptions,
): OllamaSummarizeAdapter {
  return new OllamaSummarizeAdapter(host, options)
}

/**
 * Creates an Ollama summarize adapter with host from environment
 */
export function ollamaSummarize(
  options?: OllamaSummarizeAdapterOptions,
): OllamaSummarizeAdapter {
  const host = getOllamaHostFromEnv()
  return new OllamaSummarizeAdapter(host, options)
}
