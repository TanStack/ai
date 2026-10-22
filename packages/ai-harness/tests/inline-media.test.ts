import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { readBodyText, storeInlineMedia } from '../src/inline-media'
import { MediaError, createMediaStore } from '../src/media'
import { mediaIdOf } from '../src/media-entry'
import { applyInput } from '../src/server'
import { mockAdapter, text } from './helpers'
import type { ContentPart } from '@tanstack/ai'
import type { MediaOptions } from '../src/media'

// 'aGVsbG8=' is base64 for "hello", 5 bytes.
const HELLO = 'aGVsbG8='
const decoder = new TextDecoder()

const inlineImage = (value = HELLO, mimeType = 'image/png') => {
  const part: ContentPart = {
    type: 'image',
    source: { type: 'data', value, mimeType },
  }
  return part
}

const urlImage = (value: string) => {
  const part: ContentPart = { type: 'image', source: { type: 'url', value } }
  return part
}

/** A media store of one thread, and `storeInlineMedia` on it. */
function storeWith(options?: MediaOptions) {
  const store = createMediaStore({
    persistence: memoryPersistence(),
    threadId: 't1',
    ...(options ? { options } : {}),
  })
  const check = (parts: Array<ContentPart>) =>
    storeInlineMedia(parts, {
      options,
      putMedia: ({ body, mimeType, name }) =>
        store.put(body, { mimeType, name }),
    })
  return { store, check }
}

/** The text of the bytes that the media part of `checked` points to. */
async function storedText(
  store: ReturnType<typeof storeWith>['store'],
  checked: Awaited<ReturnType<ReturnType<typeof storeWith>['check']>>,
) {
  if ('refused' in checked) throw new Error(`refused: ${checked.refused}`)
  const id = checked.parts.map(mediaIdOf).find((item) => item !== undefined)
  if (id === undefined) throw new Error('not a media reference')
  return decoder.decode(await store.load(id))
}

describe('storeInlineMedia', () => {
  it('moves an inline image into the store and sends a reference', async () => {
    const { store, check } = storeWith()

    const checked = await check([
      { type: 'text', content: 'What is this?' },
      inlineImage(),
    ])

    expect(checked).toEqual({
      parts: [
        { type: 'text', content: 'What is this?' },
        {
          type: 'image',
          source: {
            type: 'url',
            value: expect.stringMatching(/^harness-media:./),
            mimeType: 'image/png',
          },
        },
      ],
    })
    expect(await storedText(store, checked)).toBe('hello')
  })

  it('moves a base64 data URL into the store too', async () => {
    const { store, check } = storeWith()

    const checked = await check([urlImage(`data:image/png;base64,${HELLO}`)])

    expect(await storedText(store, checked)).toBe('hello')
  })

  it('refuses inline bytes over media.maxBytes', async () => {
    const { check } = storeWith({ maxBytes: 4 })

    expect(await check([inlineImage()])).toEqual({ refused: 'media_too_large' })
  })

  it('refuses a kind that is not in media.kinds', async () => {
    const { check } = storeWith({ kinds: ['document'] })

    expect(await check([inlineImage()])).toEqual({
      refused: 'media_not_allowed',
    })
  })

  it('refuses data that is not base64', async () => {
    const { check } = storeWith()

    expect(await check([inlineImage('not base64!')])).toEqual({
      refused: 'media_invalid',
    })
  })

  it('refuses an external URL by default, and keeps it when allowed', async () => {
    const cat = urlImage('https://example.com/cat.png')

    expect(await storeWith().check([cat])).toEqual({
      refused: 'media_url_not_allowed',
    })
    expect(await storeWith({ externalUrls: true }).check([cat])).toEqual({
      parts: [cat],
    })
    const onlyCdn = storeWith({
      externalUrls: (url) => url.hostname === 'cdn.example.com',
    })
    expect(await onlyCdn.check([cat])).toEqual({
      refused: 'media_url_not_allowed',
    })
  })

  it('refuses a URL scheme other than http and https, even when URLs are allowed', async () => {
    const { check } = storeWith({ externalUrls: true })

    expect(await check([urlImage('file:///etc/passwd')])).toEqual({
      refused: 'media_url_not_allowed',
    })
  })

  it('stores nothing when a later part is refused', async () => {
    const stored: Array<string> = []
    const checked = await storeInlineMedia(
      [inlineImage(), urlImage('https://example.com/cat.png')],
      {
        options: undefined,
        putMedia: async (upload) => {
          stored.push(upload.mimeType)
          throw new Error('not reached')
        },
      },
    )

    expect(checked).toEqual({ refused: 'media_url_not_allowed' })
    expect(stored).toEqual([])
  })

  it('refuses a provider file handle unless media.allowProviderFiles is set', async () => {
    const file: ContentPart = {
      type: 'document',
      source: { type: 'file', value: 'file-abc' },
    }

    expect(await storeWith().check([file])).toEqual({
      refused: 'media_url_not_allowed',
    })
    expect(await storeWith({ allowProviderFiles: true }).check([file])).toEqual(
      { parts: [file] },
    )
  })
})

