import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boolean, choice, evaluator, score } from '@tanstack/ai'
import { createOpenRouterEvaluator } from '../src/adapters/evaluate'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const state = 'Help! My payouts have been failing for 3 days.'

const questions = {
  isUrgent: boolean({
    instructions: 'Does this message convey urgency?',
    criteria: {
      true: 'Explicitly time-sensitive',
      false: 'No urgency expressed',
    },
  }),
  department: choice({
    instructions: 'Which team should handle this?',
    options: {
      billing: 'Payments, invoicing, refunds',
      technical: 'Bugs, outages, integrations',
      sales: 'Pricing, upgrades, new accounts',
    },
  }),
  frustration: score({
    instructions: 'How frustrated is the customer?',
    levels: ['Calm', 'Frustrated', 'Very angry'],
  }),
}

const wireAnswers = {
  isUrgent: { type: 'noul' as const, noul: 0.91 },
  department: {
    type: 'choice' as const,
    choice: 'billing',
    probabilities: { billing: 0.82, technical: 0.11, sales: 0.07 },
    confidence: 0.88,
  },
  frustration: {
    type: 'score' as const,
    score: 1.6,
    confidence: 0.74,
    legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
    probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
  },
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function wireBody() {
  return {
    model: 'typesafe/jev-1.13.0',
    answers: wireAnswers,
    usage: { input_tokens: 12, output_tokens: 3 },
  }
}

const adapter = () =>
  createOpenRouterEvaluator('~typesafe/jev-latest', 'sk-or-test')

async function capturedRequest() {
  const [input, init] = fetchMock.mock.calls[0]!
  if (input instanceof Request) {
    return { url: input.url, body: await input.clone().json() }
  }
  return {
    url: String(input),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

describe('OpenRouterEvaluateAdapter', () => {
  it('hits /api/alpha/decisions and maps answers plus usage', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wireBody()))

    const result = await evaluator({ adapter: adapter() }).decide({
      state,
      questions,
    })

    const { url, body } = await capturedRequest()
    expect(url).toContain('/api/alpha/decisions')
    expect(body).toEqual({
      model: '~typesafe/jev-latest',
      state,
      questions: {
        isUrgent: {
          type: 'noul',
          instructions: 'Does this message convey urgency?',
          criteria: {
            true: 'Explicitly time-sensitive',
            false: 'No urgency expressed',
          },
        },
        department: {
          type: 'choice',
          instructions: 'Which team should handle this?',
          criteria: {
            billing: 'Payments, invoicing, refunds',
            technical: 'Bugs, outages, integrations',
            sales: 'Pricing, upgrades, new accounts',
          },
        },
        frustration: {
          type: 'score',
          instructions: 'How frustrated is the customer?',
          criteria: ['Calm', 'Frustrated', 'Very angry'],
        },
      },
    })

    expect(result.isUrgent).toEqual({
      type: 'boolean',
      value: true,
      probability: 0.91,
    })
    expect(result.department).toEqual({
      type: 'choice',
      value: 'billing',
      probability: 0.82,
      confidence: 0.88,
      probabilities: { billing: 0.82, technical: 0.11, sales: 0.07 },
    })
    expect(result.frustration).toEqual({
      type: 'score',
      value: 'Very angry',
      probability: 0.65,
      confidence: 0.74,
      score: 1.6,
      legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
      probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
    })
    expect(result.meta.model).toBe('typesafe/jev-1.13.0')
    expect(result.meta.usage).toEqual({
      promptTokens: 12,
      completionTokens: 3,
      totalTokens: 15,
    })
  })

  it('maps prompt_tokens and completion_tokens when input_tokens is absent', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: 'typesafe/jev-1.13.0',
        answers: {
          isUrgent: { type: 'noul', noul: 0.2 },
        },
        usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 },
      }),
    )

    const result = await evaluator({ adapter: adapter() }).decide({
      state,
      questions: {
        isUrgent: boolean({
          instructions: 'Does this message convey urgency?',
        }),
      },
    })

    expect(result.meta.usage).toEqual({
      promptTokens: 8,
      completionTokens: 1,
      totalTokens: 9,
    })
  })

  it('throws on a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      new Response('bad request', { status: 400, statusText: 'Bad Request' }),
    )

    await expect(
      evaluator({ adapter: adapter(), debug: false }).decide({
        state,
        questions: {
          isUrgent: boolean({
            instructions: 'Does this message convey urgency?',
          }),
        },
      }),
    ).rejects.toThrow()
  })
})
