import { afterEach, describe, expect, it, vi } from 'vitest'
import { ByokBlockedError, defineByokProvider } from '@tanstack/ai/byok'
import { defineByok, memoryStorage } from '../src/byok'
import type { KeyringStorage } from '../src/byok'

describe('defineByok memory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isolates and freezes nested snapshot state', async () => {
    const byok = defineByok()
    await byok.update('openai', 'sk-abcdefghij')
    const snapshot = byok.getSnapshot()

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.status)).toBe(true)
    expect(Object.isFrozen(snapshot.status.openai)).toBe(true)
    Reflect.set(snapshot.status.openai!, 'masked', 'leak')
    expect(byok.getSnapshot().status.openai).toEqual({
      state: 'set',
      masked: 'ghij',
    })
  })

  it('uses Set subscription behavior', () => {
    const byok = defineByok()
    const listener = vi.fn()
    const first = byok.subscribe(listener)
    byok.subscribe(listener)

    byok.request('openai', 'missing')
    expect(listener).toHaveBeenCalledTimes(1)
    first()
    byok.request('openai', 'missing')
    expect(listener).toHaveBeenCalledTimes(1)
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

  it('sends and prepares companion credentials with the provider', async () => {
    const account = defineByokProvider({ id: 'acme-account', label: 'Account' })
    const token = defineByokProvider({
      id: 'acme',
      label: 'Token',
      with: [account],
    })
    const byok = defineByok({ providers: [token, account] })
    await byok.update('acme', 'tok-abcdefghij')
    await expect(byok.prepare('acme')).rejects.toBeInstanceOf(ByokBlockedError)
    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'acme-account',
      reason: 'missing',
    })
    await byok.update('acme-account', 'acct-1')
    await byok.prepare('acme')
    expect(byok.headers('acme')).toEqual({
      'x-byok-acme': 'tok-abcdefghij',
      'x-byok-acme-account': 'acct-1',
    })
  })

  it('update(key) throws when prompt is null', async () => {
    const byok = defineByok()
    await expect(byok.update('sk-abcdefghij')).rejects.toThrow(
      /prompt is null/i,
    )
  })

  it('rejects empty or whitespace keys', async () => {
    const byok = defineByok()
    await expect(byok.update('openai', '   ')).rejects.toThrow(/non-empty/i)
    expect(byok.getSnapshot().status.openai).toBeUndefined()
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

describe('defineByok persist-then-emit', () => {
  it('does not mark a key saved when storage.save throws', async () => {
    const storage: KeyringStorage = {
      id: 'failing',
      label: 'Failing',
      persistent: true,
      load: () => ({}),
      save: async () => {
        throw new Error('quota')
      },
      clear: () => {},
    }
    const byok = defineByok({ storage })
    await expect(byok.update('openai', 'sk-abcdefghij')).rejects.toThrow(
      /quota/,
    )
    expect(byok.headers('openai')).toEqual({})
    expect(byok.getSnapshot().status.openai).toEqual({
      state: 'error',
      masked: 'ghij',
      message: 'quota',
    })
    expect(JSON.stringify(byok.getSnapshot())).not.toContain('sk-abcdefghij')
  })

  it('does not clear keys when storage.clear throws', async () => {
    const storage: KeyringStorage = {
      id: 'failing-clear',
      label: 'Failing clear',
      persistent: true,
      load: () => ({}),
      save: () => {},
      clear: async () => {
        throw new Error('idb blocked')
      },
    }
    const byok = defineByok({ storage })
    await byok.update('openai', 'sk-abcdefghij')
    await expect(byok.clear()).rejects.toThrow(/idb blocked/)
    expect(byok.headers('openai')).toEqual({
      'x-byok-openai': 'sk-abcdefghij',
    })
  })
})

describe('defineByok locked snapshot', () => {
  it('peeks last-4 as locked and omits headers until unlock', async () => {
    const storage: KeyringStorage = {
      id: 'mock-passkey',
      label: 'Mock passkey',
      persistent: true,
      unlockable: true,
      peek: () => ({ openai: 'ghij' }),
      load: () => ({ openai: 'sk-abcdefghij' }),
      save: () => {},
      clear: () => {},
    }
    const byok = defineByok({ storage })
    await byok.ready()

    expect(byok.getSnapshot().locked).toBe(true)
    expect(byok.getSnapshot().status.openai).toEqual({
      state: 'locked',
      masked: 'ghij',
    })
    expect(byok.headers('openai')).toEqual({})
    expect(JSON.stringify(byok.getSnapshot())).not.toContain('sk-abcdefghij')

    await byok.unlock()
    expect(byok.getSnapshot().locked).toBe(false)
    expect(byok.headers('openai')).toEqual({
      'x-byok-openai': 'sk-abcdefghij',
    })
  })

  it('maps a cancelled unlock to ByokBlockedError locked', async () => {
    const storage: KeyringStorage = {
      id: 'mock-passkey',
      label: 'Mock passkey',
      persistent: true,
      unlockable: true,
      peek: () => ({ openai: 'ghij' }),
      load: async () => {
        throw new Error('Passkey unlock was cancelled')
      },
      save: () => {},
      clear: () => {},
    }
    const byok = defineByok({ storage })
    await byok.ready()
    await expect(byok.unlock()).rejects.toBeInstanceOf(ByokBlockedError)
    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'openai',
      reason: 'locked',
    })
    expect(byok.getSnapshot().locked).toBe(true)
    expect(byok.headers('openai')).toEqual({})
  })

  it('records peek failures on the snapshot', async () => {
    const storage: KeyringStorage = {
      id: 'mock-passkey',
      label: 'Mock passkey',
      persistent: true,
      unlockable: true,
      peek: async () => {
        throw new Error('IndexedDB blocked')
      },
      load: () => ({}),
      save: () => {},
      clear: () => {},
    }
    const byok = defineByok({ storage })
    await byok.ready()
    expect(byok.getSnapshot().storageError).toBe('IndexedDB blocked')
    expect(byok.getSnapshot().locked).toBe(true)
  })
})
