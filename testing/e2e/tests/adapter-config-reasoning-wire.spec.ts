import { test, expect } from './fixtures'

/**
 * Wire-format verification for the `reasoning` config of an adapter.
 *
 * `/api/adapter-config-reasoning-wire` runs `chat()` on
 * `anthropic/claude-sonnet-4.6`, a gateway id that the Anthropic adapter does
 * not list. With the record's reasoning data in the config, the request
 * carries a thinking budget. With `reasoning: false`, it carries none.
 */
type WireResponse = {
  ok: boolean
  error?: string
  capturedRequests: Array<Record<string, unknown> | null>
}

test.describe('adapter reasoning config wire format', () => {
  test('a model id outside the adapter list gets thinking from the config', async ({
    request,
  }) => {
    const res = await request.post('/api/adapter-config-reasoning-wire')
    expect(res.ok()).toBe(true)
    const payload = (await res.json()) as WireResponse
    expect(payload.error).toBeUndefined()
    expect(payload.ok).toBe(true)

    expect(payload.capturedRequests).toHaveLength(2)
    const [withRecord, withFalse] = payload.capturedRequests
    expect(withRecord?.['model']).toBe('anthropic/claude-sonnet-4.6')
    expect(withRecord?.['thinking']).toEqual({
      type: 'enabled',
      budget_tokens: 16384,
    })
    expect(withFalse).not.toHaveProperty('thinking')
    expect(withFalse).not.toHaveProperty('output_config')
  })
})
