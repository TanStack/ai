import { describe, expect, it, vi } from 'vitest'
import { falFiles } from '../src/adapters/files'
import type { FilesAdapter } from '@tanstack/ai/adapters'

const mocks = vi.hoisted(() => {
  return {
    storageUpload: vi.fn(),
    config: vi.fn(),
  }
})

vi.mock('@fal-ai/client', () => {
  return {
    fal: {
      config: mocks.config,
      storage: { upload: mocks.storageUpload },
    },
  }
})

describe('fal files adapter', () => {
  it('returns the storage URL as both id and uri', async () => {
    mocks.storageUpload.mockResolvedValueOnce('https://fal.media/files/x.png')
    const files = falFiles({ apiKey: 'k' })

    const handle = await files.upload({ data: 'AAAA', mimeType: 'image/png' })

    expect(handle).toEqual({
      id: 'https://fal.media/files/x.png',
      provider: 'fal',
      uri: 'https://fal.media/files/x.png',
      mimeType: 'image/png',
    })
  })

  it('passes the configured lifecycle through, including 0 seconds', async () => {
    mocks.storageUpload.mockResolvedValue('https://fal.media/files/x.png')

    await falFiles({ apiKey: 'k', expiresIn: '7d' }).upload({
      data: 'AAAA',
      mimeType: 'image/png',
    })
    expect(mocks.storageUpload.mock.calls.at(-1)![1]).toEqual({
      lifecycle: { expiresIn: '7d' },
    })

    await falFiles({ apiKey: 'k', expiresIn: 0 }).upload({
      data: 'AAAA',
      mimeType: 'image/png',
    })
    expect(mocks.storageUpload.mock.calls.at(-1)![1]).toEqual({
      lifecycle: { expiresIn: 0 },
    })

    await falFiles({ apiKey: 'k' }).upload({
      data: 'AAAA',
      mimeType: 'image/png',
    })
    expect(mocks.storageUpload.mock.calls.at(-1)![1]).toBeUndefined()
  })

  it('defines no get/delete — fal storage is upload-only', () => {
    // Widen to the interface (where get/delete are optional) — the class
    // deliberately doesn't declare them at all.
    const files: FilesAdapter<'fal'> = falFiles({ apiKey: 'k' })
    expect(files.get).toBeUndefined()
    expect(files.delete).toBeUndefined()
  })
})
