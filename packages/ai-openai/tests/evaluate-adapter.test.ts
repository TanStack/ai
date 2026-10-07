import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIEvaluateAdapter } from '../src/adapters/evaluate'
import type { EvaluateOptions, WireQuestion } from '@tanstack/ai/adapters'
import type { Decision } from 'openai/resources/decisions'
import type { OpenAIEvaluateModel } from '../src/adapters/evaluate'

const testLogger = resolveDebugOption(false)

/**
 * Test-only subclass exposing the SDK client's `decisions.create` to
 * `vi.spyOn`, same pattern as `TestOpenAIEmbeddingAdapter`.
 */
class TestOpenAIEvaluateAdapter<
  TModel extends OpenAIEvaluateModel,
> extends OpenAIEvaluateAdapter<TModel> {
  spyOnDecisionsCreate() {
    return vi.spyOn(this.client.decisions, 'create')
  }
}

const questions: Record<string, WireQuestion> = {
  queue: {
    type: 'choice',
    instructions: 'Which team should handle this ticket?',
    criteria: { billing: 'Payments, invoices, refunds', tech: null },
  },
  urgency: {
    type: 'score',
    instructions: 'How urgent is this ticket?',
    criteria: ['low', 'medium', 'high'],
  },
  refund: {
    type: 'noul',
    instructions: 'Is the customer asking for a refund?',
  },
}

function decision(answers: Decision['answers']): Decision {
  return {
    model: 'gpt-6-luna',
    answers,
    usage: {
      input_tokens: 40,
      input_tokens_details: { cache_write_tokens: 0, cached_tokens: 0 },
      output_tokens: 0,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 40,
    },
  }
}

const allAnswers = decision([
  {
    type: 'choice',
    name: 'queue',
    choice: 'billing',
    probabilities: [
      { value: 'billing', probability: 0.95 },
      { value: 'tech', probability: 0.05 },
    ],
    confidence: 0.93,
  },
  {
    type: 'score',
    name: 'urgency',
    score: 1.1,
    probabilities: [
      { value: 0, label: 'low', probability: 0.1 },
      { value: 1, label: 'medium', probability: 0.7 },
      { value: 2, label: 'high', probability: 0.2 },
    ],
    confidence: 0.55,
  },
  { type: 'predicate', name: 'refund', probability: 0.92 },
])

function setup(response: Decision = allAnswers) {
  const adapter = new TestOpenAIEvaluateAdapter(
    { apiKey: 'test' },
    'gpt-6-luna',
  )
  const spy = adapter.spyOnDecisionsCreate()
  spy.mockResolvedValue(response)
  return { adapter, spy }
}

function run(
  adapter: OpenAIEvaluateAdapter<'gpt-6-luna'>,
  state: EvaluateOptions['state'] = 'Charged twice',
  qs: Record<string, WireQuestion> = questions,
) {
  return adapter.evaluate({
    model: 'gpt-6-luna',
    state,
    questions: qs,
    logger: testLogger,
  })
}

describe('OpenAI evaluate adapter', () => {
  it('sends questions as a named Decisions question array', async () => {
    const { adapter, spy } = setup()
    await run(adapter)
    expect(spy.mock.calls[0]?.[0].questions).toEqual([
      {
        type: 'choice',
        name: 'queue',
        instructions: 'Which team should handle this ticket?',
        choices: [
          { value: 'billing', description: 'Payments, invoices, refunds' },
          { value: 'tech' },
        ],
      },
      {
        type: 'score',
        name: 'urgency',
        instructions: 'How urgent is this ticket?',
        levels: [{ label: 'low' }, { label: 'medium' }, { label: 'high' }],
      },
      {
        type: 'predicate',
        name: 'refund',
        instructions: 'Is the customer asking for a refund?',
      },
    ])
  })

  it('sends object state as JSON input', async () => {
    const { adapter, spy } = setup()
    await run(adapter, { subject: 'Charged twice' })
    expect(spy.mock.calls[0]?.[0].input).toBe('{"subject":"Charged twice"}')
  })

  it('folds predicate criteria into the instructions', async () => {
    const { adapter, spy } = setup()
    await run(adapter, 'Refund please', {
      refund: {
        type: 'noul',
        instructions: 'Refund?',
        criteria: { true: 'asks for money back', false: 'anything else' },
      },
    })
    expect(spy.mock.calls[0]?.[0].questions[0]?.instructions).toBe(
      'Refund?\nTrue means: asks for money back\nFalse means: anything else',
    )
  })

  it('maps a choice answer to the wire record', async () => {
    const { adapter } = setup()
    const result = await run(adapter)
    expect(result.answers.queue).toEqual({
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 0.95, tech: 0.05 },
      confidence: 0.93,
    })
  })

  it('maps a score answer to legend and index-keyed probabilities', async () => {
    const { adapter } = setup()
    const result = await run(adapter)
    expect(result.answers.urgency).toEqual({
      type: 'score',
      score: 1.1,
      legend: { '0': 'low', '1': 'medium', '2': 'high' },
      probabilities: { '0': 0.1, '1': 0.7, '2': 0.2 },
      confidence: 0.55,
    })
  })

  it('maps a predicate answer to noul', async () => {
    const { adapter } = setup()
    const result = await run(adapter)
    expect(result.answers.refund).toEqual({ type: 'noul', noul: 0.92 })
  })

  it('maps usage tokens', async () => {
    const { adapter } = setup()
    const result = await run(adapter)
    expect(result.usage).toEqual({
      promptTokens: 40,
      completionTokens: 0,
      totalTokens: 40,
    })
  })

  it('throws when a question is refused', async () => {
    const { adapter } = setup(decision([{ type: 'refusal', name: 'refund' }]))
    await expect(run(adapter)).rejects.toThrow('"refund"')
  })

  it('rethrows SDK errors', async () => {
    const { adapter, spy } = setup()
    spy.mockRejectedValue(new Error('401 Unauthorized'))
    await expect(run(adapter)).rejects.toThrow('401 Unauthorized')
  })
})
