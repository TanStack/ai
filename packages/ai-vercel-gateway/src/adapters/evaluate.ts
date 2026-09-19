import { BaseEvaluateAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import {
  getVercelGatewayApiKeyFromEnv,
  withVercelGatewayDefaults,
} from '../utils/client'
import { mapGatewayModelOptions } from '../utils/map-gateway-options'
import type {
  EvaluateAdapterResult,
  EvaluateOptions,
  WireAnswer,
  WireQuestion,
} from '@tanstack/ai/adapters'
import type { VercelGatewayClientConfig } from '../utils/client'
import type { VercelGatewayRoutingOptions } from '../text/text-provider-options'

export interface VercelGatewayEvaluateConfig extends VercelGatewayClientConfig {}

export type VercelGatewayEvaluateModel = 'typesafe-ai/jev'

export type VercelGatewayEvaluateProviderOptions = Record<string, unknown> & {
  gateway?: VercelGatewayRoutingOptions
}

/**
 * Documented evaluate URL from Vercel AI SDK `GatewayEvaluationModel.getUrl()`:
 * `${baseURL}/evaluation-model` with default baseURL
 * `https://ai-gateway.vercel.sh/v4/ai`. Not `/v1/chat/completions`.
 * https://github.com/vercel/ai/blob/main/packages/gateway/src/gateway-evaluation-model.ts
 */
const EVALUATE_PATH = '/v4/ai/evaluation-model'
const DEFAULT_EVALUATE_URL = `https://ai-gateway.vercel.sh${EVALUATE_PATH}`

/** The gateway rejects the request with 400 when this header is absent. */
const GATEWAY_PROTOCOL_VERSION = '0.0.1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false
  const values = Object.values(value)
  for (const item of values) {
    if (typeof item !== 'number') return false
  }
  return true
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false
  const values = Object.values(value)
  for (const item of values) {
    if (typeof item !== 'string') return false
  }
  return true
}

function extraRequestHeaders(defaultHeaders: unknown) {
  if (defaultHeaders == null) return {}
  if (typeof Headers !== 'undefined' && defaultHeaders instanceof Headers) {
    const headers: Record<string, string> = {}
    const entries = defaultHeaders.entries()
    for (const [key, value] of entries) {
      headers[key] = value
    }
    return headers
  }
  if (Array.isArray(defaultHeaders)) {
    const headers: Record<string, string> = {}
    for (const entry of defaultHeaders) {
      if (!Array.isArray(entry) || entry.length < 2) continue
      const key = entry[0]
      const value = entry[1]
      if (typeof key === 'string' && typeof value === 'string') {
        headers[key] = value
      }
    }
    return headers
  }
  if (!isRecord(defaultHeaders)) return {}
  const headers: Record<string, string> = {}
  const keys = Object.keys(defaultHeaders)
  for (const key of keys) {
    const value = defaultHeaders[key]
    if (typeof value === 'string') headers[key] = value
  }
  return headers
}

function resolveEvaluateUrl(baseURL: string | null | undefined) {
  if (!baseURL) return DEFAULT_EVALUATE_URL
  try {
    return `${new URL(baseURL).origin}${EVALUATE_PATH}`
  } catch {
    return DEFAULT_EVALUATE_URL
  }
}

function toGatewayQuestion(question: WireQuestion) {
  switch (question.type) {
    case 'noul': {
      if (question.criteria === undefined) {
        return {
          type: 'boolean' as const,
          instructions: question.instructions,
        }
      }
      return {
        type: 'boolean' as const,
        instructions: question.instructions,
        criteria: question.criteria,
      }
    }
    case 'choice':
    case 'score':
      return question
  }
}

function toGatewayQuestions(questions: Record<string, WireQuestion>) {
  const mapped: Record<string, unknown> = {}
  const keys = Object.keys(questions)
  for (const key of keys) {
    const question = questions[key]
    if (question === undefined) continue
    mapped[key] = toGatewayQuestion(question)
  }
  return mapped
}

