import { describe, expect, it } from 'vitest'
import {
  assertOwnFileSource,
  deleteFile,
  fileSourceFromHandle,
  getFile,
  isContentPart,
  isFileSource,
  unsupportedFileSourceError,
  uploadFile,
} from '../src/index'
import { normalizeFileUploadInput } from '../src/activities/files/adapter'
import type { ContentPartSource } from '../src/types'
import type { FileHandle, FilesAdapter } from '../src/activities/files/adapter'

const fileSource: ContentPartSource = {
  type: 'file',
  value: 'file-abc',
  provider: 'openai',
}

describe('file content source helpers', () => {
  it('isFileSource narrows only the file arm', () => {
    expect(isFileSource(fileSource)).toBe(true)
    expect(isFileSource({ type: 'url', value: 'https://x/y' })).toBe(false)
    expect(
      isFileSource({ type: 'data', value: 'AAAA', mimeType: 'image/png' }),
    ).toBe(false)
  })

  it('assertOwnFileSource passes on match and throws on mismatch', () => {
    expect(() => assertOwnFileSource(fileSource, 'openai')).not.toThrow()
    expect(() => assertOwnFileSource(fileSource, 'gemini')).toThrow(/openai/)
  })

  it('unsupportedFileSourceError includes provider and detail', () => {
    const err = unsupportedFileSourceError('mistral', 'on this endpoint')
    expect(err.message).toContain('mistral')
    expect(err.message).toContain('on this endpoint')
  })

  it('fileSourceFromHandle prefers uri (Gemini/fal), else id (OpenAI/Anthropic)', () => {
    const opaque: FileHandle = { id: 'file-abc', provider: 'openai' }
    expect(fileSourceFromHandle(opaque)).toEqual({
      type: 'file',
      value: 'file-abc',
      provider: 'openai',
    })

    const withUri: FileHandle = {
      id: 'files/xyz',
      provider: 'gemini',
      uri: 'https://generativelanguage.googleapis.com/v1/files/xyz',
      mimeType: 'image/png',
    }
    expect(fileSourceFromHandle(withUri)).toEqual({
      type: 'file',
      value: 'https://generativelanguage.googleapis.com/v1/files/xyz',
      provider: 'gemini',
      mimeType: 'image/png',
    })
  })

  it('isContentPart accepts a valid file source and rejects one missing provider', () => {
    expect(
      isContentPart({ type: 'image', source: fileSource }),
    ).toBe(true)
    expect(
      isContentPart({
        type: 'image',
        source: { type: 'file', value: 'file-abc' },
      }),
    ).toBe(false)
  })
})

describe('normalizeFileUploadInput', () => {
  it('passes a Blob through and decodes base64 input', async () => {
    const blob = new Blob(['hi'], { type: 'text/plain' })
    expect(normalizeFileUploadInput(blob).blob).toBe(blob)

    const fromBase64 = normalizeFileUploadInput({
      data: 'aGVsbG8=', // "hello"
      mimeType: 'text/plain',
      filename: 'greeting.txt',
    })
    expect(fromBase64.mimeType).toBe('text/plain')
    expect(fromBase64.filename).toBe('greeting.txt')
    expect(await fromBase64.blob.text()).toBe('hello')
  })
})

describe('files activity dispatch', () => {
  const uploadOnly: FilesAdapter = {
    kind: 'files',
    name: 'fal',
    upload: async () => ({ id: 'https://cdn/x', provider: 'fal' }),
  }
  const full: FilesAdapter = {
    kind: 'files',
    name: 'openai',
    upload: async () => ({ id: 'file-1', provider: 'openai' }),
    get: async (id) => ({ id, provider: 'openai' }),
    delete: async () => {},
  }

  it('uploadFile returns the handle', async () => {
    const handle = await uploadFile({
      adapter: uploadOnly,
      input: new Blob(['x']),
    })
    expect(handle).toEqual({ id: 'https://cdn/x', provider: 'fal' })
  })

  it('getFile / deleteFile throw when the adapter has no lifecycle API', async () => {
    await expect(getFile({ adapter: uploadOnly, id: 'x' })).rejects.toThrow(
      /does not support get/,
    )
    await expect(
      deleteFile({ adapter: uploadOnly, id: 'x' }),
    ).rejects.toThrow(/does not support delete/)
  })

  it('getFile / deleteFile call through when supported', async () => {
    expect(await getFile({ adapter: full, id: 'file-1' })).toEqual({
      id: 'file-1',
      provider: 'openai',
    })
    await expect(
      deleteFile({ adapter: full, id: 'file-1' }),
    ).resolves.toBeUndefined()
  })
})
