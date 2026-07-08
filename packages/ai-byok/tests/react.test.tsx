import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ByokProvider, useByok } from '../src/react'
import { byokHeaders } from '../src/index'
import type { ReactNode } from 'react'
import type { Keyring } from '../src/index'
import type { KeyringStorage } from '../src/index'

/** In-memory stand-in for an unlockable (passkey-like) storage, no WebAuthn. */
function fakeEncryptedStorage(initial: Keyring): KeyringStorage {
  let data: Keyring = { ...initial }
  return {
    id: 'fake',
    label: 'Fake encrypted',
    persistent: true,
    unlockable: true,
    peek: () =>
      Object.fromEntries(
        Object.entries(data)
          .filter(([, key]) => Boolean(key))
          .map(([provider, key]) => [provider, key.slice(-4)]),
      ),
    load: () => ({ ...data }),
    save: (keys) => {
      data = { ...keys }
    },
    clear: () => {
      data = {}
    },
  }
}

describe('useByok', () => {
  it('throws outside a provider', () => {
    expect(() => renderHook(() => useByok())).toThrow(/ByokProvider/)
  })

  it('sets, exposes for headers, and clears keys', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ByokProvider>{children}</ByokProvider>
    )
    const { result } = renderHook(() => useByok(), { wrapper })

    await act(async () => {
      await result.current.setKey('openai', 'sk-live-1234')
    })
    expect(byokHeaders(result.current.keys)).toEqual({
      'x-byok-openai': 'sk-live-1234',
    })
    // Only the last 4 are exposed as status.
    expect(result.current.status.openai).toEqual({
      state: 'set',
      masked: '…1234',
    })

    await act(async () => {
      await result.current.clearKey('openai')
    })
    expect(result.current.keys.openai).toBeUndefined()
  })

  it('surfaces saved keys as locked after refresh, then unlock reveals them', async () => {
    const store = fakeEncryptedStorage({ anthropic: 'sk-ant-9999' })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ByokProvider storage={store}>{children}</ByokProvider>
    )
    const { result } = renderHook(() => useByok(), { wrapper })

    // Peek (no decryption) surfaces presence + last-4 as a locked status, but
    // the key itself isn't available until unlock.
    await waitFor(() =>
      expect(result.current.status.anthropic).toEqual({
        state: 'locked',
        masked: '…9999',
      }),
    )
    expect(result.current.locked).toBe(true)
    expect(result.current.keys.anthropic).toBeUndefined()

    await act(async () => {
      await result.current.unlock()
    })
    expect(result.current.locked).toBe(false)
    expect(result.current.keys.anthropic).toBe('sk-ant-9999')
    expect(result.current.status.anthropic).toEqual({
      state: 'set',
      masked: '…9999',
    })
  })
})
