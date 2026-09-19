import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createCloudflareDecider } from '../src/adapters/evaluate'
import type { WireQuestion } from '@tanstack/ai'
import type { CloudflareGatewayOptions } from '../src/utils/config'

const logger = resolveDebugOption(false)

const MODEL = 'typesafe/jev'

const state = { subject: 'Invoice 1842' }

const questions = {
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
  refund: {
    type: 'noul',
    instructions: 'Is the customer asking for a refund?',
  },
} satisfies Record<string, WireQuestion>

const answers = {
  queue: {
    type: 'choice',
    choice: 'billing',
    probabilities: { billing: 0.82, tech: 0.18 },
    confidence: 0.91,
  },
  urgency: {
    type: 'score',
    score: 1.6,
    confidence: 0.78,
    legend: { '0': 'low', '1': 'medium', '2': 'high' },
    probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
  },
  refund: {
    type: 'noul',
    noul: 0.81,
  },
}

function createRestDecider(
  fetchMock: typeof fetch,
  gateway?: CloudflareGatewayOptions,
) {
  return createCloudflareDecider(MODEL, {
    accountId: 'acc',
    apiKey: 'tok',
    fetch: fetchMock,
    ...(gateway ? { gateway } : {}),
  })
}

function evaluate(adapter: ReturnType<typeof createRestDecider>) {
  return adapter.evaluate({
    model: MODEL,
    state,
    questions,
    logger,
  })
}

describe('evaluate adapter', () => {
  it('maps TypeSafe answers and usage from a REST 200 and forwards gateway headers', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        success: true,
        result: {
          model: 'jev-1.13.0',
          answers,
          usage: { input_tokens: 12, output_tokens: 4 },
        },
      }),
    )
    const adapter = createRestDecider(fetchMock, {
      id: 'g1',
      skipCache: true,
    })

    const result = await evaluate(adapter)

    expect(result).toEqual({
      model: 'jev-1.13.0',
      answers: {
        queue: {
          type: 'choice',
          choice: 'billing',
          probabilities: { billing: 0.82, tech: 0.18 },
          confidence: 0.91,
        },
        urgency: {
          type: 'score',
          score: 1.6,
          confidence: 0.78,
          legend: { '0': 'low', '1': 'medium', '2': 'high' },
          probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 },
        },
        refund: {
          type: 'noul',
          noul: 0.81,
        },
      },
      usage: {
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    if (!call) {
      throw new Error('expected fetch to be called')
    }
    const [url, init] = call
    expect(String(url)).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc/ai/run/typesafe/jev',
    )
    expect(init?.method).toBe('POST')
    const body = init?.body
    if (typeof body !== 'string') {
      throw new Error('expected a JSON string body')
    }
    expect(JSON.parse(body)).toEqual({
      state: { subject: 'Invoice 1842' },
      questions: {
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
        refund: {
          type: 'noul',
          instructions: 'Is the customer asking for a refund?',
        },
      },
    })
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer tok')
    expect(headers.get('cf-aig-gateway-id')).toBe('g1')
    expect(headers.get('cf-aig-skip-cache')).toBe('true')
  })

  it('throws when Workers AI returns an error status', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('nope', { status: 502 }),
    )
    const adapter = createRestDecider(fetchMock)

    await expect(evaluate(adapter)).rejects.toThrow(
      'Workers AI request for typesafe/jev failed (502): nope',
    )
  })
})
