import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
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
    const id = ''
    let model = options.model
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    for await (const chunk of this.textAdapter.chatStream({
      model: options.model as TModel,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      maxTokens: options.maxLength,
      temperature: 0.3,
      logger: options.logger,
    } as TextOptions<TProviderOptions>)) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        if (chunk.content) {
          summary = chunk.content
        } else {
          summary += chunk.delta
        }
        model = chunk.model || model
      }
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

    yield* this.textAdapter.chatStream({
      model: options.model as TModel,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      maxTokens: options.maxLength,
      temperature: 0.3,
      logger: options.logger,
    } as TextOptions<TProviderOptions>)
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
