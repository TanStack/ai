import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from '../error-payload'
import { MAX_TOKENS_KEYS } from '../../utilities/sampling-keys'
import { rebuildTokenUsage } from '../../utilities/ag-ui-usage'
import type { AdapterYieldChunk } from '../../utilities/adapter-yield-chunk'
import { tanstackMetadata } from '../../utilities/merge-metadata'
import { normalizeStreamChunk } from '../../utilities/normalize-stream-chunk'
import { BaseSummarizeAdapter } from './adapter'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  TextOptions,
  TokenUsage,
} from '../../types'

function consumeSpecSummarizeChunk(
  chunk: StreamChunk,
  state: { summary: string; model: string; usage: TokenUsage },
): void {
  if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
    if (chunk.delta) state.summary += chunk.delta
    return
  }

  const tanstack = tanstackMetadata(chunk)
  if (
    (chunk.type === EventType.RUN_STARTED ||
      chunk.type === EventType.RUN_FINISHED ||
      chunk.type === EventType.TEXT_MESSAGE_START) &&
    typeof tanstack?.model === 'string'
  ) {
    state.model = tanstack.model
  }

  if (chunk.type === EventType.RUN_FINISHED) {
    const rebuilt = rebuildTokenUsage(chunk.usage, tanstack?.usage)
    if (rebuilt) state.usage = rebuilt
  }
}

function throwRunError(
  chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
): never {
  const message =
    typeof chunk.message === 'string' && chunk.message.length > 0
      ? chunk.message
      : 'Summarization failed'
  const err = new Error(message)
  if (typeof chunk.code === 'string') {
    ;(err as Error & { code?: string }).code = chunk.code
  }
  throw err
}

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
  chatStream: (options: TextOptions<any>) => AsyncIterable<AdapterYieldChunk>
}

/**
 * Provider-native max-output-tokens key per summarize-adapter `name`. summarize
 * is provider-agnostic and forwards `modelOptions` opaquely to the wrapped text
 * adapter, so `maxLength` must be written under the exact key the underlying
 * provider reads — no adapter reads a generic `maxTokens`. Ollama is the one
 * exception: it nests sampling under `options`, so it has no entry here and is
 * handled as a special nested case in `applyMaxLength`/`applyDefaultTemperature`.
 *
 * Keep in sync with each adapter's wire mapping:
 * - OpenAI (Responses): `max_output_tokens`
 * - Anthropic / Grok: `max_tokens`
 * - Groq: `max_completion_tokens`
 * - Gemini: `maxOutputTokens`
 * - OpenRouter: `maxCompletionTokens`
 * - LLM Gateway: `max_tokens`
 * - Ollama: nested `options.num_predict` (no entry — see `applyMaxLength`)
 */
const MAX_TOKENS_KEY_BY_ADAPTER: Record<string, string> = {
  openai: 'max_output_tokens',
  anthropic: 'max_tokens',
  grok: 'max_tokens',
  groq: 'max_completion_tokens',
  gemini: 'maxOutputTokens',
  openrouter: 'maxCompletionTokens',
  // LLM Gateway exposes an OpenAI-compatible Chat Completions surface whose
  // only output cap is `max_tokens` — it does not read `max_completion_tokens`.
  llmgateway: 'max_tokens',
}

/**
 * Every flat key any supported provider uses to cap output tokens (plus the
 * generic `maxTokens` spelling no adapter reads). Used to detect a
 * caller-supplied token limit so the summarize default never overrides an
 * explicit caller value. Shared with the OTel middleware via
 * `MAX_TOKENS_KEYS` so the two spelling sets cannot drift.
 */
const KNOWN_MAX_TOKENS_KEYS = MAX_TOKENS_KEYS

/**
 * Whether `applyMaxLength` knows how to place a token limit for this adapter
 * `name` (either the nested Ollama shape or a flat provider-native key).
 * Used to surface a warning when `maxLength` would otherwise be silently
 * dropped for an unrecognised adapter name.
 */
function isKnownMaxTokensAdapter(adapterName: string): boolean {
  return (
    adapterName === 'ollama' ||
    MAX_TOKENS_KEY_BY_ADAPTER[adapterName] !== undefined
  )
}

/**
 * Apply the low-temperature summarize default to a working copy of the
 * caller's `modelOptions`, placed where the wrapped provider actually reads
 * it (nested under `options` for Ollama, flat otherwise). The caller always
 * wins: if they already set `temperature` in that location, it is untouched.
 */
function applyDefaultTemperature(
  adapterName: string,
  temperature: number,
  modelOptions: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...modelOptions }

  if (adapterName === 'ollama') {
    const existing =
      merged.options && typeof merged.options === 'object'
        ? (merged.options as Record<string, unknown>)
        : undefined
    const alreadyHasTemperature = existing && 'temperature' in existing
    if (alreadyHasTemperature) return merged
    merged.options = { temperature, ...existing }
    return merged
  }

  if ('temperature' in merged) return merged
  merged.temperature = temperature
  return merged
}

