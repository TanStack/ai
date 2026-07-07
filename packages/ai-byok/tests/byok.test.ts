import { describe, expect, it } from 'vitest'
import { byokHeaders, byokHeaderName } from '../src/index'
import {
  byokMissing,
  getByokKey,
  isByokMissingBody,
  maskKey,
  scrubSecrets,
} from '../src/server'
import { localStorageStorage, memoryStorage } from '../src/client/storage'

describe('byokHeaders', () => {
  it('emits one header per present provider and skips empty keys', () => {
    const headers = byokHeaders({ openai: 'sk-abc', anthropic: '', gemini: 'g-1' })
    expect(headers).toEqual({
      'x-tanstack-byok-openai': 'sk-abc',
      'x-tanstack-byok-gemini': 'g-1',
    })
  })
})

describe('getByokKey', () => {
  it('reads the key from the header, returns null when absent', () => {
    const request = new Request('https://x.test', {
      headers: { [byokHeaderName('openai')]: 'sk-live' },
    })
    expect(getByokKey(request, 'openai')).toBe('sk-live')
    expect(getByokKey(request, 'anthropic')).toBeNull()
  })
})

describe('byokMissing', () => {
  it('returns a typed 401 the client can detect', async () => {
    const response = byokMissing('openai')
    expect(response.status).toBe(401)
    const body: unknown = await response.json()
    expect(isByokMissingBody(body)).toBe(true)
    if (isByokMissingBody(body)) {
      expect(body.error.provider).toBe('openai')
    }
  })
})

describe('scrub', () => {
  it('masks a key down to the last 4 and redacts occurrences', () => {
    expect(maskKey('sk-supersecret1234')).toBe('…1234')
    expect(scrubSecrets('failed with sk-supersecret1234!', ['sk-supersecret1234'])).toBe(
      'failed with …1234!',
    )
  })
})

describe('storage tiers', () => {
  it('memory tier persists nothing', () => {
    const store = memoryStorage()
    store.save({ openai: 'sk-1' })
    expect(store.load()).toEqual({})
    expect(store.persistent).toBe(false)
  })

  it('localStorage tier round-trips and clears', () => {
    const store = localStorageStorage('test-byok')
    store.save({ openai: 'sk-1' })
    expect(store.load()).toEqual({ openai: 'sk-1' })
    store.clear()
    expect(store.load()).toEqual({})
  })
})