function readCount(candidates: Array<unknown>) {
  for (const candidate of candidates) {
    if (typeof candidate === 'number') return candidate
  }
  return 0
}

function toTokenUsage(usage: unknown) {
  if (!isRecord(usage)) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  }
  const promptTokens = readCount([
    usage.inputTokens,
    usage.input_tokens,
    usage.promptTokens,
    usage.prompt_tokens,
  ])
  const completionTokens = readCount([
    usage.outputTokens,
    usage.output_tokens,
    usage.completionTokens,
    usage.completion_tokens,
  ])
  const totalTokens = readCount([
    usage.totalTokens,
    usage.total_tokens,
    promptTokens + completionTokens,
  ])
  return { promptTokens, completionTokens, totalTokens }
}

function confidenceMap(providerMetadata: unknown) {
  if (!isRecord(providerMetadata)) return {}
  const typesafe = providerMetadata.typesafe
  if (!isRecord(typesafe)) return {}
  if (!isNumberRecord(typesafe.confidence)) return {}
  return typesafe.confidence
}

function confidenceFor(
  key: string,
  answer: Record<string, unknown>,
  byKey: Record<string, number>,
) {
  if (typeof answer.confidence === 'number') return answer.confidence
  const fromMeta = byKey[key]
  if (typeof fromMeta === 'number') return fromMeta
  return 0
}

function toWireAnswer(answer: Record<string, unknown>, confidence: number) {
  switch (answer.type) {
    case 'boolean': {
      if (typeof answer.probability !== 'number') {
        throw new Error(
          'Vercel Gateway evaluate boolean answer was missing probability',
        )
      }
      return { type: 'noul' as const, noul: answer.probability }
    }
    case 'choice': {
      if (typeof answer.choice !== 'string') {
        throw new Error(
          'Vercel Gateway evaluate choice answer was missing choice',
        )
      }
      return {
        type: 'choice' as const,
        choice: answer.choice,
        probabilities: isNumberRecord(answer.probabilities)
          ? answer.probabilities
          : {},
        confidence,
      }
    }
    case 'score': {
      if (typeof answer.score !== 'number') {
        throw new Error(
          'Vercel Gateway evaluate score answer was missing score',
        )
      }
      return {
        type: 'score' as const,
        score: answer.score,
        legend: isStringRecord(answer.legend) ? answer.legend : {},
        probabilities: isNumberRecord(answer.probabilities)
          ? answer.probabilities
          : {},
        confidence,
      }
    }
    default:
      throw new Error(
        `Vercel Gateway evaluate answer had an unexpected type: ${String(answer.type)}`,
      )
  }
}

function toWireAnswers(answers: unknown, byKey: Record<string, number>) {
  if (!isRecord(answers)) {
    throw new Error('Vercel Gateway evaluate response was missing answers')
  }
  const mapped: Record<string, WireAnswer> = {}
  const keys = Object.keys(answers)
  for (const key of keys) {
    const answer = answers[key]
    if (!isRecord(answer)) {
      throw new Error(
        `Vercel Gateway evaluate answer "${key}" had an unexpected shape`,
      )
    }
    mapped[key] = toWireAnswer(answer, confidenceFor(key, answer, byKey))
  }
  return mapped
}

/**
 * Vercel AI Gateway evaluate adapter.
 *
 * Talks to `POST /v4/ai/evaluation-model` with `fetch`. Jev is not a chat
 * model; this adapter does not use `/v1/chat/completions`.
 */
export class VercelGatewayEvaluateAdapter<
  TModel extends VercelGatewayEvaluateModel,
