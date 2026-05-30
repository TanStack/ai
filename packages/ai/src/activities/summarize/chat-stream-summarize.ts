import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from '../error-payload'
import { BaseSummarizeAdapter } from './adapter'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  TextOptions,
} from '../../types'

/**
 * Minimal contract for a text adapter that supports `chatStream`. Lets
 * `ChatStreamSummarizeAdapter` work with any text adapter without coupling
 * to a specific implementation.
 *
 * The provider-options shape is intentionally `any` here — the wrapper only
 * forwards `modelOptions` straight through, so a text adapter with a richer
 * per-model options type (e.g. `ResolveProviderOptions<TModel>`) is still
 * acceptable. Summarize-level type safety is enforced via
 * `SummarizationOptions<TProviderOptions>` on the wrapper itself.
 */
export interface ChatStreamCapable {
  chatStream: (options: TextOptions<any>) => AsyncIterable<StreamChunk>
}

/**
 * Provider-native max-output-tokens key per text-adapter `name`. summarize is
 * provider-agnostic and forwards `modelOptions` opaquely to the wrapped text
 * adapter, so `maxLength` must be written under the exact key the underlying
 * provider reads — no adapter reads a generic `maxTokens`. A value of `null`
 * marks a nested shape (handled specially below for Ollama).
 *
 * Keep in sync with each adapter's wire mapping:
 * - OpenAI (Responses): `max_output_tokens`
 * - Anthropic / Grok: `max_tokens`
 * - Groq: `max_completion_tokens`
 * - Gemini: `maxOutputTokens`
 * - OpenRouter: `maxCompletionTokens`
 * - Ollama: nested `options.num_predict`
 */
const MAX_TOKENS_KEY_BY_ADAPTER: Record<string, string> = {
  openai: 'max_output_tokens',
  anthropic: 'max_tokens',
  grok: 'max_tokens',
  groq: 'max_completion_tokens',
  gemini: 'maxOutputTokens',
  openrouter: 'maxCompletionTokens',
}

/**
 * Every flat key any supported provider uses to cap output tokens, plus the
 * camelCase variants. Used to detect a caller-supplied token limit so the
 * summarize default never overrides an explicit caller value.
 */
const KNOWN_MAX_TOKENS_KEYS = [
  'max_output_tokens',
  'max_tokens',
  'max_completion_tokens',
  'maxOutputTokens',
  'maxCompletionTokens',
  'maxTokens',
] as const

/**
 * Resolve `maxLength` to the provider-native max-output-tokens key for the
 * given text-adapter `name` and merge it into a working copy of the caller's
 * `modelOptions`. The caller always wins: if they already set any recognised
 * token-limit key (flat or, for Ollama, nested `options.num_predict`), the
 * default is left untouched. Unknown/unrecognised adapter names fall back to
 * NOT setting a token key (the prompt hint still asks the model to stay under
 * `maxLength`) rather than writing a dead key no provider reads.
 */
function applyMaxLength(
  adapterName: string,
  maxLength: number,
  modelOptions: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...modelOptions }

  if (adapterName === 'ollama') {
    const existing =
      merged.options && typeof merged.options === 'object'
        ? (merged.options as Record<string, unknown>)
        : undefined
    if (existing && typeof existing.num_predict === 'number') return merged
    merged.options = { num_predict: maxLength, ...existing }
    return merged
  }

  const key = MAX_TOKENS_KEY_BY_ADAPTER[adapterName]
  if (key === undefined) return merged

  const callerSetLimit = KNOWN_MAX_TOKENS_KEYS.some(
    (k) => typeof merged[k] === 'number',
  )
  if (callerSetLimit) return merged

  merged[key] = maxLength
  return merged
}

/**
 * Extract the per-model `modelOptions` type a text adapter accepts. Used by
 * provider summarize factories so their `modelOptions` IntelliSense matches
 * what the underlying text adapter actually understands.
 */
export type InferTextProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P }
}
  ? P extends object
    ? P
    : object
  : object

/**
 * Summarize adapter that wraps any `ChatStreamCapable` text adapter and
 * prompts it for summarization. Not tied to any wire format.
 */
