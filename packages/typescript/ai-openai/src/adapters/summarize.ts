import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import { OpenAITextAdapter } from './text'
import type { OpenAIChatModel } from '../model-meta'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type { OpenAIClientConfig } from '../utils/client'

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
 * A thin wrapper around the text adapter that adds summarization-specific prompting.
 * Delegates all API calls to the OpenAITextAdapter.
 */
export class OpenAISummarizeAdapter<
  TModel extends OpenAIChatModel,
> extends BaseSummarizeAdapter<TModel, OpenAISummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'openai' as const

  private textAdapter: OpenAITextAdapter<TModel>

  constructor(config: OpenAISummarizeConfig, model: TModel) {
    super({}, model)
    this.textAdapter = new OpenAITextAdapter(config, model)
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    // Use the text adapter's streaming and collect the result
    let summary = ''
    const id = ''
    let model = options.model
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    for await (const chunk of this.textAdapter.chatStream({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      maxTokens: options.maxLength,
      temperature: 0.3,
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
 * Creates an OpenAI summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'gpt-4o-mini', 'gpt-4o')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiSummarize('gpt-4o-mini', "sk-...");
 * ```
 */
export function createOpenaiSummarize<TModel extends OpenAIChatModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAISummarizeConfig, 'apiKey'>,
): OpenAISummarizeAdapter<TModel> {
  return new OpenAISummarizeAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI summarize adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'gpt-4o-mini', 'gpt-4o')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI summarize adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiSummarize('gpt-4o-mini');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function openaiSummarize<TModel extends OpenAIChatModel>(
  model: TModel,
  config?: Omit<OpenAISummarizeConfig, 'apiKey'>,
): OpenAISummarizeAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiSummarize(model, apiKey, config)
}
