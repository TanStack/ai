import { BaseEvaluateAdapter } from '@tanstack/ai/adapters'
import type { EvaluateOptions } from '@tanstack/ai/adapters'
import type { TokenUsage, WireAnswer } from '@tanstack/ai'
import {
  getTypesafeApiKeyFromEnv,
  resolveTypesafeTransport,
} from '../utils/client'
import type { TypesafeClientConfig } from '../utils/client'
import type { TypesafeEvaluateModel } from '../model-meta'

/** Shape of the TypeSafe `POST /v1/systemone` response we depend on. */
interface TypesafeEvaluateResponse {
  model: string
  answers: Record<string, WireAnswer>
  usage: { input_tokens: number; output_tokens: number }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTypesafeEvaluateResponse(
  value: unknown,
): value is TypesafeEvaluateResponse {
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
 * TypeSafe evaluate adapter.
 *
 * Talks to TypeSafe's `POST /v1/systemone` endpoint over raw `fetch` — no SDK.
 * Returns the provider wire answers. The `evaluator().decide()` activity maps
 * those to the unified public result.
 */
export class TypesafeEvaluateAdapter<
  TModel extends TypesafeEvaluateModel,
> extends BaseEvaluateAdapter<TModel> {
  readonly name = 'typesafe' as const

  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly fetchFn: typeof fetch | undefined

  constructor(config: TypesafeClientConfig, model: TModel) {
    super({}, model)
    this.apiKey = config.apiKey
    const transport = resolveTypesafeTransport(config)
    this.baseUrl = transport.baseUrl
    this.headers = transport.headers
    this.fetchFn = config.fetch
  }

  /**
   * POST `{ model, state, questions }` to TypeSafe and return wire answers
   * plus mapped token usage. Does not invent unified `.value` fields.
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
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
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
        `TypeSafe evaluate request failed: ${response.status} ${response.statusText}${
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
    if (!isTypesafeEvaluateResponse(json)) {
      throw new Error('TypeSafe evaluate response had an unexpected shape')
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
 * Creates a TypeSafe evaluate adapter with an explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createTypesafeEvaluator('jev-latest', 'ts-...')
 * ```
 */
export function createTypesafeEvaluator<TModel extends TypesafeEvaluateModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<TypesafeClientConfig, 'apiKey'>,
) {
  return new TypesafeEvaluateAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a TypeSafe evaluate adapter, reading `TYPESAFE_API_KEY` from the
 * environment.
 *
 * @throws Error if `TYPESAFE_API_KEY` is not found.
 *
 * @example
 * ```typescript
 * import { evaluator } from '@tanstack/ai'
 * import { typesafeEvaluator } from '@tanstack/ai-typesafe'
 *
 * const ticketEval = evaluator({
 *   adapter: typesafeEvaluator('jev-latest'),
 * })
 * ```
 */
export function typesafeEvaluator<TModel extends TypesafeEvaluateModel>(
  model: TModel,
  config?: Omit<TypesafeClientConfig, 'apiKey'>,
) {
  return createTypesafeEvaluator(model, getTypesafeApiKeyFromEnv(), config)
}