export class ChatStreamSummarizeAdapter<
  TModel extends string,
  TProviderOptions extends object = Record<string, unknown>,
> extends BaseSummarizeAdapter<TModel, TProviderOptions> {
  readonly name: string

  private readonly textAdapter: ChatStreamCapable

  constructor(
    textAdapter: ChatStreamCapable,
    model: TModel,
    name: string = 'chat-stream-summarize',
  ) {
    super({}, model)
    this.name = name
    this.textAdapter = textAdapter
  }

  async summarize(
    options: SummarizationOptions<TProviderOptions>,
  ): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    let summary = ''
    const id = this.generateId()
    let model = options.model
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    options.logger.request(
      `activity=summarize provider=${this.name} model=${options.model} text-length=${options.text.length} maxLength=${options.maxLength ?? 'unset'}`,
      { provider: this.name, model: options.model },
    )

    try {
      for await (const chunk of this.textAdapter.chatStream(
        this.buildTextOptions(options, systemPrompt),
      )) {
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

  override async *summarizeStream(
    options: SummarizationOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    options.logger.request(
      `activity=summarizeStream provider=${this.name} model=${options.model} text-length=${options.text.length} maxLength=${options.maxLength ?? 'unset'}`,
      { provider: this.name, model: options.model },
    )

    const id = this.generateId()
    let summary = ''
    let model = options.model
    let usage: SummarizationResult['usage'] = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }

    try {
      for await (const chunk of this.textAdapter.chatStream(
        this.buildTextOptions(options, systemPrompt),
      )) {
        // Accumulate the same way `summarize()` does so consumers see deltas
        // AND the terminal `generation:result` event below carries the same
        // final summary that non-streaming returns.
        if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
          if (chunk.content) {
            summary = chunk.content
          } else if (chunk.delta) {
            summary += chunk.delta
          }
          if (chunk.model) model = chunk.model
        }

        // Emit the GenerationClient-shaped result event just before the
        // terminal RUN_FINISHED so subscribers (useSummarize) populate
        // `result` before flipping `status` to success.
        if (chunk.type === 'RUN_FINISHED') {
          if (chunk.usage) usage = chunk.usage
          if (chunk.model) model = chunk.model
          yield {
            type: EventType.CUSTOM,
            name: 'generation:result',
            value: { id, model, summary, usage } satisfies SummarizationResult,
            model,
            timestamp: Date.now(),
          }
        }

        yield chunk
      }
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.summarizeStream fatal`, {
        error: toRunErrorPayload(error, `${this.name}.summarizeStream failed`),
        source: `${this.name}.summarizeStream`,
      })
      throw error
    }
  }

  /**
   * Build the TextOptions passed to the underlying chatStream. Provider
   * `modelOptions` from the summarize call are forwarded as-is so knobs like
   * Anthropic cache headers, Gemini safety settings, or Ollama tuning params
   * still reach the wire layer.
   */
  protected buildTextOptions(
    options: SummarizationOptions<TProviderOptions>,
    systemPrompt: string,
  ): TextOptions<TProviderOptions> {
    // Sampling knobs now live in provider-native `modelOptions`. Apply the
    // low-temperature default underneath any caller-supplied `modelOptions` so
    // callers can still override it.
    let working: Record<string, unknown> = {
      temperature: 0.3,
      ...(options.modelOptions as Record<string, unknown> | undefined),
    }
    // `maxLength` must reach the wire under the wrapped adapter's provider-
    // native token key (it differs per provider, and no adapter reads a
    // generic `maxTokens`). Resolve it from the text adapter's `name`, never
    // overriding a caller-supplied token limit.
    if (options.maxLength !== undefined) {
      working = applyMaxLength(this.name, options.maxLength, working)
    }
    const modelOptions = working as TProviderOptions

    return {
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      modelOptions,
      logger: options.logger,
    }
  }

  protected buildSummarizationPrompt(
    options: SummarizationOptions<TProviderOptions>,
  ): string {
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
      case undefined:
        prompt += 'Provide a clear and concise summary. '
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
