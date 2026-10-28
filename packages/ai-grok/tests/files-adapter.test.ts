import { describe, expect, it, vi } from 'vitest'
import { GrokFilesAdapter } from '../src/adapters/files'

const mocks = vi.hoisted(() => ({
  filesCreate: vi.fn(),
  filesRetrieve: vi.fn(),
  filesDelete: vi.fn(),
  post: vi.fn(),
}))

vi.mock('openai', () => ({
  OpenAI: class {
    files = {
      create: mocks.filesCreate,
      retrieve: mocks.filesRetrieve,
      delete: mocks.filesDelete,
    }
    post = mocks.post
    constructor(_: unknown) {}
  },
  toFile: async (blob: Blob) => blob,
}))

function adapter(expiresAfter?: number) {
  return new GrokFilesAdapter({
    apiKey: 'k',
    ...(expiresAfter !== undefined ? { expiresAfter } : {}),
  })
}

describe('GrokFilesAdapter', () => {
  it('uploads, mints a public URL, and uses that URL as the wire reference', async () => {
    mocks.filesCreate.mockResolvedValueOnce({
      id: 'file_abc123',
      bytes: 2048,
      filename: 'chart.png',
    })
    mocks.post.mockResolvedValueOnce({
      public_url: 'https://files-cdn.x.ai/tok/file_abc123.png',
      expires_at: 1_755_600_000,
    })

    const handle = await adapter().upload({
      data: 'AAAA',
      mimeType: 'image/png',
      filename: 'chart.png',
    })

    // `id` is the lifecycle currency; `uri` is what goes on the wire.
    expect(handle).toEqual({
      id: 'file_abc123',
      provider: 'grok',
      uri: 'https://files-cdn.x.ai/tok/file_abc123.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      filename: 'chart.png',
      expiresAt: 1_755_600_000 * 1000,
    })
    expect(mocks.filesCreate.mock.calls[0]![0].purpose).toBe('assistants')
    expect(mocks.post.mock.calls[0]![0]).toBe('/files/file_abc123/public-url')
  })

  it('sends expires_after only when configured', async () => {
    mocks.filesCreate.mockResolvedValue({ id: 'file_1' })
    mocks.post.mockResolvedValue({ public_url: 'https://files-cdn.x.ai/u/1' })

    await adapter().upload(new Blob(['x']))
    expect(mocks.post.mock.calls.at(-1)![1].body).toEqual({})

    await adapter(86_400).upload(new Blob(['x']))
    expect(mocks.post.mock.calls.at(-1)![1].body).toEqual({
      expires_after: 86_400,
    })
  })

  it('rejects an expiresAfter outside the range xAI accepts', () => {
    // xAI allows one hour to thirty days.
    expect(() => adapter(60)).toThrow(/expiresAfter/)
    expect(() => adapter(2_592_001)).toThrow(/expiresAfter/)
    expect(() => adapter(3_600)).not.toThrow()
    expect(() => adapter(2_592_000)).not.toThrow()
  })

  it('throws when the public-url call returns no URL', async () => {
    mocks.filesCreate.mockResolvedValueOnce({ id: 'file_2' })
    mocks.post.mockResolvedValueOnce({})
    await expect(adapter().upload(new Blob(['x']))).rejects.toThrow(
      /no public_url/,
    )
  })

  it('revokePublicUrl leaves the file in place', async () => {
    mocks.post.mockResolvedValueOnce({ revoked: true })
    await adapter().revokePublicUrl('file_3')
    expect(mocks.post.mock.calls.at(-1)![0]).toBe(
      '/files/file_3/public-url/revoke',
    )
    expect(mocks.filesDelete).not.toHaveBeenCalled()
  })
})
