import { test, expect } from './fixtures'

/**
 * A lone UTF-16 surrogate in a prompt, a tool result, or the arguments of a
 * replayed tool call went to the provider unchanged. Providers reject that
 * request as invalid JSON / UTF-8. `/api/lone-surrogates-wire` returns the
 * raw Anthropic request body.
 */
test.describe('lone UTF-16 surrogates', () => {
  test('are removed from the request body and valid pairs stay', async ({
    request,
  }) => {
    const response = await request.post('/api/lone-surrogates-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      requestBodies: Array<string>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.requestBodies).toHaveLength(1)
    const body = result.requestBodies[0]!
    // `JSON.stringify` writes a lone surrogate as a `\udXXX` escape.
    expect(body).not.toMatch(/\\ud[89a-f][0-9a-f]{2}/i)
    expect(body).toContain('abc😀')
    expect(body).toContain('"input":{"q":"ab"}')
  })
})
