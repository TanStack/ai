import { describe, expect, it } from 'vitest'
import { createSyncClient, fetchSyncCatalogs } from './modelschemas'

function clientReturning(respond: (provider: string) => Response) {
  return createSyncClient({
    apiKey: '',
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      return respond(url.searchParams.get('provider') ?? '')
    },
  })
}

const row = (rawId: string) => ({ rawId, firstSeenAt: 1, deprecatedAt: null })

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
      json({ models: provider === 'openrouter' ? [] : [row('x')] }),
    )
    await expect(fetchSyncCatalogs(client)).rejects.toThrow(
      'empty openrouter catalog',
    )
  })

  it('fails on an empty native catalog instead of reporting no new models', async () => {
    const client = clientReturning((provider) =>
      json({ models: provider === 'groq' ? [] : [row('x')] }),
    )
    await expect(fetchSyncCatalogs(client)).rejects.toThrow(
      'empty groq catalog',
    )
  })

  it('fails when one native provider errors', async () => {
    const client = clientReturning((provider) =>
      provider === 'mistral'
        ? json({ error: { message: 'mistral down' } }, 500)
        : json({ models: [row('x')] }),
    )
    await expect(fetchSyncCatalogs(client)).rejects.toThrow('mistral down')
  })

  it('fails on a payload with no models array', async () => {
    const client = clientReturning(() => json({ data: [] }))
    await expect(fetchSyncCatalogs(client)).rejects.toThrow('no models array')
  })

  it('returns each native catalog next to openrouter', async () => {
    const client = clientReturning((provider) =>
      json({ models: [row(`${provider}-model`)] }),
    )
    const catalogs = await fetchSyncCatalogs(client)
    expect(catalogs.openrouter[0]?.rawId).toBe('openrouter-model')
    expect(catalogs.native.mistral[0]?.rawId).toBe('mistral-model')
  })
})
