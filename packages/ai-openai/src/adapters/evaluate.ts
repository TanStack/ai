import OpenAI from 'openai'
import { buildBaseUsage } from '@tanstack/ai'
import { BaseEvaluateAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type {
  EvaluateOptions,
  WireAnswer,
  WireQuestion,
} from '@tanstack/ai/adapters'
import type { Decision, DecisionCreateParams } from 'openai/resources/decisions'
import type { OpenAIClientConfig } from '../utils/client'

/** Models served by the OpenAI Decisions API. */
export const OPENAI_EVALUATE_MODELS = ['gpt-6-luna'] as const

export type OpenAIEvaluateModel =
  | (typeof OPENAI_EVALUATE_MODELS)[number]
  | (string & {})

/**
 * Configuration for OpenAI evaluate adapter
 */
export interface OpenAIEvaluateConfig extends OpenAIClientConfig {}

type DecisionQuestion = DecisionCreateParams['questions'][number]
type DecisionAnswer = Decision['answers'][number]

function toText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function toDecisionQuestion(
  name: string,
  question: WireQuestion,
): DecisionQuestion {
  const instructions = toText(question.instructions)
  switch (question.type) {
    case 'choice':
      return {
        type: 'choice',
        name,
        instructions,
        choices: Object.entries(question.criteria).map(
          ([value, description]) => ({
            value,
            ...(description !== null && { description }),
          }),
        ),
      }
    case 'score':
      return {
        type: 'score',
        name,
        instructions,
        levels: question.criteria.map((label) => ({ label })),
      }
    case 'noul': {
      // OpenAI predicates have no criteria field, so fold the yes/no meanings
      // into the instructions.
      const hints = [
        question.criteria?.true && `True means: ${question.criteria.true}`,
        question.criteria?.false && `False means: ${question.criteria.false}`,
      ].filter(Boolean)
      return {
        type: 'predicate',
        name,
        instructions: [instructions, ...hints].join('\n'),
      }
    }
  }
}

function toWireAnswer(answer: DecisionAnswer, name: string): WireAnswer {
  switch (answer.type) {
    case 'predicate':
      return { type: 'noul', noul: answer.probability }
    case 'choice':
      return {
        type: 'choice',
        choice: String(answer.choice),
        probabilities: Object.fromEntries(
          answer.probabilities.map((p) => [String(p.value), p.probability]),
        ),
        confidence: answer.confidence,
      }
    case 'score':
      return {
        type: 'score',
        score: answer.score,
        legend: Object.fromEntries(
          answer.probabilities.map((p) => [String(p.value), p.label]),
        ),
        probabilities: Object.fromEntries(
          answer.probabilities.map((p) => [String(p.value), p.probability]),
        ),
        confidence: answer.confidence,
      }
    case 'refusal':
      throw new Error(`OpenAI declined to answer question "${name}"`)
  }
}

/**
 * OpenAI evaluate adapter.
 *
 * Asks typed questions about a shared `state` through the OpenAI Decisions
 * API (`/v1/decisions`). Returns TypeSafe wire answers; `decide()` maps those
 * to the public shape.
 */
export class OpenAIEvaluateAdapter<
  TModel extends OpenAIEvaluateModel,
> extends BaseEvaluateAdapter<TModel> {
  readonly name = 'openai' as const

  protected client: OpenAI

  constructor(config: OpenAIEvaluateConfig, model: TModel) {
    super({}, model)
    this.client = new OpenAI(config)
  }

  async evaluate(options: EvaluateOptions) {
    const { model, state, questions, abortSignal, logger } = options
    const questionKeys = Object.keys(questions)

    logger.request(
      `activity=evaluate provider=${this.name} model=${model} questions=${questionKeys.length}`,
      { provider: this.name, model },
    )

    try {
      const decision = await this.client.decisions.create(
        {
          model,
          input: toText(state),
          questions: Object.entries(questions).map(([name, question]) =>
            toDecisionQuestion(name, question),
          ),
        },
        abortSignal ? { signal: abortSignal } : undefined,
      )

      // Answers come back in question order. `name` is null only for
      // unnamed questions, and we always send names.
      const answers: Record<string, WireAnswer> = {}
      decision.answers.forEach((answer, index) => {
        const name = answer.name ?? questionKeys[index] ?? String(index)
        answers[name] = toWireAnswer(answer, name)
      })

      return {
        model: decision.model,
        answers,
        usage: buildBaseUsage({
          promptTokens: decision.usage.input_tokens,
          completionTokens: decision.usage.output_tokens,
          totalTokens: decision.usage.total_tokens,
        }),
      }
    } catch (error) {
      // toRunErrorPayload keeps request headers (and the API key) out of logs.
      logger.errors(`${this.name}.evaluate fatal`, {
        error: toRunErrorPayload(error, `${this.name}.evaluate failed`),
        source: `${this.name}.evaluate`,
      })
      throw error
    }
  }
}

/**
 * Creates an OpenAI evaluate adapter with an explicit API key.
 *
 * @param model Decisions model, for example `'gpt-6-luna'`.
 * @param apiKey OpenAI API key.
 * @param config Optional OpenAI client options.
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiDecider('gpt-6-luna', 'sk-...')
 * ```
 */
export function createOpenaiDecider<TModel extends OpenAIEvaluateModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIEvaluateConfig, 'apiKey'>,
) {
  return new OpenAIEvaluateAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI evaluate adapter, reading `OPENAI_API_KEY` from the
 * environment.
 *
 * @param model Decisions model, for example `'gpt-6-luna'`.
 * @param config Optional OpenAI client options.
 *
 * @example
 * ```typescript
 * import { decide, choice } from '@tanstack/ai'
 * import { openaiDecider } from '@tanstack/ai-openai'
 *
 * const result = await decide({
 *   adapter: openaiDecider('gpt-6-luna'),
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
export function openaiDecider<TModel extends OpenAIEvaluateModel>(
  model: TModel,
  config?: Omit<OpenAIEvaluateConfig, 'apiKey'>,
) {
  return createOpenaiDecider(model, getOpenAIApiKeyFromEnv(), config)
}
