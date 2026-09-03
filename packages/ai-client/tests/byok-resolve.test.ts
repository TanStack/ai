import { describe, expect, it, vi } from 'vitest'
import {
  prepareResolvedByokHeaders,
  resolveByokProviderIds,
} from '../src/byok/resolve'
import type { ByokClient } from '../src/byok/client'

describe('resolveByokProviderIds', () => {
  it('returns every id a grouped credential needs', () => {
    expect(
      resolveByokProviderIds(() => ['cloudflare-account', 'cloudflare']),
    ).toEqual(['cloudflare-account', 'cloudflare'])
  })

  it('falls back to the body provider when the selector yields nothing', () => {
    expect(resolveByokProviderIds(() => undefined, 'openai')).toEqual([
      'openai',
    ])
    expect(resolveByokProviderIds(undefined, 'bad slug!')).toEqual([])
  })
})

describe('prepareResolvedByokHeaders', () => {
  it('prepares and stamps one header per id, in order', async () => {
    const prepare = vi.fn(async (_id: string) => {})
    const headers = vi.fn((id: string) => ({ [`x-byok-${id}`]: `v-${id}` }))
    const byok = { prepare, headers } as unknown as ByokClient
    await expect(
      prepareResolvedByokHeaders(byok, ['cloudflare-account', 'cloudflare']),
    ).resolves.toEqual({
      'x-byok-cloudflare-account': 'v-cloudflare-account',
      'x-byok-cloudflare': 'v-cloudflare',
    })
    expect(prepare.mock.calls.map((c) => c[0])).toEqual([
      'cloudflare-account',
      'cloudflare',
    ])
  })

  it('throws when no id resolved', async () => {
    const byok = { prepare: vi.fn(), headers: vi.fn() } as unknown as ByokClient
    await expect(prepareResolvedByokHeaders(byok, [])).rejects.toThrow()
  })
})