describe('readBodyText', () => {
  const post = (body: string) =>
    new Request('http://x/control', { method: 'POST', body })

  it('reads a body up to media.maxBodyBytes', async () => {
    expect(await readBodyText(post('12345'), { maxBodyBytes: 5 })).toBe('12345')
  })

  it('refuses a body over media.maxBodyBytes with 413', async () => {
    const reading = readBodyText(post('123456'), { maxBodyBytes: 5 })

    await expect(reading).rejects.toBeInstanceOf(MediaError)
    await expect(reading).rejects.toMatchObject({ status: 413 })
  })
})

describe('applyInput with media from a client', () => {
  async function open(media?: MediaOptions) {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const harness = defineHarness({ name: 'test/inline', adapter, media })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't1' })
    return { harness, host, session, calls }
  }

  it('stores an inline image, keeps a reference in the transcript, and gives the model the bytes', async () => {
    const { harness, host, session, calls } = await open()

    const receipt = await applyInput({
      harness,
      session,
      input: { op: 'prompt', inputId: 'in-1', message: [inlineImage()] },
    })
    await session.settled({ inputId: 'in-1' })

    expect(receipt.status).toBe('accepted')
    const [saved] = await session.transcript()
    const id = Array.isArray(saved?.content)
      ? mediaIdOf(saved.content[0])
      : undefined
    if (id === undefined) throw new Error('no media reference in transcript')
    expect(decoder.decode(await session.loadMedia({ id }))).toBe('hello')
    expect(calls[0].messages[0].content).toEqual([
      {
        type: 'image',
        source: { type: 'data', value: HELLO, mimeType: 'image/png' },
      },
    ])
    await host.close()
  })

  it('treats a retried prompt with inline media as the same input', async () => {
    const { harness, host, session, calls } = await open()
    const input = {
      op: 'prompt' as const,
      inputId: 'in-1',
      message: [inlineImage()],
    }

    const first = await applyInput({ harness, session, input })
    await session.settled({ inputId: 'in-1' })
    const again = await applyInput({ harness, session, input })

    // Stored again, the media id would differ, and the retry would be a
    // conflict.
    expect(first.status).toBe('accepted')
    expect(again).toEqual(first)
    expect(calls).toHaveLength(1)
    const other = { ...input, message: [inlineImage(), inlineImage()] }
    expect(await applyInput({ harness, session, input: other })).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    await host.close()
  })

  it('rejects a prompt with an external URL, and no turn runs', async () => {
    const { harness, host, session, calls } = await open()

    const receipt = await applyInput({
      harness,
      session,
      input: {
        op: 'prompt',
        inputId: 'in-1',
        message: [urlImage('https://example.com/cat.png')],
      },
    })

    expect(receipt).toEqual({
      inputId: 'in-1',
      status: 'rejected',
      reason: 'media_url_not_allowed',
    })
    expect(calls).toEqual([])
    expect(await session.transcript()).toEqual([])
    await host.close()
  })
})
