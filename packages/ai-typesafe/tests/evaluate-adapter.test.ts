import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { EvaluateOptions } from '@tanstack/ai/adapters'
import type { WireAnswer, WireQuestion } from '@tanstack/ai'
import { createTypesafeDecider } from '../src/adapters/evaluate'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function typesafeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function lastRequestBody() {
  const init = fetchMock.mock.calls[0]![1]
  return JSON.parse(String(init?.body))
}

function silentLogger() {
  return new InternalLogger(
    {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    {
      request: false,
      provider: false,
      output: false,
      middleware: false,
      tools: false,
      agentLoop: false,
      config: false,
      errors: false,
      sandbox: false,
    },
  )
}

const state = 'Help! My payouts have been failing for 3 days.'

const questions: Record<string, WireQuestion> = {
  queue: {
    type: 'choice',
    instructions: 'Which team should handle this ticket?',
    criteria: {
      billing: 'Payments, invoices, refunds',
      tech: 'Bugs, outages, integrations',
      sales: 'Pricing, upgrades, new accounts',
    },
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

const wireAnswers: Record<string, WireAnswer> = {
  queue: {
    type: 'choice',
    choice: 'billing',
    probabilities: { billing: 0.82, tech: 0.11, sales: 0.07 },
    confidence: 0.91,
  },
  urgency: {
    type: 'score',
    score: 1.6,
    legend: { '0': 'low', '1': 'medium', '2': 'high' },
    probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
    confidence: 0.78,
  },
  refund: {
    type: 'noul',
    noul: 0.81,
  },
}

const successBody = {
  model: 'jev-1.13.0',
  answers: wireAnswers,
  usage: { input_tokens: 312, output_tokens: 48 },
}

function evaluateOptions(): EvaluateOptions {
  return {
    model: 'jev-latest',
    state,
    questions,
    logger: silentLogger(),
  }
}

function adapter() {
  return createTypesafeDecider('jev-latest', 'test-key')
}

describe('TypesafeEvaluateAdapter', () => {
  it('POSTs to /v1/systemone with auth, body, wire answers, and mapped usage', async () => {
    fetchMock.mockResolvedValue(typesafeResponse(successBody))

    const result = await adapter().evaluate(evaluateOptions())

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer test-key',
    )
    expect(lastRequestBody()).toEqual({
      model: 'jev-latest',
      state,
      questions,
    })
    expect(result.model).toBe('jev-1.13.0')
    expect(result.answers).toEqual(wireAnswers)
    expect(result.usage).toEqual({
      promptTokens: 312,
      completionTokens: 48,
      totalTokens: 360,
    })
  })

  it('throws on 401', async () => {
    await expectStatus(401, 'Unauthorized', 'invalid api key')
  })

  it('throws on 422', async () => {
    await expectStatus(422, 'Unprocessable Entity', 'malformed question')
  })

  it('throws on 429', async () => {
    await expectStatus(429, 'Too Many Requests', 'rate limited')
  })
})

async function expectStatus(status: number, statusText: string, body: string) {
  fetchMock.mockResolvedValue(new Response(body, { status, statusText }))
  await expect(adapter().evaluate(evaluateOptions())).rejects.toThrow(
    String(status),
  )
}
