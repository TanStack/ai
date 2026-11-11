import { BaseEvaluateAdapter } from '@tanstack/ai/adapters'
import { sendWith } from '@tanstack/ai-utils/kubb'
import { ollayaPostV1Systemone } from '../generated/client/sdk'
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
   *
   * @throws An `Error` with a numeric `status` (the HTTP status code) when
   * Ollaya answers with a non-OK response.
   */
  async evaluate(options: EvaluateOptions) {
    const { model, state, questions, abortSignal, logger } = options
    const fetchFn = this.fetchFn ?? globalThis.fetch

    logger.request(`activity=evaluate provider=${this.name} model=${model}`, {
      provider: this.name,
      model,
    })

    let response: Response
    try {
      ;({ response } = await ollayaPostV1Systemone({
        client: sendWith(async (request) => {
          const res = await fetchFn(`${this.baseUrl}${request.path}`, {
            method: request.method,
            headers: {
              'Content-Type': 'application/json',
              // ponytail: local Ollaya needs no key; only send auth behind a proxy
              ...(this.apiKey
                ? { Authorization: `Bearer ${this.apiKey}` }
                : {}),
              ...this.headers,
            },
            body: request.body,
            ...(request.signal ? { signal: request.signal } : {}),
          })
          if (!res.ok) {
            const detail = await res.text().catch(() => '')
            throw Object.assign(
              new Error(
                `Ollaya evaluate request failed: ${res.status} ${res.statusText}${
                  detail ? ` — ${detail}` : ''
                }`,
              ),
              { status: res.status },
            )
          }
          return res
        }),
        body: {
          model,
          // @ts-expect-error public type mismatch: EvaluateJsonValue uses `object`, the document an index-signature record
          state,
          // @ts-expect-error public type mismatch: WireQuestion instructions take EvaluateJsonValue (`object`), the document an index-signature record
          questions,
        },
        signal: abortSignal,
      }))
    } catch (error) {
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
