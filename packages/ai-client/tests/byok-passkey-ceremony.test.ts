import { afterEach, expect, it, vi } from 'vitest'
import { passkeyStorage } from '../src/byok/passkey'

afterEach(() => vi.unstubAllGlobals())

function mockBrowser(
  existing: unknown,
  registrationConsumesActivation = false,
  prfOutput: unknown = new Uint8Array(32),
  registrationHasResult = false,
) {
  const activation = { isActive: true }
  class Passkey {
    rawId = new Uint8Array([1, 2, 3]).buffer
    constructor(private registration: boolean) {}
    getClientExtensionResults() {
      return this.registration && !registrationHasResult
        ? { prf: { enabled: true } }
        : { prf: { enabled: true, results: { first: prfOutput } } }
    }
  }
  const create = vi.fn(async () => {
    if (registrationConsumesActivation) activation.isActive = false
    return new Passkey(true)
  })
  const get = vi.fn(async () => new Passkey(false))
  const put = vi.fn()
  vi.stubGlobal('PublicKeyCredential', Passkey)
  vi.stubGlobal('navigator', {
    userActivation: activation,
    credentials: { create, get },
  })
  vi.stubGlobal('indexedDB', {
    open() {
      const request = {
        onsuccess: () => {},
        result: {
          transaction() {
            const tx = {
              oncomplete: () => {},
              objectStore() {
                return {
                  get() {
                    const read = { result: existing, onsuccess: () => {} }
                    queueMicrotask(() => read.onsuccess())
                    return read
                  },
                  put(record: unknown) {
                    put(record)
                    queueMicrotask(() => tx.oncomplete())
                  },
                }
              },
            }
            return tx
          },
        },
      }
      queueMicrotask(() => request.onsuccess())
      return request
    },
  })
  return { activation, create, get, put }
}

it('rejects a saved-key unlock without activation before opening a ceremony', async () => {
  const { activation, get } = mockBrowser({
    credentialId: new Uint8Array([1]).buffer,
    salt: new Uint8Array(32).buffer,
  })
  activation.isActive = false
  await expect(passkeyStorage().load()).rejects.toThrow(/fresh user action/)
  expect(get).not.toHaveBeenCalled()
})

it('allows the PRF follow-up after registration consumes activation', async () => {
  const { create, get, put } = mockBrowser(null, true)
  await passkeyStorage().save({ openai: 'sk-test-secret' })
  expect(create).toHaveBeenCalledTimes(1)
  expect(get).toHaveBeenCalledTimes(1)
  expect(put).toHaveBeenCalledTimes(1)
})

it.each([true, false])(
  'saves array PRF bytes and unlocks with native bytes (registration result: %s)',
  async (registrationHasResult) => {
    const bytes = Array.from({ length: 32 }, (_, i) => (i === 31 ? 255 : i))
    const { put } = mockBrowser(null, false, bytes, registrationHasResult)
    await passkeyStorage().save({ openai: 'sk-test-secret' })
    const record = put.mock.calls[0]?.[0]
    expect(record).toBeDefined()
    mockBrowser(record, false, new Uint8Array(bytes))
    await expect(passkeyStorage().load()).resolves.toEqual({
      openai: 'sk-test-secret',
    })
    mockBrowser(record, false, bytes)
    await expect(passkeyStorage().load()).resolves.toEqual({
      openai: 'sk-test-secret',
    })
  },
)

it.each(
  [
    [],
    Array(32),
    Array(31).fill(0),
    Array(33).fill(0),
    Array(32).fill(-1),
    Array(32).fill(256),
    Array(32).fill(0.5),
    Array(32).fill('1'),
    Array(32).fill(NaN),
  ].map((value) => [value]),
)('rejects invalid array PRF output %# before saving', async (value) => {
  const { put } = mockBrowser(null, false, value, true)
  await expect(
    passkeyStorage().save({ openai: 'sk-test-secret' }),
  ).rejects.toThrow('Invalid passkey PRF byte array')
  expect(put).not.toHaveBeenCalled()
})
