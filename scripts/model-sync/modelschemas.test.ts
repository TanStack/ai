import { describe, expect, it } from 'vitest'
import { createSyncClient, fetchSyncCatalogs } from './modelschemas'

function clientReturning(respond: (provider: string) => Response) {
  return createSyncClient({
    apiKey: '',
    baseUrl: 'https://modelschemas.test',
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      return respond(url.searchParams.get('provider') ?? '')
    },
  })
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('fetchSyncCatalogs', () => {
  it('fails when modelschemas is down', async () => {
    const client = clientReturning(() =>
      json({ error: { message: 'unavailable' } }, 503),
    )
    await expect(fetchSyncCatalogs(client)).rejects.toThrow('unavailable')
  })

  it('fails on an empty openrouter catalog instead of dropping prices', async () => {
    const client = clientReturning((provider) =>
      json({ models: provider === 'openrouter' ? [] : [{ rawId: 'x' }] }),
    )
    await expect(fetchSyncCatalogs(client)).rejects.toThrow(
      'empty openrouter catalog',
    )
  })

  it('fails on a payload with no models array', async () => {
    const client = clientReturning(() => json({ data: [] }))
    await expect(fetchSyncCatalogs(client)).rejects.toThrow('no models array')
  })

  it('returns each native catalog next to openrouter', async () => {
    const client = clientReturning((provider) =>
      json({ models: [{ rawId: `${provider}-model` }] }),
    )
    const catalogs = await fetchSyncCatalogs(client)
    expect(catalogs.openrouter[0]?.rawId).toBe('openrouter-model')
    expect(catalogs.native.mistral[0]?.rawId).toBe('mistral-model')
  })
})
