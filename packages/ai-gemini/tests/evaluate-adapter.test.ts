import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boolean, choice, decide, score } from '@tanstack/ai'
import { createGeminiDecider } from '../src/adapters/evaluate'

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
    model: 'gemini-decision-1',
    answers: wireAnswers,
    // The Decisions API reports total_* keys; output is always 0.
    usage: {
      total_input_tokens: 12,
      total_output_tokens: 0,
      total_tokens: 12,
    },
  }
}

const adapter = () => createGeminiDecider('gemini-decision-1', 'AIza-test')

async function capturedRequest() {
  const [input, init] = fetchMock.mock.calls[0]!
  if (input instanceof Request) {
    return {
      url: input.url,
      headers: input.headers,
      body: await input.clone().json(),
    }
  }
  return {
    url: String(input),
    headers: new Headers(init?.headers),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

describe('GeminiEvaluateAdapter', () => {
  it('hits /v1beta/decisions, forwards state as input, and maps answers plus usage', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wireBody()))

    const result = await decide({
      adapter: adapter(),
      state,
      questions,
    })

    const { url, headers, body } = await capturedRequest()
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/decisions',
    )
    expect(headers.get('x-goog-api-key')).toBe('AIza-test')
    // Gemini's endpoint takes `input`, not `state`.
    expect(body).toEqual({
      model: 'gemini-decision-1',
      input: state,
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
    expect(result.meta.model).toBe('gemini-decision-1')
    expect(result.meta.usage).toEqual({
      promptTokens: 12,
      completionTokens: 0,
      totalTokens: 12,
    })
  })

  it('honors a custom baseURL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wireBody()))

    await decide({
      adapter: createGeminiDecider('gemini-decision-1', 'AIza-test', {
        baseURL: 'https://gateway.example.com/',
      }),
      state,
      questions: {
        isUrgent: boolean({
          instructions: 'Does this message convey urgency?',
        }),
      },
    })

    const { url } = await capturedRequest()
    expect(url).toBe('https://gateway.example.com/v1beta/decisions')
  })

  it('throws with status on a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      new Response('bad request', { status: 400, statusText: 'Bad Request' }),
    )

    await expect(
      decide({
        adapter: adapter(),
        state,
        debug: false,
        questions: {
          isUrgent: boolean({
            instructions: 'Does this message convey urgency?',
          }),
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(
        /^Gemini evaluate request failed: 400 Bad Request .+ bad request$/,
      ),
    })
  })
})