> extends BaseEvaluateAdapter<TModel, VercelGatewayEvaluateProviderOptions> {
  readonly name = 'vercel-gateway' as const

  private readonly apiKey: string
  private readonly evaluateUrl: string
  private readonly extraHeaders: Record<string, string>

  constructor(config: VercelGatewayEvaluateConfig, model: TModel) {
    super({}, model)
    const defaults = withVercelGatewayDefaults(config)
    this.apiKey = config.apiKey
    this.evaluateUrl = resolveEvaluateUrl(defaults.baseURL)
    this.extraHeaders = extraRequestHeaders(defaults.defaultHeaders)
  }

  async evaluate(
    options: EvaluateOptions<VercelGatewayEvaluateProviderOptions>,
  ) {
    const { model, state, questions, modelOptions, abortSignal, logger } =
      options
    const mapped = mapGatewayModelOptions(modelOptions)

    logger.request(`activity=evaluate provider=${this.name} model=${model}`, {
      provider: this.name,
      model,
    })

    try {
      const response = await fetch(this.evaluateUrl, {
        method: 'POST',
        headers: {
          ...this.extraHeaders,
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'ai-gateway-protocol-version': GATEWAY_PROTOCOL_VERSION,
          'ai-evaluation-model-specification-version': '4',
          'ai-model-id': model,
        },
        body: JSON.stringify({
          ...mapped,
          model,
          state,
          questions: toGatewayQuestions(questions),
        }),
        ...(abortSignal ? { signal: abortSignal } : {}),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(
          `Vercel Gateway evaluate request failed: ${response.status} ${response.statusText}${
            detail ? ` — ${detail}` : ''
          }`,
        )
      }

      const json: unknown = await response.json()
      if (!isRecord(json)) {
        throw new Error(
          'Vercel Gateway evaluate response had an unexpected shape',
        )
      }

      const result: EvaluateAdapterResult = {
        model: typeof json.model === 'string' ? json.model : model,
        answers: toWireAnswers(
          json.answers,
          confidenceMap(json.providerMetadata),
        ),
        usage: toTokenUsage(json.usage),
      }
      return result
    } catch (error: unknown) {
      logger.errors(`${this.name}.evaluate fatal`, {
        error: toRunErrorPayload(error, `${this.name}.evaluate failed`),
        source: `${this.name}.evaluate`,
      })
      throw error
    }
  }
}

/**
 * Create a Vercel AI Gateway evaluate adapter with an explicit API key.
 *
 * @param model Evaluate model id. Use `typesafe-ai/jev`.
 * @param apiKey Vercel AI Gateway API key.
 * @param config Optional client config (`baseURL`, `httpReferer`, `xTitle`).
 *
 * @example
 * ```ts
 * const adapter = createVercelGatewayDecider('typesafe-ai/jev', 'vck_...')
 * ```
 */
export function createVercelGatewayDecider<
  TModel extends VercelGatewayEvaluateModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<VercelGatewayEvaluateConfig, 'apiKey'>,
) {
  return new VercelGatewayEvaluateAdapter({ apiKey, ...config }, model)
}

/**
 * Create a Vercel AI Gateway evaluate adapter.
 *
 * Reads `AI_GATEWAY_API_KEY`, then `VERCEL_OIDC_TOKEN`.
 *
 * @param model Evaluate model id. Use `typesafe-ai/jev`.
 * @param config Optional client config (`baseURL`, `httpReferer`, `xTitle`).
 *
 * @example
 * ```ts
 * import { decide, boolean } from '@tanstack/ai'
 * import { vercelGatewayDecider } from '@tanstack/ai-vercel-gateway'
 *
 * const result = await decide({
 *   adapter: vercelGatewayDecider('typesafe-ai/jev'),
 *   state: ticket,
 *   questions: {
 *     refund: boolean({
 *       instructions: 'Is the customer asking for a refund?',
 *     }),
 *   },
 * })
 * ```
 */
export function vercelGatewayDecider<TModel extends VercelGatewayEvaluateModel>(
  model: TModel,
  config?: Omit<VercelGatewayEvaluateConfig, 'apiKey'>,
) {
  return createVercelGatewayDecider(
    model,
    getVercelGatewayApiKeyFromEnv(),
    config,
  )
}
