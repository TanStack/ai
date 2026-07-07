import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ByokProvider, useByok } from '../src/react'
import { byokHeaders } from '../src/index'
import { localStorageStorage } from '../src/client/storage'
import type { ReactNode } from 'react'

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
      'x-tanstack-byok-openai': 'sk-live-1234',
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

  it('hydrates from a persistent tier on mount', async () => {
    const store = localStorageStorage('test-hydrate')
    store.save({ anthropic: 'sk-ant-9999' })

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ByokProvider storage={store}>{children}</ByokProvider>
    )
    const { result } = renderHook(() => useByok(), { wrapper })

    await waitFor(() => expect(result.current.keys.anthropic).toBe('sk-ant-9999'))
    store.clear()
  })
})
