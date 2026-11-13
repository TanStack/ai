import { buildBaseUsage } from '@tanstack/ai'
import { BaseEvaluateAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { getGeminiApiKeyFromEnv } from '../utils'
import type { EvaluateOptions, WireAnswer } from '@tanstack/ai/adapters'
import type {
  GeminiEvaluateModel,
  GeminiEvaluateProviderOptions,
} from '../evaluate/evaluate-provider-options'

/** Default Gemini base URL, matching the chat/image adapters. */
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/'

/** Gemini Decisions API path, appended to the base URL. */
const DECISIONS_PATH = 'v1beta/decisions'

export interface GeminiEvaluateConfig {
  /** Gemini API key. Falls back to `GOOGLE_API_KEY` / `GEMINI_API_KEY`. */
  apiKey: string
  /**
   * Base URL for the request. Wins over the `GOOGLE_GEMINI_BASE_URL` env var
   * and the default. Same option name as the other Gemini adapters.
   */
  baseURL?: string
  /** Extra headers sent with the request. */
  defaultHeaders?: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false
  for (const item of Object.values(value)) {
    if (typeof item !== 'number') return false
  }
  return true
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false
  for (const item of Object.values(value)) {
    if (typeof item !== 'string') return false
  }
  return true
}

function isWireAnswer(value: unknown): value is WireAnswer {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'choice':
      return (
        typeof value.choice === 'string' &&
        typeof value.confidence === 'number' &&
        isNumberRecord(value.probabilities)
      )
    case 'score':
      return (
        typeof value.score === 'number' &&
        typeof value.confidence === 'number' &&
        isStringRecord(value.legend) &&
        isNumberRecord(value.probabilities)
      )
    case 'noul':
      return typeof value.noul === 'number'
    default:
      return false
  }
}

function isAnswers(value: unknown): value is Record<string, WireAnswer> {
  if (!isRecord(value)) return false
  for (const answer of Object.values(value)) {
    if (!isWireAnswer(answer)) return false
  }
  return true
}

function isDecisionsResponse(value: unknown): value is {
  model?: string
  answers: Record<string, WireAnswer>
  usage?: unknown
  id?: unknown
} {
  if (!isRecord(value)) return false
  if (!isAnswers(value.answers)) return false
  if (value.model !== undefined && typeof value.model !== 'string') return false
  return true
}

function readNumber(record: Record<string, unknown>, keys: Array<string>) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number') return value
  }
  return undefined
}

/**
 * Maps the Decisions API `usage` block to the unified `TokenUsage`. The
 * endpoint reports `total_input_tokens` / `total_output_tokens` (output is
 * always 0 today) and `total_tokens`.
 */
function mapUsage(usage: unknown) {
  if (!isRecord(usage)) {
    return buildBaseUsage({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    })
  }
  const promptTokens =
    readNumber(usage, [
      'total_input_tokens',
      'input_tokens',
      'prompt_tokens',
    ]) ?? 0
  const completionTokens =
    readNumber(usage, [
      'total_output_tokens',
      'output_tokens',
      'completion_tokens',
    ]) ?? 0
  const totalTokens =
    readNumber(usage, ['total_tokens']) ?? promptTokens + completionTokens
  return buildBaseUsage({ promptTokens, completionTokens, totalTokens })
}

/**
 * Gemini evaluate adapter.
 *
 * Asks typed questions about a shared `state` through Gemini's
 * `/v1beta/decisions` endpoint. A decision model is not a chat model: it
 * returns TypeSafe wire answers, and `decide()` maps those to the public
 * shape. The endpoint takes `input`, so the adapter forwards `state` there.
 * @see https://aistudio.google.com/docs/decisions-api
 */
export class GeminiEvaluateAdapter<
  TModel extends GeminiEvaluateModel,
> extends BaseEvaluateAdapter<TModel, GeminiEvaluateProviderOptions> {
  readonly name = 'gemini' as const

  private readonly clientConfig: GeminiEvaluateConfig

  constructor(config: GeminiEvaluateConfig, model: TModel) {
    super({}, model)
    this.clientConfig = config
  }

  private url(): string {
    const base =
      this.clientConfig.baseURL ??
      (typeof process === 'undefined'
        ? undefined
        : process.env.GOOGLE_GEMINI_BASE_URL?.trim() || undefined) ??
      DEFAULT_BASE_URL
    return `${base.replace(/\/+$/, '')}/${DECISIONS_PATH}`
  }

  async evaluate(options: EvaluateOptions<GeminiEvaluateProviderOptions>) {
    const { model, state, questions, abortSignal, logger } = options
    const questionKeys = Object.keys(questions)

    logger.request(
      `activity=evaluate provider=${this.name} model=${model} questions=${questionKeys.length}`,
      { provider: this.name, model },
    )

    try {
      const response = await fetch(this.url(), {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.clientConfig.apiKey,
          'Content-Type': 'application/json',
          ...this.clientConfig.defaultHeaders,
        },
        body: JSON.stringify({ model, input: state, questions }),
        ...(abortSignal ? { signal: abortSignal } : {}),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw Object.assign(
          new Error(
            `Gemini evaluate request failed: ${response.status} ${response.statusText}${
              detail ? ` — ${detail}` : ''
            }`,
          ),
          { status: response.status },
        )
      }

      const json: unknown = await response.json()
      if (!isDecisionsResponse(json)) {
        throw new Error('Gemini evaluate returned an unexpected response')
      }

      return {
        model: json.model ?? model,
        answers: json.answers,
        usage: mapUsage(json.usage),
        ...(typeof json.id === 'string' && { id: json.id }),
      }
    } catch (error) {
      logger.errors(`${this.name}.evaluate fatal`, {
        error: toRunErrorPayload(error, `${this.name}.evaluate failed`),
        source: `${this.name}.evaluate`,
      })
      throw error
    }
  }
}

/**
 * Creates a Gemini evaluate adapter with an explicit API key.
 *
 * A Gemini decision model answers typed questions about `state`. It does not
 * generate chat text.
 *
 * @param model Gemini decision model id, for example `'gemini-decision-1'`.
 * @param apiKey Gemini API key.
 * @param config Optional `baseURL` and `defaultHeaders`.
 *
 * @example
 * ```typescript
 * const adapter = createGeminiDecider('gemini-decision-1', 'AIza...')
 * ```
 */
export function createGeminiDecider<TModel extends GeminiEvaluateModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiEvaluateConfig, 'apiKey'>,
) {
  return new GeminiEvaluateAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Gemini evaluate adapter, reading `GOOGLE_API_KEY` /
 * `GEMINI_API_KEY` from the environment.
 *
 * @param model Gemini decision model id, for example `'gemini-decision-1'`.
 * @param config Optional `baseURL` and `defaultHeaders`.
 *
 * @example
 * ```typescript
 * import { decide, choice } from '@tanstack/ai'
 * import { geminiDecider } from '@tanstack/ai-gemini'
 *
 * const result = await decide({
 *   adapter: geminiDecider('gemini-decision-1'),
 *   state: ticket,
 *   questions: {
 *     queue: choice({
 *       instructions: 'Which team should handle this ticket?',
 *       options: {
 *         billing: 'Payments, invoices, refunds',
 *         tech: 'Bugs, outages, integrations',
 *       },
 *     }),
 *   },
 * })
 * ```
 */
export function geminiDecider<TModel extends GeminiEvaluateModel>(
  model: TModel,
  config?: Omit<GeminiEvaluateConfig, 'apiKey'>,
) {
  return createGeminiDecider(model, getGeminiApiKeyFromEnv(), config)
}