/**
 * Resolve `maxLength` to the provider-native max-output-tokens key for the
 * given summarize-adapter `name` (this wrapper's OWN `name`, not the wrapped
 * text adapter's) and merge it into a working copy of the caller's
 * `modelOptions`. The caller always wins: if they already set any recognised
 * token-limit key (flat or, for Ollama, nested `options.num_predict`), the
 * default is left untouched. Unknown/unrecognised adapter names fall back to
 * NOT setting a token key (the prompt hint still asks the model to stay under
 * `maxLength`) rather than writing a dead key no provider reads.
 *
 * Caveat (intentional): "caller wins" keys off ANY recognised spelling in
 * `KNOWN_MAX_TOKENS_KEYS`, but only the adapter's native key is read on the
 * wire. So a caller who sets a NON-native spelling for this provider — e.g.
 * `maxTokens`, or Anthropic's `max_tokens` against an OpenAI adapter — suppresses
 * the summarize default WITHOUT getting their own value applied either: neither
 * cap reaches the wire. This favours never clobbering a migration leftover over
 * guaranteeing a cap; the prompt-level hint still asks the model to stay under
 * `maxLength`. Rename the key to the provider-native spelling to forward it.
 */
function applyMaxLength(
  adapterName: string,
  maxLength: number,
  modelOptions: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...modelOptions }

  if (adapterName === 'ollama') {
    // Honor a caller-set limit in either shape: a recognised flat key (e.g.
    // left over from a migration) or the nested `options.num_predict`.
    const callerSetFlatLimit = KNOWN_MAX_TOKENS_KEYS.some(
      (k) => typeof merged[k] === 'number',
    )
    const existing =
      merged.options && typeof merged.options === 'object'
        ? (merged.options as Record<string, unknown>)
        : undefined
    const hasCallerTokenLimit =
      callerSetFlatLimit ||
      (existing && typeof existing.num_predict === 'number')
    if (hasCallerTokenLimit) {
      return merged
    }
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

    const id = this.generateId()
    const state = {
      summary: '',
      model: options.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }

    options.logger.request(
      `activity=summarize provider=${this.name} model=${options.model} text-length=${options.text.length} maxLength=${options.maxLength ?? 'unset'}`,
      { provider: this.name, model: options.model },
    )

    try {
      const stream = this.textAdapter.chatStream(
        this.buildTextOptions(options, systemPrompt),
      )
      for await (const raw of stream) {
        const chunks = normalizeStreamChunk(raw as AdapterYieldChunk)
        for (const chunk of chunks) {
          if (chunk.type === EventType.RUN_ERROR) throwRunError(chunk)
          consumeSpecSummarizeChunk(chunk, state)
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

    return {
      id,
      model: state.model,
      summary: state.summary,
      usage: state.usage,
    }
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
    const state = {
      summary: '',
      model: options.model,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      } satisfies SummarizationResult['usage'],
    }

    try {
      const stream = this.textAdapter.chatStream(
        this.buildTextOptions(options, systemPrompt),
      )
      for await (const raw of stream) {
        const chunks = normalizeStreamChunk(raw as AdapterYieldChunk)
        for (const chunk of chunks) {
          consumeSpecSummarizeChunk(chunk, state)

          if (chunk.type === EventType.RUN_FINISHED) {
            yield {
              type: EventType.CUSTOM,
              name: 'generation:result',
              value: {
                id,
                model: state.model,
                summary: state.summary,
                usage: state.usage,
              } satisfies SummarizationResult,
              timestamp: Date.now(),
            }
          }

          yield chunk
        }
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
    let working: Record<string, unknown> = {
      ...(options.modelOptions as Record<string, unknown> | undefined),
    }
    working = applyDefaultTemperature(this.name, 0.3, working)
    if (options.maxLength !== undefined) {
      if (!isKnownMaxTokensAdapter(this.name)) {
        options.logger.warn(
          `summarize: maxLength=${options.maxLength} could not be mapped to a provider token key for adapter name "${this.name}" — it was dropped from modelOptions (the prompt still asks the model to stay under it). Construct ChatStreamSummarizeAdapter with a recognised provider name to forward the cap.`,
          { provider: this.name },
        )
      }
      working = applyMaxLength(this.name, options.maxLength, working)
    }
    const modelOptions = working as TProviderOptions

    return {
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      modelOptions,
      logger: options.logger,
      ...(options.runId !== undefined ? { runId: options.runId } : {}),
      ...(options.threadId !== undefined ? { threadId: options.threadId } : {}),
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
