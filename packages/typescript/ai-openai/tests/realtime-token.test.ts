import { afterEach, describe, expect, it, vi } from 'vitest'
import { openaiRealtimeToken } from '../src/realtime/token'

describe('OpenAI realtime token adapter', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    vi.restoreAllMocks()
  })

  it('defaults session creation to gpt-realtime-1.5', async () => {
    process.env.OPENAI_API_KEY = 'test-api-key'

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          client_secret: {
            value: 'ephemeral-token',
            expires_at: 1_700_000_000,
          },
          model: 'gpt-realtime-1.5',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    )

    const adapter = openaiRealtimeToken()
    const token = await adapter.generateToken()

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/sessions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'gpt-realtime-1.5' }),
      },
    )
    expect(token).toEqual({
      provider: 'openai',
      token: 'ephemeral-token',
      expiresAt: 1_700_000_000_000,
      config: {
        model: 'gpt-realtime-1.5',
      },
    })
  })
})
