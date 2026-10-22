import { test, expect } from './fixtures'
import { openHarnessThread } from './helpers'
import type { APIRequestContext } from '@playwright/test'
import type { MediaRecord } from '@tanstack/ai-harness'

/**
 * The life of a thread on the harness protocol: `POST sessions` with
 * `op: 'delete'` purges the thread (its messages, its index entry, and its
 * media files), and a read of a thread whose session closed on idle still
 * works. The `x-harness-idle: close` header picks a host in the route that
 * closes an idle session at once.
 */

const BASE = '/api/harness-protocol'
const ANSWER = 'Hello over the harness protocol.'
const NOT_FOUND = { status: 404, body: { error: 'not found' } }
// A 1x1 red PNG.
const RED_DOT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQD3A0FDAAAAAElFTkSuQmCC',
  'base64',
)

/** The routes of the protocol handler, as the e2e user. */
function harnessApi(
  request: APIRequestContext,
  {
    testId,
    aimockPort,
    extraHeaders = {},
  }: {
    testId: string
    aimockPort: number
    extraHeaders?: Record<string, string>
  },
) {
  const headers = {
    authorization: 'Bearer e2e-token',
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
    ...extraHeaders,
  }
  const json = { ...headers, 'content-type': 'application/json' }
  /** A GET of a thread route, as its status and its JSON body. */
  const read = async (route: string, query: Record<string, string>) => {
    const response = await request.get(
      `${BASE}/${route}?${new URLSearchParams(query)}`,
      { headers },
    )
    return { status: response.status(), body: await response.json() }
  }
  return {
    headers,
    read,
    /** Send the hello prompt of the protocol fixture, and wait for its end. */
    async send(threadId: string, runId: string) {
      const response = await request.post(`${BASE}/run`, {
        headers: json,
        data: {
          threadId,
          // The run id is also the input id, so each run needs its own.
          runId,
          messages: [
            { id: 'u1', role: 'user', content: '[harness-protocol] hello' },
          ],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        },
      })
      // The stream ends when the turn ends.
      return response.text()
    },
    /** The role of each saved message, and the text of each answer. */
    async transcript(threadId: string) {
      const { status, body } = await read('transcript', { threadId })
      const messages: Array<{ role: string; content: unknown }> = body
      return {
        status,
        roles: messages.map((message) => message.role),
        answers: messages
          .filter((message) => message.role === 'assistant')
          .map((message) => message.content),
      }
    },
    /** Upload `bytes` as a PNG file of `threadId`. */
    async upload(threadId: string, bytes: Buffer) {
      const query = new URLSearchParams({ threadId, name: 'dot.png' })
      const response = await request.post(`${BASE}/media?${query}`, {
        headers: { ...headers, 'content-type': 'image/png' },
        data: bytes,
      })
      const record: MediaRecord = await response.json()
      return record
    },
    /** A GET of the file `id` of `threadId`, with the login of the user. */
    media: (threadId: string, id: string) =>
      request.get(`${BASE}/media?${new URLSearchParams({ threadId, id })}`, {
        headers,
      }),
    /** The signed URL of a file, from the media-url route. */
    async signedUrl(record: MediaRecord) {
      const { body } = await read('media-url', {
        threadId: record.threadId,
        id: record.id,
      })
      const signed: { path: string } = body
      return `${BASE}/${signed.path}`
    },
    /** Delete the thread with `POST sessions`. */
    async remove(threadId: string) {
      const response = await request.post(`${BASE}/sessions`, {
        headers: json,
        data: { op: 'delete', threadId },
      })
      return response.status()
    },
  }
}

test.describe('harness lifecycle', () => {
  test('a delete removes the media files of the thread, also from a signed URL', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const api = harnessApi(request, { testId, aimockPort })
    const threadId = `lifecycle-media-${testId}`
    const record = await api.upload(threadId, RED_DOT)
    const url = await api.signedUrl(record)

    const before = await api.media(threadId, record.id)
    expect(before.status()).toBe(200)
    expect(await before.body()).toEqual(RED_DOT)

    expect(await api.remove(threadId)).toBe(204)

    const after = await api.media(threadId, record.id)
    expect({ status: after.status(), body: await after.json() }).toEqual(
      NOT_FOUND,
    )
    // The signature is still good, but the thread is gone.
    const signed = await request.get(url, { headers: api.headers })
    expect({ status: signed.status(), body: await signed.json() }).toEqual(
      NOT_FOUND,
    )

    // The same thread id again: it has an entry, but not the old file.
    await openHarnessThread(request, api.headers, threadId)
    const reopened = await api.media(threadId, record.id)
    expect({ status: reopened.status(), body: await reopened.json() }).toEqual(
      NOT_FOUND,
    )
  })

  test('a delete removes the messages, and a new prompt on the same id starts an empty transcript', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const api = harnessApi(request, { testId, aimockPort })
    const threadId = `lifecycle-delete-${testId}`
    await api.send(threadId, `lifecycle-first-${testId}`)
    expect(await api.transcript(threadId)).toEqual({
      status: 200,
      roles: ['user', 'assistant'],
      answers: [ANSWER],
    })

    expect(await api.remove(threadId)).toBe(204)

    // With host access, a read of a thread with no entry is 404.
    expect(await api.read('transcript', { threadId })).toEqual(NOT_FOUND)
    expect(await api.read('snapshot', { threadId })).toEqual(NOT_FOUND)

    await api.send(threadId, `lifecycle-again-${testId}`)
    // Only the new turn: the first user message and answer are gone.
    expect(await api.transcript(threadId)).toEqual({
      status: 200,
      roles: ['user', 'assistant'],
      answers: [ANSWER],
    })
  })

  test('a thread whose session closed on idle still answers its reads', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const api = harnessApi(request, {
      testId,
      aimockPort,
      extraHeaders: { 'x-harness-idle': 'close' },
    })
    const threadId = `lifecycle-idle-${testId}`
    await api.send(threadId, `lifecycle-idle-${testId}`)

    // The turn ended, so the host closed the session. The reads load the
    // thread from the store.
    expect(await api.read('snapshot', { threadId })).toMatchObject({
      status: 200,
      body: {
        threadId,
        status: 'idle',
        activeOperations: [],
        pendingWaits: [],
      },
    })
    expect(await api.transcript(threadId)).toEqual({
      status: 200,
      roles: ['user', 'assistant'],
      answers: [ANSWER],
    })
  })
})
