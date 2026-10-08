import { test, expect } from './fixtures'

/** Wire-format check: `claude-haiku-5-5` options reach the Messages request. */
type WireResponse = {
  ok: boolean
  error?: string
  capturedRequests: Array<Record<string, unknown> | null>
}

test.describe('anthropic — claude-haiku-5-5 model options wire format', () => {
  test('the request carries thinking, output_config.effort and the provider tool', async ({
    request,
  }) => {
    const res = await request.post('/api/anthropic-haiku-5-5-wire')
    expect(res.ok()).toBe(true)
    const payload = (await res.json()) as WireResponse
    expect(payload.error).toBeUndefined()
    expect(payload.ok).toBe(true)

    expect(payload.capturedRequests).toHaveLength(1)
    const body = payload.capturedRequests[0]
    expect(body?.['model']).toBe('claude-haiku-5-5')
    expect(body?.['thinking']).toEqual({ type: 'disabled' })
    expect(body?.['output_config']).toEqual({ effort: 'low' })
    expect(body?.['max_tokens']).toBe(1024)
    expect(body?.['tools']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'web_search_20250305' }),
      ]),
    )
  })
})
