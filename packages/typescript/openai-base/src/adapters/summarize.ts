import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  TextOptions,
} from '@tanstack/ai'

/**
 * Minimal interface for a text adapter that supports chatStream.
 * This allows the summarize adapter to work with any OpenAI-compatible
 * text adapter without tight coupling to a specific implementation.
 */
export interface ChatStreamCapable<TProviderOptions extends object> {
  chatStream: (
    options: TextOptions<TProviderOptions>,
  ) => AsyncIterable<StreamChunk>
}

/**
 * OpenAI-Compatible Summarize Adapter
 *
 * A thin wrapper around a text adapter that adds summarization-specific prompting.
 * Delegates all API calls to the provided text adapter.
 *
 * Subclasses or instantiators provide a text adapter (or factory) at construction
 * time, allowing any OpenAI-compatible provider to get summarization for free by
 * reusing its text adapter.
 */
export class OpenAICompatibleSummarizeAdapter<
  TModel extends string,
  TProviderOptions extends object = Record<string, any>,
> extends BaseSummarizeAdapter<TModel, TProviderOptions> {
  readonly name: string

  private textAdapter: ChatStreamCapable<TProviderOptions>

  constructor(
    textAdapter: ChatStreamCapable<TProviderOptions>,
    model: TModel,
    name: string = 'openai-compatible',
  ) {
    super({}, model)
    this.name = name
    this.textAdapter = textAdapter
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    let summary = ''
    const id = generateId(this.name)
    let model = options.model
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    options.logger.request(
      `activity=summarize provider=${this.name} model=${options.model} text-length=${options.text.length} maxLength=${options.maxLength ?? 'unset'}`,
      { provider: this.name, model: options.model },
    )

    try {
      for await (const chunk of this.textAdapter.chatStream({
        model: options.model,
        messages: [{ role: 'user', content: options.text }],
        systemPrompts: [systemPrompt],
        maxTokens: options.maxLength,
        temperature: 0.3,
        logger: options.logger,
      } satisfies TextOptions<TProviderOptions>)) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
          if (chunk.content) {
            summary = chunk.content
          } else if (chunk.delta) {
            // Append delta only when present — a content-less chunk with no
            // delta would otherwise concat literal `'undefined'`.
            summary += chunk.delta
          }
          model = chunk.model || model
        }
        if (chunk.type === 'RUN_FINISHED') {
          if (chunk.usage) {
            usage = chunk.usage
          }
        }
        // Surface failures: the underlying chatStream emits RUN_ERROR instead
        // of throwing, so without this branch summarize() would return an
        // empty summary and pretend a failed run succeeded.
        if (chunk.type === 'RUN_ERROR') {
          const message =
            (chunk.error && typeof chunk.error.message === 'string'
              ? chunk.error.message
              : null) ?? 'Summarization failed'
          const code =
            chunk.error && typeof chunk.error.code === 'string'
              ? chunk.error.code
              : undefined
          const err = new Error(message)
          if (code) {
            ;(err as Error & { code?: string }).code = code
          }
          throw err
        }
      }
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      options.logger.errors(`${this.name}.summarize fatal`, {
        error: toRunErrorPayload(error, `${this.name}.summarize failed`),
        source: `${this.name}.summarize`,
      })
      throw error
    }

    return { id, model, summary, usage }
  }

  async *summarizeStream(
    options: SummarizationOptions,
  ): AsyncIterable<StreamChunk> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    options.logger.request(
      `activity=summarizeStream provider=${this.name} model=${options.model} text-length=${options.text.length} maxLength=${options.maxLength ?? 'unset'}`,
      { provider: this.name, model: options.model },
    )

    try {
      yield* this.textAdapter.chatStream({
        model: options.model,
        messages: [{ role: 'user', content: options.text }],
        systemPrompts: [systemPrompt],
        maxTokens: options.maxLength,
        temperature: 0.3,
        logger: options.logger,
      } satisfies TextOptions<TProviderOptions>)
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.summarizeStream fatal`, {
        error: toRunErrorPayload(error, `${this.name}.summarizeStream failed`),
        source: `${this.name}.summarizeStream`,
      })
      throw error
    }
  }

  protected buildSummarizationPrompt(options: SummarizationOptions): string {
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
