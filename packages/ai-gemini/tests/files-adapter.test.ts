import { describe, expect, it, vi } from 'vitest'
import { createGeminiFiles } from '../src/adapters/files'

const mocks = vi.hoisted(() => {
  return {
    filesUpload: vi.fn(),
    filesGet: vi.fn(),
    filesDelete: vi.fn(),
  }
})

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    files = {
      upload: mocks.filesUpload,
      get: mocks.filesGet,
      delete: mocks.filesDelete,
    }

    constructor(_options: { apiKey: string }) {}
  }
  return { GoogleGenAI: MockGoogleGenAI }
})

const GEMINI_FILE = {
  name: 'files/abc-123',
  uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc-123',
  mimeType: 'image/png',
  // The SDK types sizeBytes as a string.
  sizeBytes: '2048',
  expirationTime: '2026-08-09T00:00:00Z',
}

describe('gemini files adapter', () => {
  it('normalizes upload results: lifecycle name as id, uri kept, ISO expiry → epoch ms, string size → number', async () => {
    mocks.filesUpload.mockResolvedValueOnce(GEMINI_FILE)
    const files = createGeminiFiles('k')

    const handle = await files.upload({ data: 'AAAA', mimeType: 'image/png' })

    expect(handle).toEqual({
      id: 'files/abc-123',
      provider: 'gemini',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc-123',
      mimeType: 'image/png',
      sizeBytes: 2048,
      expiresAt: Date.parse('2026-08-09T00:00:00Z'),
    })
  })

  it('throws when the upload response has no name — the handle would be unusable', async () => {
    mocks.filesUpload.mockResolvedValueOnce({ ...GEMINI_FILE, name: undefined })
    const files = createGeminiFiles('k')

    await expect(
      files.upload({ data: 'AAAA', mimeType: 'image/png' }),
    ).rejects.toThrow(/without a name/)
  })

  it('omits uri and expiresAt when the API reports none', async () => {
    mocks.filesUpload.mockResolvedValueOnce({
      name: 'files/abc-123',
      uri: undefined,
      expirationTime: undefined,
    })
    const files = createGeminiFiles('k')

    const handle = await files.upload({ data: 'AAAA', mimeType: 'image/png' })
    expect(handle.uri).toBeUndefined()
    expect(handle.expiresAt).toBeUndefined()
  })

  it('get/delete address the lifecycle name', async () => {
    mocks.filesGet.mockResolvedValueOnce(GEMINI_FILE)
    const files = createGeminiFiles('k')

    await files.get('files/abc-123')
    expect(mocks.filesGet).toHaveBeenCalledWith({ name: 'files/abc-123' })

    await files.delete('files/abc-123')
    expect(mocks.filesDelete).toHaveBeenCalledWith({ name: 'files/abc-123' })
  })
})
