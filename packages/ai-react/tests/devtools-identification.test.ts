import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerateImage } from '../src/use-generate-image'
import { useGeneration } from '../src/use-generation'

const { captureMetadata } = vi.hoisted(() => ({
  captureMetadata: vi.fn(),
}))

vi.mock('@tanstack/ai-client/devtools', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/ai-client/devtools')>()
  const createGenerationDevtoolsBridge: typeof actual.createGenerationDevtoolsBridge =
    (options) => {
      captureMetadata(options.metadata)
      return actual.createGenerationDevtoolsBridge(options)
    }

  return {
    ...actual,
    createGenerationDevtoolsBridge,
  }
})

describe('React generation devtools identification', () => {
  beforeEach(() => {
    captureMetadata.mockClear()
  })

  it('keeps useGeneration identity while preserving caller metadata', () => {
    const devtools = {
      name: 'Custom generation',
      framework: 'vue',
      hookName: 'somethingElse',
      outputKind: 'image' as const,
    }

    renderHook(() =>
      useGeneration({
        fetcher: async () => ({ id: 'result-1' }),
        devtools,
      }),
    )

    expect(captureMetadata).toHaveBeenLastCalledWith({
      name: 'Custom generation',
      outputKind: 'image',
      framework: 'react',
      hookName: 'useGeneration',
    })
  })

  it('keeps specialized hook identity', () => {
    renderHook(() =>
      useGenerateImage({
        fetcher: async () => ({
          id: 'image-1',
          images: [],
          model: 'test-model',
        }),
        devtools: { name: 'Image Studio' },
      }),
    )

    expect(captureMetadata).toHaveBeenLastCalledWith({
      name: 'Image Studio',
      framework: 'react',
      hookName: 'useGenerateImage',
      outputKind: 'image',
    })
  })
})
