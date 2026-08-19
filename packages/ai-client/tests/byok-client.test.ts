import { afterEach, describe, expect, it, vi } from 'vitest'
import { ByokBlockedError } from '@tanstack/ai/byok'
import { defineByok, memoryStorage } from '../src/byok'
import type { KeyringStorage } from '../src/byok'

describe('defineByok memory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('updates and snapshots without exposing the raw key', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', 'sk-abcdefghij')
    const snapshot = byok.getSnapshot()
    expect(snapshot.status.openai).toEqual({ state: 'set', masked: 'ghij' })
    expect(JSON.stringify(snapshot)).not.toContain('sk-abcdefghij')
    expect(byok.headers('openai')).toEqual({ 'x-byok-openai': 'sk-abcdefghij' })
    expect(byok.headers('anthropic')).toEqual({})
  })

  it('update(key) throws when prompt is null', async () => {
    const byok = defineByok()
    await expect(byok.update('sk-abcdefghij')).rejects.toThrow(
      /prompt is null/i,
    )
  })

  it('update(key) writes the prompted provider', async () => {
    const byok = defineByok()
    byok.request('anthropic', 'missing')
    await byok.update('sk-abcdefghij')
    expect(byok.getSnapshot().status.anthropic?.state).toBe('set')
    expect(byok.getSnapshot().prompt).toBe(null)
  })

  it('clear removes one key or all keys', async () => {
    const byok = defineByok()
    await byok.update('openai', 'sk-aaaaaaaaaa')
    await byok.update('grok', 'xai-bbbbbbbb')
    await byok.clear('openai')
    expect(byok.getSnapshot().status.openai).toBeUndefined()
    expect(byok.getSnapshot().status.grok?.state).toBe('set')
    await byok.clear()
    expect(byok.getSnapshot().status.grok).toBeUndefined()
  })

  it('prepare throws ByokBlockedError when the provider is empty and uncovered', async () => {
    const byok = defineByok()
    await expect(byok.prepare('openai')).rejects.toBeInstanceOf(
      ByokBlockedError,
    )
    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'openai',
      reason: 'missing',
    })
  })

  it('prepare does not throw when server coverage is set', async () => {
    const byok = defineByok()
    byok.setServerCoverage({ openai: true })
    await expect(byok.prepare('openai')).resolves.toBeUndefined()
    expect(byok.getSnapshot().prompt).toBe(null)
  })

  it('prepare does not throw when server coverage is true for any slug', async () => {
    const byok = defineByok()
    byok.setServerCoverage(true)
    await expect(byok.prepare('bedrock')).resolves.toBeUndefined()
    await expect(byok.prepare('my-llm')).resolves.toBeUndefined()
  })

  it('accepts slugs that are not first-party adapter names', async () => {
    const byok = defineByok()
    await byok.update('bedrock', 'sk-bedrock-key')
    expect(byok.getSnapshot().status.bedrock).toEqual({
      state: 'set',
      masked: '-key',
    })
    expect(byok.headers('bedrock')).toEqual({
      'x-byok-bedrock': 'sk-bedrock-key',
    })
  })

  it('rejects invalid provider ids', async () => {
    const byok = defineByok()
    await expect(byok.update('OpenAI', 'sk-abcdefghij')).rejects.toThrow(
      /Invalid BYOK provider id/,
    )
    expect(() => byok.headers('OpenAI')).toThrow(/Invalid BYOK provider id/)
  })

  it('validate uses providers[].validate and requires each slug', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const byok = defineByok({
      providers: [
        {
          id: 'openai',
          label: 'OpenAI',
          validate: {
            url: 'https://api.example.test/v1/models',
            headers: (key) => ({ Authorization: `Bearer ${key}` }),
          },
        },
      ],
    })
    await byok.update('openai', 'sk-abcdefghij')
    await expect(byok.validate('openai')).resolves.toEqual({
      state: 'valid',
      masked: 'ghij',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer sk-abcdefghij' },
      }),
    )
  })

  it('validate uses app-supplied config and skips unknown slugs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const byok = defineByok({
      validate: {
        openai: {
          url: 'https://api.example.test/v1/models',
          headers: (key) => ({ Authorization: `Bearer ${key}` }),
        },
      },
    })
    await byok.update('openai', 'sk-abcdefghij')
    await byok.update('bedrock', 'sk-bedrock-key')

    await expect(byok.validate('openai')).resolves.toEqual({
      state: 'valid',
      masked: 'ghij',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer sk-abcdefghij' },
      }),
    )
    await expect(byok.validate('bedrock')).resolves.toEqual({
      state: 'set',
      masked: '-key',
    })
  })

  it('prepare skips the empty check when no provider is given', async () => {
    const byok = defineByok()
    await expect(byok.prepare()).resolves.toBeUndefined()
  })

  it('headers() without a provider emits every present key', async () => {
    const byok = defineByok()
    await byok.update('openai', 'sk-aaaaaaaaaa')
    await byok.update('grok', 'xai-bbbbbbbb')
    expect(byok.headers()).toEqual({
      'x-byok-openai': 'sk-aaaaaaaaaa',
      'x-byok-grok': 'xai-bbbbbbbb',
    })
  })

  it('subscribe fires on update', async () => {
    const byok = defineByok()
    let calls = 0
    const stop = byok.subscribe(() => {
      calls += 1
    })
    await byok.update('openai', 'sk-aaaaaaaaaa')
    expect(calls).toBeGreaterThan(0)
    stop()
  })

  it('getSnapshot returns the same object until state changes', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    const first = byok.getSnapshot()
    expect(byok.getSnapshot()).toBe(first)

    byok.request('openai', 'missing')
    const afterRequest = byok.getSnapshot()
    expect(afterRequest).not.toBe(first)
    expect(byok.getSnapshot()).toBe(afterRequest)

    await byok.update('openai', 'sk-abcdefghij')
    const afterUpdate = byok.getSnapshot()
    expect(afterUpdate).not.toBe(afterRequest)
    expect(byok.getSnapshot()).toBe(afterUpdate)

    await byok.clear('openai')
    const afterClear = byok.getSnapshot()
    expect(afterClear).not.toBe(afterUpdate)
    expect(byok.getSnapshot()).toBe(afterClear)
  })
})

describe('defineByok unlockable update/clear', () => {
  function unlockableStorage(save: KeyringStorage['save']): KeyringStorage {
    return {
      id: 'mock-passkey',
      label: 'Mock passkey',
      persistent: true,
      unlockable: true,
      peek: () => ({ openai: 'aaaa', anthropic: 'bbbb' }),
      load: () => ({
        openai: 'sk-openai-old',
        anthropic: 'sk-anthropic-keep',
      }),
      save,
      clear: () => {},
    }
  }

  it('update loads the locked ring so other providers survive', async () => {
    const save = vi.fn()
    const byok = defineByok({ storage: unlockableStorage(save) })

    await byok.update('openai', 'sk-openai-new')

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        openai: 'sk-openai-new',
        anthropic: 'sk-anthropic-keep',
      }),
    )
  })

  it('clear(provider) loads the locked ring so other providers survive', async () => {
    const save = vi.fn()
    const byok = defineByok({ storage: unlockableStorage(save) })

    await byok.clear('openai')

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropic: 'sk-anthropic-keep',
      }),
    )
    expect(save.mock.calls.at(-1)?.[0]).not.toHaveProperty('openai')
  })
})
