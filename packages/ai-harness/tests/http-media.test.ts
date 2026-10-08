import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
  isMediaRecord,
  mediaPart,
} from '../src'
import { mockAdapter, text } from './helpers'
import type { ContentPart } from '@tanstack/ai'
import type { Authorize, MediaOptions, MediaRecord } from '../src'

const BASE = 'http://x/api/harness'
const HOUR = 60 * 60 * 1000
const NOW = 1_000_000

const allowUser: Authorize = (request) =>
  request.headers.get('authorization') === 'Bearer good'
    ? { id: 'user-1' }
    : null

/**
 * A handler for user-1, who can open only threads that start with `user-1`.
 * `handlerWith` makes another handler on the same host.
 */
function setup(options: { media?: MediaOptions; mediaSecret?: string } = {}) {
  const { adapter, calls } = mockAdapter(() => text('ok'))
  const harness = defineHarness({
    name: 'test/http-media',
    adapter,
    media: options.media,
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const handlerWith = (
    handlerOptions: { authorize?: Authorize; mediaSecret?: string } = {},
  ) =>
    createHarnessHandler({
      host,
      harness,
      authorize: handlerOptions.authorize ?? allowUser,
      canAccess: (principal, threadId) => threadId.startsWith(principal.id),
      mediaSecret: handlerOptions.mediaSecret,
    })
  const handler = handlerWith({ mediaSecret: options.mediaSecret })
  const call = (path: string, init: RequestInit = {}) =>
    handler(
      new Request(`${BASE}/${path}`, {
        ...init,
        headers: { authorization: 'Bearer good', ...init.headers },
      }),
    )
  const post = (path: string, body: string, contentType: string) =>
    call(path, {
      method: 'POST',
      body,
      headers: { 'content-type': contentType },
    })

  /** Upload `body` to `threadId`. */
  const upload = async (
    threadId: string,
    body = 'hello',
    mimeType = 'image/png',
  ) => {
    const response = await post(
      `media?threadId=${threadId}&name=cat.png`,
      body,
      mimeType,
    )
    const record: unknown = await response.json()
    if (!isMediaRecord(record))
      throw new Error(`The upload failed: ${JSON.stringify(record)}`)
    return record
  }

  /** The signed path of `record`, from the media-url route. */
  const signedPath = async (record: MediaRecord) => {
    const response = await call(
      `media-url?threadId=${record.threadId}&id=${record.id}`,
    )
    const body: { path: string; expiresAt: number } = await response.json()
    return body
  }

  /** A GET with no Authorization header. */
  const fetchSigned = (path: string, target = handler) =>
    target(new Request(`${BASE}/${path}`))

  return {
    host,
    calls,
    handlerWith,
    call,
    post,
    upload,
    signedPath,
    fetchSigned,
  }
}

/** A file of user-1-a, the query of its signed URL, and a second file. */
async function signedFile() {
  const env = setup()
  const record = await env.upload('user-1-a')
  const other = await env.upload('user-1-a', 'other')
  const { path } = await env.signedPath(record)
  const query = new URLSearchParams(path.slice('media?'.length))
  return { ...env, record, other, query }
}

/** An AG-UI run body with one user message. */
function runBody(threadId: string, content: Array<unknown>) {
  return JSON.stringify({
    threadId,
    runId: 'client-run',
    messages: [{ id: 'u1', role: 'user', content }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('media upload and signed URLs', () => {
  it('stores an upload, signs its URL for 1 hour, and serves the signed URL without auth', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const { host, upload, signedPath, fetchSigned } = setup()

    const record = await upload('user-1-a')
    const { path, expiresAt } = await signedPath(record)
    const response = await fetchSigned(path)

    expect(record).toEqual({
      id: expect.any(String),
      threadId: 'user-1-a',
      kind: 'image',
      mimeType: 'image/png',
      name: 'cat.png',
      size: 5,
      source: 'user',
      createdAt: NOW,
    })
    expect(expiresAt).toBe(NOW + HOUR)
    expect(path).toMatch(
      new RegExp(
        `^media\\?threadId=user-1-a&id=${record.id}&exp=${NOW + HOUR}&sig=[\\w-]+$`,
      ),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hello')
    await host.close()
  })

  it('serves a signed URL through a handler whose authorize refuses everything', async () => {
    const { host, upload, signedPath, fetchSigned, handlerWith } = setup({
      mediaSecret: 'shared',
    })
    const record = await upload('user-1-a')
    const { path } = await signedPath(record)
    const refuseAll = handlerWith({
      authorize: () => null,
      mediaSecret: 'shared',
    })

    const signed = await fetchSigned(path, refuseAll)
    const unsigned = await fetchSigned(
      `media?threadId=user-1-a&id=${record.id}`,
      refuseAll,
    )

    expect(signed.status).toBe(200)
    expect(await signed.text()).toBe('hello')
    expect(unsigned.status).toBe(401)
    await host.close()
  })

  const tampered: Array<{
    label: string
    change: (query: URLSearchParams, other: MediaRecord) => void
  }> = [
    {
      label: 'another file id',
      change: (query, other) => query.set('id', other.id),
    },
    {
      label: 'another thread',
      change: (query) => query.set('threadId', 'user-1-b'),
    },
    {
      label: 'a later expiry',
      change: (query) => query.set('exp', String(Date.now() + 2 * HOUR)),
    },
  ]

  it.each(tampered)(
    'refuses the signature of a URL with $label (403)',
    async ({ change }) => {
      const { host, query, other, fetchSigned } = await signedFile()

      change(query, other)
      const response = await fetchSigned(`media?${query}`)

      expect(response.status).toBe(403)
      await host.close()
    },
  )

  it('refuses a signed URL after it expires (403)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const { host, query, fetchSigned } = await signedFile()

    vi.setSystemTime(NOW + HOUR + 1)
    const response = await fetchSigned(`media?${query}`)

    expect(response.status).toBe(403)
    await host.close()
  })

  it('refuses a URL signed by a handler with another random key (403)', async () => {
    const { host, query, fetchSigned, handlerWith } = await signedFile()

    const response = await fetchSigned(`media?${query}`, handlerWith())

    expect(response.status).toBe(403)
    await host.close()
  })

  it('does not sign or serve the file of another thread (404)', async () => {
    const { host, call, upload } = setup()
    const record = await upload('user-1-a')

    const url = await call(`media-url?threadId=user-1-b&id=${record.id}`)
    const bytes = await call(`media?threadId=user-1-b&id=${record.id}`)

    expect(url.status).toBe(404)
    expect(bytes.status).toBe(404)
    await host.close()
  })

  it('serves an unsigned GET only to a principal that can open the thread', async () => {
    const { host, call, upload, fetchSigned } = setup()
    const record = await upload('user-1-a')
    const path = `media?threadId=user-1-a&id=${record.id}`

    const owner = await call(path)

    expect(owner.status).toBe(200)
    expect(await owner.text()).toBe('hello')
    expect((await fetchSigned(path)).status).toBe(401)
    expect(
      (await call(`media?threadId=someone-else&id=${record.id}`)).status,
    ).toBe(403)
    await host.close()
  })

  it('refuses a file over media.maxBytes (413)', async () => {
    const { host, post } = setup({ media: { maxBytes: 4 } })

    const response = await post(
      'media?threadId=user-1-a&name=cat.png',
      'hello',
      'image/png',
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: 'The file is bigger than the limit of 4 bytes.',
    })
    await host.close()
  })

  it('refuses a type that is not media (415)', async () => {
    const { host, post } = setup()

    const response = await post(
      'media?threadId=user-1-a&name=a.zip',
      'PK',
      'application/zip',
    )

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({
      error: 'Files of type application/zip are not supported.',
    })
    await host.close()
  })
})

describe('media bytes', () => {
  it('answers a Range request with 206 and the slice', async () => {
    const { host, call, upload } = setup()
    const record = await upload('user-1-a')

    const response = await call(`media?threadId=user-1-a&id=${record.id}`, {
      headers: { range: 'bytes=1-3' },
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 1-3/5')
    expect(response.headers.get('content-length')).toBe('3')
    expect(await response.text()).toBe('ell')
    await host.close()
  })

  it('answers a Range past the end with 416', async () => {
    const { host, call, upload } = setup()
    const record = await upload('user-1-a')

    const response = await call(`media?threadId=user-1-a&id=${record.id}`, {
      headers: { range: 'bytes=5-' },
    })

    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */5')
    await host.close()
  })

  it('serves a document so that it cannot run as a page of this origin', async () => {
    const { host, upload, signedPath, fetchSigned } = setup()
    const page = '<script>alert(1)</script>'
    const record = await upload('user-1-a', page, 'text/html')
    const { path } = await signedPath(record)

    const response = await fetchSigned(path)

    expect(Object.fromEntries(response.headers)).toEqual({
      'accept-ranges': 'bytes',
      'content-length': String(page.length),
      'content-security-policy': "default-src 'none'; sandbox",
      'content-type': 'text/html',
      'x-content-type-options': 'nosniff',
    })
    await host.close()
  })
})

describe('POST run with media parts', () => {
  // AG-UI text parts carry `text`. Media parts have the TanStack shape.
  const question = { type: 'text', text: 'What is this?' }
  // 'aGVsbG8=' is base64 for "hello", the bytes of every upload here.
  const data: ContentPart = {
    type: 'image',
    source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
  }

  const cases: Array<{
    label: string
    part: (record: MediaRecord) => ContentPart
  }> = [
    { label: 'a harness-media URL, and keeps the URL', part: mediaPart },
    { label: 'a data part, and keeps it as sent', part: () => data },
  ]

  it.each(cases)(
    'gives the model the bytes of $label in the transcript',
    async ({ part }) => {
      const { host, call, upload, calls } = setup()
      const record = await upload('user-1-run')

      const response = await call('run', {
        method: 'POST',
        body: runBody('user-1-run', [question, part(record)]),
        headers: { 'content-type': 'application/json' },
      })
      await response.text()
      const transcript = await (
        await call('transcript?threadId=user-1-run')
      ).json()

      expect(calls[0].messages[0].content).toEqual([
        { type: 'text', content: 'What is this?' },
        data,
      ])
      expect(transcript[0].content).toEqual([
        { type: 'text', content: 'What is this?' },
        part(record),
      ])
      await host.close()
    },
  )
})
