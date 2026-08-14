import { beforeEach, describe, expect, it, vi } from 'vitest'

const quickJSMocks = vi.hoisted(() => {
  const contextError = new Error('context created')
  const releaseVariant = { type: 'sync' }

  return {
    contextError,
    releaseVariant,
    getQuickJS: vi.fn(),
    newVariant: vi.fn(() => releaseVariant),
    newQuickJSWASMModule: vi.fn(async () => ({
      newContext: () => {
        throw contextError
      },
    })),
  }
})

vi.mock('quickjs-emscripten', () => ({
  getQuickJS: quickJSMocks.getQuickJS,
  newQuickJSWASMModule: quickJSMocks.newQuickJSWASMModule,
  newVariant: quickJSMocks.newVariant,
  RELEASE_SYNC: quickJSMocks.releaseVariant,
}))

import { createQuickJSIsolateDriver } from '../src/isolate-driver'

describe('QuickJS WASM loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the shared QuickJS module by default', async () => {
    quickJSMocks.getQuickJS.mockResolvedValue({
      newContext: () => {
        throw quickJSMocks.contextError
      },
    })
    const driver = createQuickJSIsolateDriver()

    await expect(driver.createContext({ bindings: {} })).rejects.toThrow(
      quickJSMocks.contextError,
    )

    expect(quickJSMocks.getQuickJS).toHaveBeenCalledOnce()
    expect(quickJSMocks.newVariant).not.toHaveBeenCalled()
    expect(quickJSMocks.newQuickJSWASMModule).not.toHaveBeenCalled()
  })

  it('loads a custom WASM location once per driver', async () => {
    const wasmLocation = 'https://cdn.example.com/quickjs.wasm'
    const driver = createQuickJSIsolateDriver({ wasmLocation })

    await expect(driver.createContext({ bindings: {} })).rejects.toThrow(
      quickJSMocks.contextError,
    )
    await expect(driver.createContext({ bindings: {} })).rejects.toThrow(
      quickJSMocks.contextError,
    )

    expect(quickJSMocks.getQuickJS).not.toHaveBeenCalled()
    expect(quickJSMocks.newVariant).toHaveBeenCalledOnce()
    expect(quickJSMocks.newVariant).toHaveBeenCalledWith(
      quickJSMocks.releaseVariant,
      { wasmLocation },
    )
    expect(quickJSMocks.newQuickJSWASMModule).toHaveBeenCalledOnce()
  })
})
