import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElevenLabsClient } from '../src/utils/client'

const constructorSpy = vi.hoisted(() =>
  vi.fn<(options: Record<string, unknown>) => void>(),
)

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    constructor(options: Record<string, unknown>) {
      constructorSpy(options)
    }
  },
}))

describe('createElevenLabsClient', () => {
  beforeEach(() => {
    constructorSpy.mockClear()
  })

  it('maps baseURL and defaultHeaders onto the SDK options', () => {
    createElevenLabsClient({
      apiKey: 'k',
      baseURL: 'https://gw.example/elevenlabs',
      defaultHeaders: { 'X-Gateway': 'yes' },
    })
    expect(constructorSpy).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'k',
      baseUrl: 'https://gw.example/elevenlabs',
      headers: { 'X-Gateway': 'yes' },
    })
  })

  it('keeps baseUrl and headers working, normalized names win', () => {
    createElevenLabsClient({
      apiKey: 'k',
      baseUrl: 'https://old.example',
      headers: { a: '1', b: 'old' },
      baseURL: 'https://new.example',
      defaultHeaders: { b: 'new' },
    })
    expect(constructorSpy).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'k',
      baseUrl: 'https://new.example',
      headers: { b: 'new' },
    })
  })
})
