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

export interface ZAISummarizeConfig extends ZAITextAdapterConfig {}

export interface ZAISummarizeProviderOptions {
  temperature?: number
  maxTokens?: number
}

export type ZAISummarizeModel = (typeof ZAI_CHAT_MODELS)[number]

/**
 * Z.AI Summarize Adapter
 *
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
    const { logger } = options
    const systemPrompt = this.buildSummarizationPrompt(options)

    logger.request(`activity=summarize provider=zai`, {
      provider: 'zai',
      model: options.model,
    })

    let summary = ''
    const id = ''
    let model = options.model
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    try {
      for await (const chunk of this.textAdapter.chatStream({
        model: options.model,
        messages: [{ role: 'user', content: options.text }],
        systemPrompts: [systemPrompt],
        maxTokens: options.maxLength,
        temperature: 0.3,
        logger,
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
      }
    } catch (error) {
      logger.errors('zai.summarize fatal', {
        error,
        source: 'zai.summarize',
      })
      throw error
    }

    return { id, model, summary, usage }
  }

  async *summarizeStream(
    options: SummarizationOptions,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    const systemPrompt = this.buildSummarizationPrompt(options)

    logger.request(`activity=summarize provider=zai`, {
      provider: 'zai',
      model: options.model,
      stream: true,
    })

    try {
      yield* this.textAdapter.chatStream({
        model: options.model,
        messages: [{ role: 'user', content: options.text }],
        systemPrompts: [systemPrompt],
        maxTokens: options.maxLength,
        temperature: 0.3,
        logger,
      })
    } catch (error) {
      logger.errors('zai.summarize fatal', {
        error,
        source: 'zai.summarize',
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

export function createZAISummarize<TModel extends ZAISummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ZAISummarizeConfig, 'apiKey'>,
): ZAISummarizeAdapter<TModel> {
  return new ZAISummarizeAdapter({ apiKey, ...config }, model)
}

export function zaiSummarize<TModel extends ZAISummarizeModel>(
  model: TModel,
  config?: Omit<ZAISummarizeConfig, 'apiKey'>,
): ZAISummarizeAdapter<TModel> {
  const apiKey = getZAIApiKeyFromEnv()
  return createZAISummarize(model, apiKey, config)
}
