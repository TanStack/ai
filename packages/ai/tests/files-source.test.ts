import { describe, expect, it } from 'vitest'
import {
  assertMessagesFileSourceSupport,
  assertPromptFileSourceSupport,
  deleteFile,
  fileReferenceFor,
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
  reference: { openai: 'file-abc' },
}

describe('file content source helpers', () => {
  it('isFileSource narrows only the file arm', () => {
    expect(isFileSource(fileSource)).toBe(true)
    expect(isFileSource({ type: 'url', value: 'https://x/y' })).toBe(false)
    expect(
      isFileSource({ type: 'data', value: 'AAAA', mimeType: 'image/png' }),
    ).toBe(false)
  })

  it('fileReferenceFor resolves the own-provider entry and throws on a miss', () => {
    const merged: ContentPartSource = {
      type: 'file',
      reference: { openai: 'file-abc', gemini: 'https://g/files/xyz' },
    }
    if (!isFileSource(merged)) throw new Error('expected file source')
    expect(fileReferenceFor(merged, 'openai')).toBe('file-abc')
    expect(fileReferenceFor(merged, 'gemini')).toBe('https://g/files/xyz')
    expect(() => fileReferenceFor(merged, 'anthropic')).toThrow(
      /anthropic.*found: openai, gemini/s,
    )
  })

  it('unsupportedFileSourceError includes provider and detail', () => {
    const err = unsupportedFileSourceError('mistral', 'on this endpoint')
    expect(err.message).toContain('mistral')
    expect(err.message).toContain('on this endpoint')
  })

  it('fileSourceFromHandle uses uri (Gemini/fal) else id (OpenAI/Anthropic) and merges handles', () => {
    const opaque: FileHandle = { id: 'file-abc', provider: 'openai' }
    expect(fileSourceFromHandle(opaque)).toEqual({
      type: 'file',
      reference: { openai: 'file-abc' },
    })

    const withUri: FileHandle = {
      id: 'files/xyz',
      provider: 'gemini',
      uri: 'https://generativelanguage.googleapis.com/v1/files/xyz',
      mimeType: 'image/png',
    }
    expect(fileSourceFromHandle(withUri)).toEqual({
      type: 'file',
      reference: {
        gemini: 'https://generativelanguage.googleapis.com/v1/files/xyz',
      },
      mimeType: 'image/png',
    })

    // Multiple handles (same bytes uploaded to two providers) merge into one
    // source that routes to either provider.
    expect(fileSourceFromHandle(opaque, withUri)).toEqual({
      type: 'file',
      reference: {
        openai: 'file-abc',
        gemini: 'https://generativelanguage.googleapis.com/v1/files/xyz',
      },
      mimeType: 'image/png',
    })
  })

  it('isContentPart accepts a valid file source and rejects an empty reference record', () => {
    expect(isContentPart({ type: 'image', source: fileSource })).toBe(true)
    expect(
      isContentPart({
        type: 'image',
        source: { type: 'file', reference: {} },
      }),
    ).toBe(false)
    expect(
      isContentPart({
        type: 'image',
        source: { type: 'file' },
      }),
    ).toBe(false)
  })
})

describe('file source preflight', () => {
  const fileMessage = {
    role: 'user',
    content: [{ type: 'image', source: fileSource }],
  }
  const plainMessage = { role: 'user', content: 'hello' }

  it('rejects file sources for adapters that do not declare support', () => {
    expect(() =>
      assertMessagesFileSourceSupport({ name: 'legacy' }, [
        plainMessage,
        fileMessage,
      ]),
    ).toThrow(/legacy does not support provider file-handle sources/)
    expect(() =>
      assertPromptFileSourceSupport({ name: 'legacy' }, [
        { type: 'image', source: fileSource },
      ]),
    ).toThrow(/legacy does not support provider file-handle sources/)
  })

  it('passes when the adapter declares support or no file source is present', () => {
    expect(() =>
      assertMessagesFileSourceSupport(
        { name: 'openai', supportsFileSources: true },
        [fileMessage],
      ),
    ).not.toThrow()
    expect(() =>
      assertMessagesFileSourceSupport({ name: 'legacy' }, [plainMessage]),
    ).not.toThrow()
    expect(() =>
      assertPromptFileSourceSupport({ name: 'legacy' }, 'a text prompt'),
    ).not.toThrow()
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
    await expect(deleteFile({ adapter: uploadOnly, id: 'x' })).rejects.toThrow(
      /does not support delete/,
    )
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

  it('getFile / deleteFile accept the handle itself and use its lifecycle id', async () => {
    // A Gemini-style handle: `uri` is the wire value, `id` the lifecycle name.
    const handle: FileHandle = {
      id: 'file-1',
      provider: 'openai',
      uri: 'https://provider/file-1',
    }
    const seen: Array<string> = []
    const adapter: FilesAdapter = {
      kind: 'files',
      name: 'openai',
      upload: async () => handle,
      get: async (id) => {
        seen.push(id)
        return handle
      },
      delete: async (id) => {
        seen.push(id)
      },
    }

    await getFile({ adapter, id: handle })
    await deleteFile({ adapter, id: handle })
    expect(seen).toEqual(['file-1', 'file-1'])
  })
})
