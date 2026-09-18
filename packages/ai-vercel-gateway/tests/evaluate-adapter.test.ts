import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createVercelGatewayEvaluator } from '../src/adapters/evaluate'
import type { EvaluateOptions } from '@tanstack/ai/adapters'

const testLogger = resolveDebugOption(false)
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
  })
}

function lastRequest() {
  const [url, init] = fetchMock.mock.calls[0]!
  const body: unknown = JSON.parse(String(init?.body))
  return { url: String(url), init, body }
}

function evaluateOptions(
  overrides?: Partial<EvaluateOptions>,
): EvaluateOptions {
  return {
    model: 'typesafe-ai/jev',
    state: 'The support agent issued a full refund to the customer.',
    questions: {
      refund: {
        type: 'noul',
        instructions: 'Was a refund issued?',
      },
      queue: {
        type: 'choice',
        instructions: 'Which team should handle this ticket?',
        criteria: {
          billing: 'Payments, invoices, refunds',
          tech: 'Bugs, outages, integrations',
        },
      },
      urgency: {
        type: 'score',
        instructions: 'How urgent is this ticket?',
        criteria: ['low', 'medium', 'high'],
      },
    },
    logger: testLogger,
    ...overrides,
  }
}

it('POSTs to /v4/ai/evaluation-model and maps boolean/choice/score answers', async () => {
  fetchMock.mockResolvedValue(
    jsonResponse({
      answers: {
        refund: { type: 'boolean', probability: 0.81 },
        queue: {
          type: 'choice',
          choice: 'billing',
          probabilities: { billing: 0.82, tech: 0.18 },
        },
        urgency: {
          type: 'score',
          score: 1.6,
          probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
        },
      },
      usage: { inputTokens: 12, outputTokens: 4 },
      providerMetadata: {
        typesafe: { confidence: { queue: 0.91, urgency: 0.78 } },
      },
    }),
  )

  const adapter = createVercelGatewayEvaluator('typesafe-ai/jev', 'gw_test_key')
  const result = await adapter.evaluate(
    evaluateOptions({
      modelOptions: { gateway: { zeroDataRetention: true } },
    }),
  )

  const request = lastRequest()
  expect(request.url).toBe(
    'https://ai-gateway.vercel.sh/v4/ai/evaluation-model',
  )
  expect(request.url).not.toContain('/chat/completions')
  expect(request.init?.method).toBe('POST')
  expect(new Headers(request.init?.headers).get('Authorization')).toBe(
    'Bearer gw_test_key',
  )
  expect(
    new Headers(request.init?.headers).get('ai-gateway-protocol-version'),
  ).toBe('0.0.1')
  expect(request.body).toEqual({
    model: 'typesafe-ai/jev',
    state: 'The support agent issued a full refund to the customer.',
    questions: {
      refund: {
        type: 'boolean',
        instructions: 'Was a refund issued?',
      },
      queue: {
        type: 'choice',
        instructions: 'Which team should handle this ticket?',
        criteria: {
          billing: 'Payments, invoices, refunds',
          tech: 'Bugs, outages, integrations',
        },
      },
      urgency: {
        type: 'score',
        instructions: 'How urgent is this ticket?',
        criteria: ['low', 'medium', 'high'],
      },
    },
    providerOptions: { gateway: { zeroDataRetention: true } },
  })
  expect(result).toEqual({
    model: 'typesafe-ai/jev',
    answers: {
      refund: { type: 'noul', noul: 0.81 },
      queue: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 0.82, tech: 0.18 },
        confidence: 0.91,
      },
      urgency: {
        type: 'score',
        score: 1.6,
        legend: {},
        probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
        confidence: 0.78,
      },
    },
    usage: { promptTokens: 12, completionTokens: 4, totalTokens: 16 },
  })
})

it('throws when the evaluate request is not OK', async () => {
  fetchMock.mockResolvedValue(
    new Response('gateway down', {
      status: 503,
      statusText: 'Service Unavailable',
    }),
  )

  const adapter = createVercelGatewayEvaluator('typesafe-ai/jev', 'gw_test_key')

  await expect(adapter.evaluate(evaluateOptions())).rejects.toThrow(
    'Vercel Gateway evaluate request failed: 503 Service Unavailable — gateway down',
  )
})
