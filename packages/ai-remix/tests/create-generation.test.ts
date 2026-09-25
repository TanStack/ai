import { describe, expect, it, vi } from 'vitest'
import { createGenerateImage } from '../src/create-generate-image'
import { createGeneration } from '../src/create-generation'
import type { ImageGenerationResult } from '@tanstack/ai'

function createMockHandle() {
  const controller = new AbortController()
  return {
    id: 'handle-1',
    update: vi.fn(async () => new AbortController().signal),
    signal: controller.signal,
  }
}

describe('createGenerateImage', () => {
  it('sets result from a fetcher and updates the handle', async () => {
    const handle = createMockHandle()
    const mockResult: ImageGenerationResult = {
      id: 'img-1',
      images: [{ url: 'https://example.com/x.png' }],
      model: 'dall-e-3',
    }

    const gen = createGenerateImage(handle, {
      fetcher: async () => mockResult,
    })

    await gen.generate({ prompt: 'A sunset' })

    expect(gen.result).toEqual(mockResult)
    expect(handle.update).toHaveBeenCalled()
  })
})

describe('createGeneration', () => {
  it('throws when connection and fetcher are both missing', () => {
    const handle = createMockHandle()
    expect(() => createGeneration(handle, {})).toThrow(
      'createGeneration requires either a connection or fetcher option',
    )
  })
})
