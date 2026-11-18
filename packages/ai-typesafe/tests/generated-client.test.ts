import { describe, expect, it, vi } from 'vitest'
import { InternalLogger } from '@tanstack/ai/adapter-internals'
import { createTypesafeDecider } from '../src/adapters/evaluate'

describe('generated client', () => {
  it('sends POST /v1/systemone through the injected fetch', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        model: 'jev-latest',
        answers: { refund: { type: 'noul', noul: 0.9 } },
        usage: { input_tokens: 3, output_tokens: 1 },
      }),
    )
    const questions = {
      refund: { type: 'noul' as const, instructions: 'Refund?' },
    }
    const result = await createTypesafeDecider('jev-latest', 'k', {
      baseURL: 'https://gw.example/ts/',
      defaultHeaders: { 'x-extra': '1' },
      fetch: fetcher,
    }).evaluate({
      model: 'jev-latest',
      state: 'I want my money back',
      questions,
      logger: new InternalLogger(
        { debug() {}, info() {}, warn() {}, error() {} },
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
      ),
    })

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://gw.example/ts/v1/systemone')
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('authorization')).toBe('Bearer k')
    expect(headers.get('x-extra')).toBe('1')
    expect(init?.body).toBe(
      JSON.stringify({
        model: 'jev-latest',
        state: 'I want my money back',
        questions,
      }),
    )
    expect(result.usage.totalTokens).toBe(4)
  })
})
