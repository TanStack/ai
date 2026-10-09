import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  byokHeaderName,
  defineByokProvider,
  isKeyedAdapter,
  keyedAdapter,
} from '../src/byok'
import { getByokKey } from '../src/byok/server'
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
