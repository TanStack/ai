import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMistralClient } from '../src/utils/client'

const constructorSpy = vi.hoisted(() =>
  vi.fn<(options: Record<string, unknown>) => void>(),
)

vi.mock('@mistralai/mistralai', () => ({
  Mistral: class {
    constructor(options: Record<string, unknown>) {
      constructorSpy(options)
    }
  },
  HTTPClient: class {
    addHook() {}
  },
}))

describe('createMistralClient', () => {
  beforeEach(() => {
    constructorSpy.mockClear()
  })

  it('maps baseURL onto serverURL', () => {
    createMistralClient({ apiKey: 'k', baseURL: 'https://gw.example/mistral' })
    expect(constructorSpy).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'k',
      serverURL: 'https://gw.example/mistral',
    })
  })

  it('keeps serverURL working, baseURL wins', () => {
    createMistralClient({
      apiKey: 'k',
      serverURL: 'https://old.example',
      baseURL: 'https://new.example',
    })
    expect(constructorSpy).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'k',
      serverURL: 'https://new.example',
    })
  })
})
