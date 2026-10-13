import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  byokHeaderName,
  defineByokProvider,
  isKeyedAdapter,
  keyedAdapter,
  keyedAdapters,
} from '../src/byok'
import { getByokKey, keyedAdapterFromRequest } from '../src/byok/server'
import { createMockAdapter } from './test-utils'

const acme = defineByokProvider({ id: 'acme', label: 'Acme' })

/** A made-up adapter that keeps the key it was built with. */
const acmeImage = keyedAdapter(acme, (key) => ({ kind: 'image' as const, key }))

describe('keyedAdapter', () => {
  it('marks the value so a host can tell it from a plain adapter', () => {
    const { adapter } = createMockAdapter({})
    expect(isKeyedAdapter(acmeImage)).toBe(true)
    expect(acmeImage.provider).toBe(acme)
    expect(isKeyedAdapter(adapter)).toBe(false)
    expect(isKeyedAdapter(null)).toBe(false)
  })

  it('throws on an invalid provider id', () => {
    expect(() => keyedAdapter('Acme', (key) => key)).toThrow(
      'Invalid BYOK provider id: Acme',
    )
  })

  it('builds the adapter with the key a host reads from the request', () => {
    const request = new Request('http://localhost/api/chat', {
      headers: { [byokHeaderName('acme')]: 'sk-user' },
    })
    const key = getByokKey(request, acmeImage.provider)
    if (key === null) throw new Error('no key')

    const built = acmeImage.create(key)
    expect(built).toEqual({ kind: 'image', key: 'sk-user' })
    expectTypeOf(built).toEqualTypeOf<{ kind: 'image'; key: string }>()
  })
})

describe('keyedAdapters', () => {
  const withEnv = defineByokProvider({
    id: 'envy',
    label: 'Envy',
    env: 'ENVY_API_KEY',
  })
  const models = keyedAdapters({
    acme: (key) => ({ kind: 'acme' as const, key }),
    envy: keyedAdapter(withEnv, (key) => ({ kind: 'envy' as const, key })),
  })
  const requestWith = (headers: Record<string, string>) =>
    new Request('http://localhost/api/chat', { headers })

  afterEach(() => vi.unstubAllEnvs())

  it('makes a keyed adapter per provider, keyed by the map key', () => {
    expect(isKeyedAdapter(models.acme)).toBe(true)
    expect(models.acme.provider).toBe('acme')
    expect(models.envy.provider).toBe(withEnv)
  })

  it('throws when an entry is a keyed adapter for another provider', () => {
    expect(() =>
      keyedAdapters({ acme: keyedAdapter(withEnv, (key) => key) }),
    ).toThrow('the "acme" entry is a keyed adapter for "envy"')
  })

  it('picks the provider whose key the user sent', () => {
    vi.stubEnv('ENVY_API_KEY', 'sk-env')
    const built = keyedAdapterFromRequest(
      requestWith({ [byokHeaderName('acme')]: 'sk-user' }),
      models,
    )
    expect(built).toEqual({ kind: 'acme', key: 'sk-user' })
    expectTypeOf(built).toEqualTypeOf<
      { kind: 'acme'; key: string } | { kind: 'envy'; key: string } | null
    >()
  })

  it('falls back to the env names of a descriptor entry', () => {
    vi.stubEnv('ENVY_API_KEY', 'sk-env')
    expect(keyedAdapterFromRequest(requestWith({}), models)).toEqual({
      kind: 'envy',
      key: 'sk-env',
    })
  })

  it('gives null when no provider has a key', () => {
    vi.stubEnv('ENVY_API_KEY', '')
    expect(keyedAdapterFromRequest(requestWith({}), models)).toBeNull()
  })

  it('takes a list of keyed adapters too', () => {
    const built = keyedAdapterFromRequest(
      requestWith({ [byokHeaderName('acme')]: 'sk-user' }),
      [acmeImage],
    )
    expect(built).toEqual({ kind: 'image', key: 'sk-user' })
  })
})
