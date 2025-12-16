import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { OPENAI_CHAT_MODELS } from '../model-meta'
import { getOpenAIApiKeyFromEnv } from '../utils'
import { OpenAITextAdapter } from './text'
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
 * A thin wrapper around the text adapter that adds summarization-specific prompting.
 * Delegates all API calls to the OpenAITextAdapter.
 */
export class OpenAISummarizeAdapter extends BaseSummarizeAdapter<
  typeof OPENAI_CHAT_MODELS,
  OpenAISummarizeProviderOptions
> {
  readonly kind = 'summarize' as const
  readonly name = 'openai' as const
  readonly models = OPENAI_CHAT_MODELS

  private textAdapter: OpenAITextAdapter

  constructor(config: OpenAISummarizeConfig) {
    super({})
    this.textAdapter = new OpenAITextAdapter(config)
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
      options: {
        maxTokens: options.maxLength,
        temperature: 0.3,
      },
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

    // Delegate directly to the text adapter's streaming
    yield* this.textAdapter.chatStream({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      options: {
        maxTokens: options.maxLength,
        temperature: 0.3,
      },
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
 * await summarize({
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
