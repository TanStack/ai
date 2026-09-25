import { describe, expect, it, vi } from 'vitest'
import { createOpenaiFiles } from '../src/adapters/files'

const mocks = vi.hoisted(() => {
  return {
    filesCreate: vi.fn(),
    filesRetrieve: vi.fn(),
    filesDelete: vi.fn(),
  }
})

vi.mock('openai', () => {
  class MockOpenAI {
    files = {
      create: mocks.filesCreate,
      retrieve: mocks.filesRetrieve,
      delete: mocks.filesDelete,
    }

    constructor(_options: { apiKey: string }) {}
  }
  return {
    OpenAI: MockOpenAI,
    default: MockOpenAI,
    toFile: vi.fn(async (blob: Blob, name?: string) => ({ blob, name })),
  }
})

const FILE_OBJECT = {
  id: 'file-abc',
  bytes: 1234,
  filename: 'doc.pdf',
  // OpenAI reports expiry in epoch *seconds*.
  expires_at: 1_700_000_000,
}

describe('openai files adapter', () => {
  it('normalizes upload results: seconds→ms expiry, provider literal, no uri', async () => {
    mocks.filesCreate.mockResolvedValueOnce(FILE_OBJECT)
    const files = createOpenaiFiles('k')

    const handle = await files.upload({ data: 'AAAA', mimeType: 'image/png' })

    expect(handle).toEqual({
      id: 'file-abc',
      provider: 'openai',
      sizeBytes: 1234,
      filename: 'doc.pdf',
      expiresAt: 1_700_000_000_000,
    })
    expect(handle.uri).toBeUndefined()
    const [params] = mocks.filesCreate.mock.calls[0]!
    expect(params.purpose).toBe('user_data')
  })

  it('omits expiresAt when the API reports none', async () => {
    mocks.filesCreate.mockResolvedValueOnce({
      ...FILE_OBJECT,
      expires_at: null,
    })
    const files = createOpenaiFiles('k')

    const handle = await files.upload({ data: 'AAAA', mimeType: 'image/png' })
    expect(handle.expiresAt).toBeUndefined()
  })

  it('get retrieves by id and normalizes the same way', async () => {
    mocks.filesRetrieve.mockResolvedValueOnce(FILE_OBJECT)
    const files = createOpenaiFiles('k')

    const handle = await files.get('file-abc')
    expect(mocks.filesRetrieve).toHaveBeenCalledWith('file-abc')
    expect(handle.expiresAt).toBe(1_700_000_000_000)
  })
})
