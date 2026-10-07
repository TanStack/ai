import { BaseEvaluateAdapter } from '@tanstack/ai/adapters'
import type { EvaluateOptions } from '@tanstack/ai/adapters'
import type { TokenUsage, WireAnswer } from '@tanstack/ai'
import { resolveOllayaTransport } from '../utils/client'
import type { OllayaClientConfig } from '../utils/client'
import type { OllayaEvaluateModel } from '../model-meta'

/** Shape of the Ollaya `POST /v1/systemone` response we depend on. */
interface OllayaEvaluateResponse {
  model: string
  answers: Record<string, WireAnswer>
  usage: { input_tokens: number; output_tokens: number }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOllayaEvaluateResponse(
  value: unknown,
): value is OllayaEvaluateResponse {
  if (!isRecord(value)) return false
  const usage = value['usage']
  const answers = value['answers']
  return (
    typeof value['model'] === 'string' &&
    isRecord(answers) &&
    isRecord(usage) &&
    typeof usage['input_tokens'] === 'number' &&
    typeof usage['output_tokens'] === 'number'
  )
}

/**
 * Ollaya evaluate adapter.
 *
 * Talks to a local Ollaya server's `POST /v1/systemone` endpoint over raw
 * `fetch` — no SDK. Ollaya serves the `laya` decision models and speaks the
 * same wire contract as TypeSafe's Jev, so the `decide()` activity maps the
 * returned wire answers to the unified public result.
 */
export class OllayaEvaluateAdapter<
  TModel extends OllayaEvaluateModel,
> extends BaseEvaluateAdapter<TModel> {
  readonly name = 'ollaya' as const

  private readonly apiKey: string | undefined
  private readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly fetchFn: typeof fetch | undefined

  constructor(config: OllayaClientConfig, model: TModel) {
    super({}, model)
    this.apiKey = config.apiKey
    const transport = resolveOllayaTransport(config)
    this.baseUrl = transport.baseUrl
    this.headers = transport.headers
    this.fetchFn = config.fetch
  }

  /**
   * POST `{ model, state, questions }` to Ollaya and return wire answers plus
   * mapped token usage. Does not invent unified `.value` fields.
   */
  async evaluate(options: EvaluateOptions) {
    const { model, state, questions, abortSignal, logger } = options
    const body = { model, state, questions }
    const fetchFn = this.fetchFn ?? globalThis.fetch

    logger.request(`activity=evaluate provider=${this.name} model=${model}`, {
      provider: this.name,
      model,
    })

    let response: Response
    try {
      response = await fetchFn(`${this.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // ponytail: local Ollaya needs no key; only send auth behind a proxy
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          ...this.headers,
        },
        body: JSON.stringify(body),
        ...(abortSignal ? { signal: abortSignal } : {}),
      })
    } catch (error) {
      logger.errors(`${this.name}.evaluate fatal`, {
        error,
        source: `${this.name}.evaluate`,
      })
      throw error
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const error = new Error(
        `Ollaya evaluate request failed: ${response.status} ${response.statusText}${
          detail ? ` — ${detail}` : ''
        }`,
      )
      logger.errors(`${this.name}.evaluate fatal`, {
        error,
        source: `${this.name}.evaluate`,
      })
      throw error
    }

    const json: unknown = await response.json()
    if (!isOllayaEvaluateResponse(json)) {
      throw new Error('Ollaya evaluate response had an unexpected shape')
    }

    const promptTokens = json.usage.input_tokens
    const completionTokens = json.usage.output_tokens
    const usage: TokenUsage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    }

    return {
      model: json.model,
      answers: json.answers,
      usage,
    }
  }
}

/**
 * Creates an Ollaya evaluate adapter.
 *
 * @example
 * ```typescript
 * import { decide, boolean } from '@tanstack/ai'
 * import { ollayaDecider } from '@tanstack/ai-ollaya'
 *
 * const result = await decide({
 *   adapter: ollayaDecider('laya:latest'),
 *   state: ticket,
 *   questions: {
 *     refund: boolean({
 *       instructions: 'Is the customer asking for a refund?',
 *     }),
 *   },
 * })
 * ```
 *
 * Talks to `http://127.0.0.1:11435` by default. Point it elsewhere with
 * `ollayaDecider('laya:latest', { baseURL: 'http://my-host:11435' })`.
 */
export function ollayaDecider<TModel extends OllayaEvaluateModel>(
  model: TModel,
  config?: OllayaClientConfig,
) {
  return new OllayaEvaluateAdapter({ ...config }, model)
}
