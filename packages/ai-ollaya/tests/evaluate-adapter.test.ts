import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { EvaluateOptions } from '@tanstack/ai/adapters'
import type { WireAnswer, WireQuestion } from '@tanstack/ai'
import { ollayaDecider } from '../src/adapters/evaluate'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function ollayaResponse(body: unknown, status = 200): Response {
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
  model: 'laya:en',
  answers: wireAnswers,
  usage: { input_tokens: 45, output_tokens: 0 },
}

function evaluateOptions(): EvaluateOptions {
  return {
    model: 'laya:latest',
    state,
    questions,
    logger: silentLogger(),
  }
}

describe('OllayaEvaluateAdapter', () => {
  it('POSTs to the default local /v1/systemone with body, wire answers, and mapped usage', async () => {
    fetchMock.mockResolvedValue(ollayaResponse(successBody))

    const result =
      await ollayaDecider('laya:latest').evaluate(evaluateOptions())

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:11435/v1/systemone')
    expect(init?.method).toBe('POST')
    // Local server: no Authorization header by default.
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(lastRequestBody()).toEqual({
      model: 'laya:latest',
      state,
      questions,
    })
    expect(result.model).toBe('laya:en')
    expect(result.answers).toEqual(wireAnswers)
    expect(result.usage).toEqual({
      promptTokens: 45,
      completionTokens: 0,
      totalTokens: 45,
    })
  })

  it('honors a custom baseURL and strips its trailing slash', async () => {
    fetchMock.mockResolvedValue(ollayaResponse(successBody))

    await ollayaDecider('laya:latest', {
      baseURL: 'http://my-host:11435/',
    }).evaluate(evaluateOptions())

    expect(fetchMock.mock.calls[0]![0]).toBe(
      'http://my-host:11435/v1/systemone',
    )
  })

  it('sends a bearer token when an apiKey is configured (auth proxy)', async () => {
    fetchMock.mockResolvedValue(ollayaResponse(successBody))

    await ollayaDecider('laya:latest', { apiKey: 'proxy-token' }).evaluate(
      evaluateOptions(),
    )

    expect(
      new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Authorization'),
    ).toBe('Bearer proxy-token')
  })

  it('throws with the response body detail on a non-OK status', async () => {
    fetchMock.mockResolvedValue(
      new Response('model not found', {
        status: 404,
        statusText: 'Not Found',
      }),
    )

    await expect(
      ollayaDecider('laya:latest').evaluate(evaluateOptions()),
    ).rejects.toThrow('404')
  })

  it('throws when the response shape is unexpected', async () => {
    fetchMock.mockResolvedValue(ollayaResponse({ nope: true }))

    await expect(
      ollayaDecider('laya:latest').evaluate(evaluateOptions()),
    ).rejects.toThrow('unexpected shape')
  })
})
