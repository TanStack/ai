import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createHarnessHandler } from '../src/server'
import { isMediaRecord, mediaPart } from '../src/media-entry'
import { mockAdapter, text } from './helpers'
import type { ContentPart } from '@tanstack/ai'
import type { MediaRecord } from '../src'
import type { MediaOptions } from '../src/media-entry'

const BASE = 'http://x/api/harness'
const HOUR = 60 * 60 * 1000
const NOW = 1_000_000

const user = { id: 'user-1' }

/** Media signing keys: each one is 32 bytes or more. */
const SHARED = 'a-shared-secret-of-32-bytes-or-more'
const OLD_KEY = 'the-old-secret-of-32-bytes-or-more'

const allowUser = (request: Request) =>
  request.headers.get('authorization') === 'Bearer good' ? user : null

/**
 * A handler for user-1, who can open only threads that start with `user-1`.
 * `handlerWith` makes another handler, on the same host or on `hostWith`: a
 * second host on the same stores, as another server instance.
 */
function setup(options: { media?: MediaOptions; secret?: string } = {}) {
  const { adapter, calls } = mockAdapter(() => text('ok'))
  const harness = defineHarness({
    name: 'test/http-media',
    adapter,
    media: options.media,
  })
  const persistence = memoryPersistence()
  /** A host on the shared stores. `getUser` reads the user of a request. */
  const hostWith = (
    getUser: (request: Request) => { id: string; tenantId?: string } | null,
  ) =>
    createHarnessHost({
      persistence,
      access: {
        getUser: ({ request }) => getUser(request),
        rules: {
          isAllowed: ({ user, session }) =>
            session.threadId.startsWith(user.id),
        },
      },
    })
  const host = hostWith(allowUser)
  /**
   * `secret` or `keys` sign the media URLs. Without them, a random key per
   * handler.
   */
  const handlerWith = (
    handlerOptions: {
      host?: typeof host
      secret?: string
      keys?: Array<string>
    } = {},
  ) =>
    createHarnessHandler({
      host: handlerOptions.host ?? host,
      harness,
      ...(handlerOptions.secret
        ? { media: { secret: handlerOptions.secret } }
        : handlerOptions.keys
          ? { media: { keys: handlerOptions.keys } }
          : {}),
    })
  const handler = handlerWith({ secret: options.secret })
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

  /** A GET as user-1. `headers: {}` sends no Authorization header. */
  const fetchSigned = (
    path: string,
    target = handler,
    headers: Record<string, string> = { authorization: 'Bearer good' },
  ) => target(new Request(`${BASE}/${path}`, { headers }))

  return {
    host,
    harness,
    persistence,
    calls,
    hostWith,
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
  it('refuses an empty media.secret at the start', () => {
    const { adapter } = mockAdapter(() => text('ok'))
    const harness = defineHarness({ name: 'test/http-media-empty', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    expect(() =>
      createHarnessHandler({
        host,
        harness,
        openAccess: true,
        media: { secret: '' },
      }),
    ).toThrow(/at least 32 bytes/)
  })

  it('needs media at the start on a host with ownership, and warns once on another host', async () => {
    // A fresh module, so no handler of another test warned before.
    vi.resetModules()
    const { createHarnessHandler: handlerOf } = await import('../src/server')
    const { createHarnessHost: hostOf } = await import('../src')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { adapter } = mockAdapter(() => text('ok'))
    const harness = defineHarness({ name: 'test/http-media-shared', adapter })
    const persistence = memoryPersistence()
    const handlerOn = (host: ReturnType<typeof hostOf>) => () =>
      handlerOf({ host, harness, openAccess: true })

    expect(
      handlerOn(hostOf({ persistence, ownership: { hostId: 'pod-1' } })),
    ).toThrow(/needs media/)
    expect(warn).not.toHaveBeenCalled()
    const host = hostOf({ persistence })
    expect(handlerOn(host)).not.toThrow()
    expect(handlerOn(host)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('media.secret'))
    warn.mockRestore()
  })

  it('stores an upload, signs its URL for 1 hour, and serves the signed URL to its user', async () => {
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

  it('serves a signed URL on another instance with the same key', async () => {
    const { host, upload, signedPath, fetchSigned, hostWith, handlerWith } =
      setup({ secret: SHARED })
    const record = await upload('user-1-a')
    const { path } = await signedPath(record)
    const other = hostWith(allowUser)

    const signed = await fetchSigned(
      path,
      handlerWith({ host: other, secret: SHARED }),
    )

    expect(signed.status).toBe(200)
    expect(await signed.text()).toBe('hello')
    await other.close()
    await host.close()
  })

  it('checks the user of a signed request: none is 401, a stranger or another tenant is 403', async () => {
    const { host, upload, signedPath, fetchSigned, hostWith, handlerWith } =
      setup({ secret: SHARED })
    const record = await upload('user-1-a')
    const { path } = await signedPath(record)
    const as = (who: { id: string; tenantId?: string }) => {
      const other = hostWith(() => who)
      return {
        other,
        handler: handlerWith({ host: other, secret: SHARED }),
      }
    }
    const stranger = as({ id: 'user-2' })
    const elsewhere = as({ id: 'user-1', tenantId: 'other-tenant' })

    expect((await fetchSigned(path, undefined, {})).status).toBe(401)
    expect((await fetchSigned(path, stranger.handler)).status).toBe(403)
    expect((await fetchSigned(path, elsewhere.handler)).status).toBe(403)
    await stranger.other.close()
    await elsewhere.other.close()
    await host.close()
  })

  it('serves a signed URL with no login to the guest of access.getGuestUser, and only that route', async () => {
    const { host, harness, persistence, upload, signedPath, fetchSigned } =
      setup({ secret: SHARED })
    const record = await upload('user-1-a')
    const { path } = await signedPath(record)
    /** A handler whose host gives a guest, and lets it read when `canRead`. */
    const guestHandler = (canRead: boolean, anonymous = true) => {
      const guestHost = createHarnessHost({
        persistence,
        access: {
          getUser: () => null,
          ...(anonymous ? { getGuestUser: () => ({ id: 'guest' }) } : {}),
          rules: {
            isAllowed: ({ user, action }) =>
              canRead && user.id === 'guest' && action === 'read',
          },
        },
      })
      const handler = createHarnessHandler({
        host: guestHost,
        harness,
        media: { secret: SHARED },
      })
      return { guestHost, handler }
    }
    const allowed = guestHandler(true)
    const refused = guestHandler(false)
    const without = guestHandler(true, false)

    const served = await fetchSigned(path, allowed.handler, {})
    expect(served.status).toBe(200)
    expect(await served.text()).toBe('hello')
    expect((await fetchSigned(path, refused.handler, {})).status).toBe(403)
    expect((await fetchSigned(path, without.handler, {})).status).toBe(401)
    // The guest exists only on the signed media route.
    expect(
      (await fetchSigned('transcript?threadId=user-1-a', allowed.handler, {}))
        .status,
    ).toBe(401)
    for (const entry of [allowed, refused, without]) {
      await entry.guestHost.close()
    }
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
    {
      label: 'another tenant',
      change: (query) => query.set('tenantId', 'other-tenant'),
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

  it('serves a URL that an old key signed on a handler with keys [new, old]', async () => {
    const { host, upload, signedPath, fetchSigned, handlerWith } = setup({
      secret: OLD_KEY,
    })
    const record = await upload('user-1-a')
    const { path } = await signedPath(record)

    const rotated = handlerWith({ keys: [SHARED, OLD_KEY] })
    const newOnly = handlerWith({ keys: [SHARED] })

    expect((await fetchSigned(path, rotated)).status).toBe(200)
    expect((await fetchSigned(path, newOnly)).status).toBe(403)
    await host.close()
  })

  it('throws at the start for a signing key under 32 bytes', () => {
    const { host, handlerWith } = setup()

    expect(() => handlerWith({ secret: 'shared' })).toThrow(/at least 32/)
    void host.close()
  })

  it('refuses a signed URL of a file whose thread was deleted (404)', async () => {
    const { host, upload, signedPath, fetchSigned } = setup()
    const record = await upload('user-1-a')
    const { path } = await signedPath(record)

    await host.sessions.delete({ threadId: 'user-1-a', user })
    const response = await fetchSigned(path)

    expect(response.status).toBe(404)
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

  it('serves an unsigned GET only to a user that can open the thread', async () => {
    const { host, harness, call, upload, fetchSigned } = setup()
    await host.open(harness, {
      threadId: 'someone-else',
      user: { id: 'someone' },
    })
    const record = await upload('user-1-a')
    const path = `media?threadId=user-1-a&id=${record.id}`

    const owner = await call(path)

    expect(owner.status).toBe(200)
    expect(await owner.text()).toBe('hello')
    expect((await fetchSigned(path, undefined, {})).status).toBe(401)
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

  it('sends at most 8 MB for a Range with no end', async () => {
    const { host, call, upload } = setup()
    const cap = 8 * 1024 * 1024
    const record = await upload('user-1-a', 'x'.repeat(cap + 10))

    const capped = await call(`media?threadId=user-1-a&id=${record.id}`, {
      headers: { range: 'bytes=2-' },
    })
    expect(capped.status).toBe(206)
    expect(capped.headers.get('content-range')).toBe(
      `bytes 2-${cap + 1}/${cap + 10}`,
    )
    expect(capped.headers.get('content-length')).toBe(String(cap))
    expect((await capped.arrayBuffer()).byteLength).toBe(cap)

    // The rest is under the cap, so it comes whole.
    const rest = await call(`media?threadId=user-1-a&id=${record.id}`, {
      headers: { range: `bytes=${cap + 2}-` },
    })
    expect(rest.headers.get('content-range')).toBe(
      `bytes ${cap + 2}-${cap + 9}/${cap + 10}`,
    )
    expect(await rest.text()).toBe('xxxxxxxx')
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
      'x-request-id': expect.any(String),
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
    { label: 'a harness-media URL', part: mediaPart },
    { label: 'a data part', part: () => data },
  ]

  it.each(cases)(
    'gives the model the bytes of $label, and keeps a harness-media URL in the transcript',
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
      // A data part moved to the media store. Its URL names a new record.
      expect(transcript[0].content).toEqual([
        { type: 'text', content: 'What is this?' },
        {
          type: 'image',
          source: {
            type: 'url',
            value: expect.stringMatching(/^harness-media:/),
            mimeType: 'image/png',
          },
        },
      ])
      await host.close()
    },
  )

  const refused: Array<{
    label: string
    media?: MediaOptions
    part: ContentPart
    status: number
    error: string
  }> = [
    {
      label: 'bytes over media.maxBytes',
      media: { maxBytes: 4 },
      part: data,
      status: 413,
      error: 'media_too_large',
    },
    {
      label: 'a kind not in media.kinds',
      media: { kinds: ['audio'] },
      part: data,
      status: 415,
      error: 'media_not_allowed',
    },
    {
      label: 'an external URL',
      part: {
        type: 'image',
        source: { type: 'url', value: 'https://example.com/cat.png' },
      },
      status: 400,
      error: 'media_url_not_allowed',
    },
  ]

  it.each(refused)(
    'refuses $label with $status, and starts no turn',
    async ({ media, part, status, error }) => {
      const { host, call, calls } = setup(media ? { media } : {})

      const response = await call('run', {
        method: 'POST',
        body: runBody('user-1-run', [question, part]),
        headers: { 'content-type': 'application/json' },
      })

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ error })
      expect(calls).toHaveLength(0)
      await host.close()
    },
  )
})

describe('request bodies over media.maxBodyBytes', () => {
  const routes = [
    {
      route: 'run',
      body: runBody('user-1-run', [{ type: 'text', text: 'hi' }]),
    },
    {
      route: 'control',
      body: JSON.stringify({
        threadId: 'user-1-run',
        input: { op: 'prompt', message: 'hi' },
      }),
    },
    {
      route: 'sessions',
      body: JSON.stringify({
        op: 'rename',
        threadId: 'user-1-run',
        title: 'x',
      }),
    },
  ]

  it.each(routes)('answers POST $route with 413', async ({ route, body }) => {
    const { host, call, calls } = setup({ media: { maxBodyBytes: 64 } })

    const response = await call(route, {
      method: 'POST',
      body: body.padEnd(65, ' '),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: 'The body is bigger than the limit of 64 bytes.',
    })
    expect(calls).toHaveLength(0)
    await host.close()
  })
})
