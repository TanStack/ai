import { test, expect } from './fixtures'

/**
 * Workers AI returns TypeSafe Jev output wrapped in `{ state, result }`, and
 * third-party models run on REST `/ai/run` with a `{ model, input }` body.
 * `/api/cloudflare-evaluate-wire` runs `decide()` over a fake `env.AI` and
 * over REST with a fake fetch.
 */
test.describe('cloudflare -- evaluate', () => {
  test('decide() reads the Jev run result over the binding and REST', async ({
    request,
  }) => {
    const response = await request.post('/api/cloudflare-evaluate-wire')
    expect(response.ok()).toBe(true)
    const result = await response.json()
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    const expected = {
      shipped: { type: 'boolean', value: true, probability: 0.99 },
      meta: {
        model: 'jev-1.13.0',
        usage: { promptTokens: 397, completionTokens: 49, totalTokens: 446 },
      },
    }
    expect(result.viaBinding).toMatchObject(expected)
    expect(result.viaRest).toMatchObject(expected)

    expect(result.restUrl).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc/ai/run',
    )
    expect(result.restBody).toMatchObject({
      model: 'typesafe/jev',
      input: { state: { order_id: 'ORD-0001', status: 'shipped' } },
    })
  })
})
