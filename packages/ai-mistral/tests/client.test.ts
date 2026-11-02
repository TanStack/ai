import { describe, expect, it, vi } from 'vitest'
import { createMistralClient } from '../src/client'
import type { MistralClientConfig } from '../src/utils/client'

const completion = {
  id: 'cmpl-1',
  object: 'chat.completion',
  model: 'mistral-large-latest',
  created: 1,
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'hi' },
      finish_reason: 'stop',
    },
  ],
}

/** Sends one chat completion and returns the URL it went to. */
async function requestURL(config: MistralClientConfig) {
  const fetcher = vi
    .fn<(url: string, init: RequestInit) => Promise<Response>>()
    .mockResolvedValue(Response.json(completion))
  await createMistralClient(config, fetcher).chat.complete({
    model: 'mistral-large-latest',
    messages: [{ role: 'user', content: 'hi' }],
  })
  return fetcher.mock.calls[0]?.[0]
}

describe('createMistralClient', () => {
  it('maps baseURL onto serverURL', async () => {
    expect(
      await requestURL({ apiKey: 'k', baseURL: 'https://gw.example/mistral' }),
    ).toBe('https://gw.example/mistral/v1/chat/completions')
  })

  it('keeps serverURL working, baseURL wins', async () => {
    expect(
      await requestURL({ apiKey: 'k', serverURL: 'https://old.example' }),
    ).toBe('https://old.example/v1/chat/completions')
    expect(
      await requestURL({
        apiKey: 'k',
        serverURL: 'https://old.example',
        baseURL: 'https://new.example',
      }),
    ).toBe('https://new.example/v1/chat/completions')
  })

  it('defaults to the Mistral API', async () => {
    expect(await requestURL({ apiKey: 'k' })).toBe(
      'https://api.mistral.ai/v1/chat/completions',
    )
  })
})
