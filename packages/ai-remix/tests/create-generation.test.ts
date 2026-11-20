import { EventType } from '@tanstack/ai/client'
import { describe, expect, it, vi } from 'vitest'
import { createGenerate3dModel } from '../src/create-generate-3d-model'
import { createGenerateImage } from '../src/create-generate-image'
import { createGeneration } from '../src/create-generation'
import type { ImageGenerationResult, Model3dResult } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai/client'

function createMockHandle() {
  const controller = new AbortController()
  return {
    update: vi.fn(async () => new AbortController().signal),
    signal: controller.signal,
  }
}

function createConnection(chunks: Array<StreamChunk>) {
  return {
    async *connect() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function runChunk(type: EventType.RUN_STARTED | EventType.RUN_FINISHED) {
  return { type, runId: 'run-1', threadId: 'thread-1', timestamp: 1 }
}

function customChunk(name: string, value: unknown): StreamChunk {
  return { type: EventType.CUSTOM, name, value, timestamp: 1 }
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
      threadId: 'thread-1',
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
    expect(() => createGeneration(handle, { threadId: 'thread-1' })).toThrow(
      'createGeneration requires either a connection or fetcher option',
    )
  })
})

describe('createGenerate3dModel', () => {
  it('reports each poll as progress, then stores the finished model', async () => {
    const handle = createMockHandle()
    const model: Model3dResult = {
      jobId: 'job-1',
      url: 'https://example.com/fox.glb',
      format: 'glb',
      previewImageUrl: 'https://example.com/fox.png',
    }
    const progress: Array<[number, string | undefined]> = []

    const gen = createGenerate3dModel(handle, {
      threadId: 'thread-1',
      connection: createConnection([
        runChunk(EventType.RUN_STARTED),
        customChunk('generation:progress', {
          progress: 10,
          message: 'pending',
        }),
        customChunk('generation:progress', {
          progress: 60,
          message: 'processing',
        }),
        customChunk('generation:result', model),
        runChunk(EventType.RUN_FINISHED),
      ]),
      onProgress: (value, message) => progress.push([value, message]),
    })

    await gen.generate({ prompt: 'A low-poly fox' })

    expect(progress).toEqual([
      [10, 'pending'],
      [60, 'processing'],
    ])
    expect(gen.result).toEqual({
      jobId: 'job-1',
      url: 'https://example.com/fox.glb',
      format: 'glb',
      previewImageUrl: 'https://example.com/fox.png',
    })
    expect(gen.status).toBe('success')
    expect(gen.error).toBeUndefined()
  })

  it('surfaces a failed provider job as an error with no result', async () => {
    const handle = createMockHandle()
    const onError = vi.fn()

    const gen = createGenerate3dModel(handle, {
      threadId: 'thread-1',
      connection: createConnection([
        runChunk(EventType.RUN_STARTED),
        customChunk('generation:progress', {
          progress: 10,
          message: 'pending',
        }),
        {
          type: EventType.RUN_ERROR,
          message: 'Mesh generation failed',
          timestamp: 1,
        },
      ]),
      onError,
    })

    await gen.generate({ prompt: 'A low-poly fox' })

    expect(gen.result).toBeNull()
    expect(gen.status).toBe('error')
    expect(gen.error?.message).toBe('Mesh generation failed')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Mesh generation failed' }),
    )
  })
})
