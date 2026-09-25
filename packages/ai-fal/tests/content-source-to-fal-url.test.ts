import { describe, expect, it } from 'vitest'
import { contentSourceToFalUrl } from '../src/image/image-inputs'

describe('contentSourceToFalUrl', () => {
  it('passes a fal storage handle through as its URL', () => {
    expect(
      contentSourceToFalUrl({
        type: 'file',
        value: 'https://fal.media/files/abc.png',
        provider: 'fal',
      }),
    ).toBe('https://fal.media/files/abc.png')
  })

  it('rejects a file handle issued by another provider', () => {
    expect(() =>
      contentSourceToFalUrl({
        type: 'file',
        value: 'file-openai-123',
        provider: 'openai',
      }),
    ).toThrow(/fal/)
  })

  it('passes URL sources through and encodes data sources', () => {
    expect(
      contentSourceToFalUrl({ type: 'url', value: 'https://x/y.png' }),
    ).toBe('https://x/y.png')
    expect(
      contentSourceToFalUrl({
        type: 'data',
        value: 'AAAA',
        mimeType: 'image/png',
      }),
    ).toBe('data:image/png;base64,AAAA')
  })
})
