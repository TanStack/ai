import { describe, expect, it } from 'vitest'
import { createSigV4Fetch } from '../src/utils/openai-sigv4-fetch'

describe('createSigV4Fetch', () => {
  it('signs the request and adds an Authorization header', async () => {
    let seen: Headers | undefined
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen = new Headers(init?.headers)
      return new Response('{}', { status: 200 })
    }
    const signed = createSigV4Fetch(
      {
        kind: 'sigv4',
        region: 'us-east-1',
        service: 'bedrock',
        credentials: async () => ({
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
        }),
      },
      fakeFetch,
    )
    await signed(
      'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions',
      {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      },
    )
    expect(seen?.get('authorization')).toMatch(/AWS4-HMAC-SHA256/)
  })
})
