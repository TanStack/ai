import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'
import type { MediaRecord } from '@tanstack/ai-harness'

const BASE = '/api/harness-protocol'

// A 1x1 red PNG that the user sends, and the 1x1 blue PNG that the image
// agent makes (the aimock image in fixtures/harness/media.json).
const RED_DOT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQD3A0FDAAAAAElFTkSuQmCC',
  'base64',
)
const BLUE_DOT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNgYPgPAAEDAQA2dBFAAAAAAElFTkSuQmCC',
  'base64',
)

/** The media routes of the protocol handler, as the e2e principal. */
function mediaApi(
  request: APIRequestContext,
  testId: string,
  aimockPort: number,
) {
  const headers = {
    authorization: 'Bearer e2e-token',
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
  }
  return {
    headers,
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
    /** The signed URL of a file, from the media-url route. */
    async signedUrl(record: MediaRecord) {
      const query = new URLSearchParams({
        threadId: record.threadId,
        id: record.id,
      })
      const response = await request.get(`${BASE}/media-url?${query}`, {
        headers,
      })
      const body: { path: string } = await response.json()
      return `${BASE}/${body.path}`
    },
  }
}

test.describe('harness media', () => {
  test('serves an uploaded image from its signed URL without auth', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const api = mediaApi(request, testId, aimockPort)
    const record = await api.upload(`media-${testId}`, RED_DOT)

    const response = await request.get(await api.signedUrl(record))

    expect(record).toMatchObject({
      threadId: `media-${testId}`,
      kind: 'image',
      mimeType: 'image/png',
      name: 'dot.png',
      size: RED_DOT.byteLength,
      source: 'user',
    })
    expect(response.status()).toBe(200)
    expect(await response.body()).toEqual(RED_DOT)
    expect(response.headers()).toMatchObject({
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    })
  })

  test('refuses a signed URL whose file id was changed (403)', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const api = mediaApi(request, testId, aimockPort)
    const record = await api.upload(`media-sig-${testId}`, RED_DOT)
    const other = await api.upload(`media-sig-${testId}`, BLUE_DOT)
    const url = new URL(await api.signedUrl(record), 'http://e2e')

    url.searchParams.set('id', other.id)
    const response = await request.get(`${url.pathname}${url.search}`)

    expect(response.status()).toBe(403)
  })

  test('a prompt with an uploaded image runs the image agent, and its image loads from a signed URL', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const api = mediaApi(request, testId, aimockPort)
    const threadId = `media-run-${testId}`
    const upload = await api.upload(threadId, RED_DOT)

    // AG-UI text parts carry `text`. The media part has the TanStack shape.
    const run = await request.post(`${BASE}/run`, {
      headers: { ...api.headers, 'content-type': 'application/json' },
      data: {
        threadId,
        runId: 'client-run',
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: [
              {
                type: 'text',
                text: '[harness-media] paint a copy of this dot',
              },
              {
                type: 'image',
                source: {
                  type: 'url',
                  value: `harness-media:${upload.id}`,
                  mimeType: 'image/png',
                },
              },
            ],
          },
        ],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      },
    })
    const events = (await run.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)))
    // The stream also has the painter's own message. The last one is the
    // model's answer.
    const texts = events.filter(
      (event) => event.type === 'TEXT_MESSAGE_CONTENT',
    )
    const answer = texts
      .filter((event) => event.messageId === texts.at(-1)?.messageId)
      .map((event) => event.delta)
      .join('')
    const painted: MediaRecord = events.find(
      (event) => event.type === 'CUSTOM' && event.name === 'harness.media',
    )?.value

    expect(answer).toBe('Here is your blue dot.')
    expect(painted).toMatchObject({
      threadId,
      kind: 'image',
      mimeType: 'image/png',
      size: BLUE_DOT.byteLength,
      source: 'generated',
      subagentRunId: expect.stringMatching(/^subagent-/),
    })

    const image = await request.get(await api.signedUrl(painted))

    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')
    expect(await image.body()).toEqual(BLUE_DOT)
  })
})
