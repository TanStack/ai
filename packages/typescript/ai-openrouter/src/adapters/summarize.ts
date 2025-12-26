import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { OpenRouterTextAdapter } from './text'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type { OpenRouterConfig } from './text'

/**
 * Configuration for OpenRouter summarize adapter
 */
export interface OpenRouterSummarizeConfig extends OpenRouterConfig {}

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
  TModel extends string,
> extends BaseSummarizeAdapter<TModel, OpenRouterSummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'openrouter' as const

  private textAdapter: OpenRouterTextAdapter<TModel>

  constructor(config: OpenRouterSummarizeConfig, model: TModel) {
    super({}, model)
    this.textAdapter = new OpenRouterTextAdapter(config, model)
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
      maxTokens: options.maxLength,
      temperature: 0.3,
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

interface EnvObject {
  OPENROUTER_API_KEY?: string
}

interface WindowWithEnv {
  env?: EnvObject
}

function getEnvironment(): EnvObject | undefined {
  if (typeof globalThis !== 'undefined') {
    const win = (globalThis as { window?: WindowWithEnv }).window
    if (win?.env) {
      return win.env
    }
  }
  if (typeof process !== 'undefined') {
    return process.env as EnvObject
  }
  return undefined
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
export function createOpenRouterSummarize<TModel extends string>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenRouterSummarizeConfig, 'apiKey'>,
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
 * const adapter = openrouterSummarize('openai/gpt-4o-mini');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function openrouterSummarize<TModel extends string>(
  model: TModel,
  config?: Omit<OpenRouterSummarizeConfig, 'apiKey'>,
): OpenRouterSummarizeAdapter<TModel> {
  const env = getEnvironment()
  const key = env?.OPENROUTER_API_KEY

  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is required. Please set it in your environment variables or use createOpenRouterSummarize(model, apiKey, config) instead.',
    )
  }

  return createOpenRouterSummarize(model, key, config)
}
