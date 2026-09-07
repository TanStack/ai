import { afterEach, expect, it, vi } from 'vitest'
import { passkeyStorage } from '../src/byok/passkey'

afterEach(() => vi.unstubAllGlobals())

function mockBrowser(
  existing: unknown,
  registrationConsumesActivation = false,
) {
  const activation = { isActive: true }
  class Passkey {
    rawId = new Uint8Array([1, 2, 3]).buffer
    constructor(private registration: boolean) {}
    getClientExtensionResults() {
      return this.registration
        ? { prf: { enabled: true } }
        : { prf: { results: { first: new Uint8Array(32) } } }
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
