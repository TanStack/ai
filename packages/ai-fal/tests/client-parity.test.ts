import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFalClient as createSdkClient } from '@fal-ai/client'
import { createFalClient } from '../src/client'
import type { FalClient, FalClientOptions } from '../src/client'

/**
 * Runs the real `@fal-ai/client` and our client against the same fake fal
 * server, then compares the requests they send and what they return or throw.
 */

interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
}

type Route = (url: string, method: string) => Response

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init)

function createFakeServer(route: Route) {
  const calls: Array<RecordedCall> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = Object.fromEntries(new Headers(init?.headers))
    // The SDK sends its own user agent. Ours sends none.
    delete headers['user-agent']
    const rawBody = init?.body
    const body =
      typeof rawBody === 'string'
        ? rawBody
        : rawBody instanceof Blob
          ? await rawBody.text()
          : undefined
    calls.push({ url, method, headers, body })
    if (init?.signal?.aborted) {
      throw new DOMException('This operation was aborted', 'AbortError')
    }
    // A proxy forwards to the URL in `x-fal-target-url`.
    return route(headers['x-fal-target-url'] ?? url, method)
  }
  return { calls, fetchImpl }
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return { thrown: error }
  return {
    ...error,
    name: error.name,
    message: error.message,
    fieldErrors:
      'fieldErrors' in error ? error.fieldErrors : 'no fieldErrors getter',
  }
}

async function runOn(
  makeClient: (options: FalClientOptions) => FalClient,
  makeRoute: () => Route,
  run: (client: FalClient) => Promise<unknown>,
  options: Partial<FalClientOptions> = {},
) {
  const server = createFakeServer(makeRoute())
  const client = makeClient({
    credentials: 'test-key',
    fetch: server.fetchImpl,
    ...options,
  })
  const outcome = await run(client).then(
    (value) => ({ value }),
    (error: unknown) => ({ error: describeError(error) }),
  )
  return { calls: server.calls, outcome }
}

/**
 * The SDK client takes the same calls at runtime. Its types use the SDK's own
 * endpoint map instead of the generated one, so it is cast here to compare
 * the wire output.
 */
const sdkClient = (options: FalClientOptions) =>
  createSdkClient(options) as unknown as FalClient

/** Runs the same calls on both clients and checks they match. */
async function expectParity(
  makeRoute: () => Route,
  run: (client: FalClient) => Promise<unknown>,
  options: Partial<FalClientOptions> = {},
) {
  const sdk = await runOn(sdkClient, makeRoute, run, options)
  const ours = await runOn(createFalClient, makeRoute, run, options)
  expect(ours.calls).toEqual(sdk.calls)
  expect(ours.outcome).toEqual(sdk.outcome)
  return ours
}

const UPLOAD_INITIATE =
  'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3'

/** A fal queue that is IN_PROGRESS once, then COMPLETED. */
function queueRoute(): Route {
  let statusCalls = 0
  return (url, method) => {
    if (url === UPLOAD_INITIATE) {
      return json({
        upload_url: 'https://storage.example/upload/1',
        file_url: 'https://fal.media/files/audio.wav',
      })
    }
    if (method === 'PUT') return new Response(null, { status: 200 })
    if (method === 'POST') {
      return json({
        request_id: 'req-1',
        status: 'IN_QUEUE',
        queue_position: 2,
        response_url: 'https://queue.fal.run/fal-ai/flux/requests/req-1',
      })
    }
    if (url.includes('/status')) {
      statusCalls += 1
      return json({
        request_id: 'req-1',
        status: statusCalls === 1 ? 'IN_PROGRESS' : 'COMPLETED',
        logs: [],
      })
    }
    return json(
      { images: [{ url: 'https://fal.media/files/out.png' }] },
      { headers: { 'x-fal-request-id': 'req-1' } },
    )
  }
}

describe('fal client parity with @fal-ai/client', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('subscribe submits, polls until COMPLETED, then reads the result', async () => {
    const ours = await expectParity(queueRoute, (client) =>
      client.subscribe('fal-ai/flux/dev', { input: { prompt: 'a cat' } }),
    )

    expect(ours.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://queue.fal.run/fal-ai/flux/dev',
      'GET https://queue.fal.run/fal-ai/flux/requests/req-1/status?logs=0',
      'GET https://queue.fal.run/fal-ai/flux/requests/req-1/status?logs=0',
      'GET https://queue.fal.run/fal-ai/flux/requests/req-1',
    ])
    expect(ours.calls[0]!.headers).toMatchObject({
      authorization: 'Key test-key',
      'x-fal-queue-priority': 'normal',
    })
    expect(ours.outcome).toEqual({
      value: {
        data: { images: [{ url: 'https://fal.media/files/out.png' }] },
        requestId: 'req-1',
      },
    })
  })

  it('subscribe uploads a Blob found inside the input', async () => {
    const audio = new Blob(['RIFF'], { type: 'audio/wav' })
    const ours = await expectParity(queueRoute, (client) =>
      client.subscribe('acme/transcribe', {
        input: { audio_url: audio, options: { tags: ['a', 1] } },
      }),
    )

    expect(ours.calls[0]).toEqual({
      url: UPLOAD_INITIATE,
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Key test-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content_type: 'audio/wav',
        file_name: '1700000000000.wav',
      }),
    })
    expect(JSON.parse(ours.calls[2]!.body!)).toEqual({
      audio_url: 'https://fal.media/files/audio.wav',
      options: { tags: ['a', 1] },
    })
  })

  it('sends requests through proxyUrl in a browser, with the target header', async () => {
    vi.stubGlobal('window', { document: {} })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ours = await expectParity(
      queueRoute,
      (client) =>
        client.subscribe('fal-ai/whisper', {
          input: { audio_url: new Blob(['RIFF'], { type: 'audio/wav' }) },
        }),
      { proxyUrl: '/api/fal/proxy' },
    )

    expect(ours.calls[0]!.url).toBe('/api/fal/proxy')
    expect(ours.calls[0]!.headers['x-fal-target-url']).toBe(UPLOAD_INITIATE)
    expect(ours.calls[1]!.url).toBe('https://storage.example/upload/1')
    // The SDK and our client both warn once per client about browser keys.
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('does not use proxyUrl outside a browser', async () => {
    const ours = await expectParity(
      queueRoute,
      (client) =>
        client.queue.submit('fal-ai/flux/dev', { input: { prompt: 'x' } }),
      { proxyUrl: '/api/fal/proxy' },
    )

    expect(ours.calls[0]!.url).toBe('https://queue.fal.run/fal-ai/flux/dev')
  })

  it('queue.submit, status (with logs), and result use the owner/alias URL rule', async () => {
    const ours = await expectParity(queueRoute, async (client) => [
      await client.queue.submit('workflows/acme/flow/run', {
        input: { prompt: 'x' },
      }),
      await client.queue.status('workflows/acme/flow/run', {
        requestId: 'req-1',
        logs: true,
      }),
      await client.queue.result('fal-ai/flux/dev', { requestId: 'req-1' }),
    ])

    expect(ours.calls.map((call) => call.url)).toEqual([
      'https://queue.fal.run/workflows/acme/flow/run',
      'https://queue.fal.run/workflows/acme/flow/requests/req-1/status?logs=1',
      'https://queue.fal.run/fal-ai/flux/requests/req-1',
    ])
  })

  it('storage.upload sends the lifecycle header and PUTs the file', async () => {
    const file = new File(['png-bytes'], 'photo.png', { type: 'image/png' })
    const ours = await expectParity(queueRoute, (client) =>
      client.storage.upload(file, { lifecycle: { expiresIn: '1d' } }),
    )

    expect(ours.calls[0]!.headers['x-fal-object-lifecycle']).toBe(
      '{"expiration_duration_seconds":86400}',
    )
    expect(ours.calls[1]).toEqual({
      url: 'https://storage.example/upload/1',
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: 'png-bytes',
    })
    expect(ours.outcome).toEqual({ value: 'https://fal.media/files/audio.wav' })
  })

  it('storage.upload over 90 MB uses the SDK multipart upload', async () => {
    const big = new Blob([], { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: 91 * 1024 * 1024 })
    const multipartRoute = (): Route => (url) => {
      if (url.includes('initiate-multipart')) {
        return json({
          upload_url: 'https://storage.example/multi?sig=1',
          file_url: 'https://fal.media/files/big.mp4',
        })
      }
      if (url.includes('/complete')) return json({ ok: true })
      return json({ partNumber: 1, etag: 'etag' })
    }

    const ours = await expectParity(multipartRoute, (client) =>
      client.storage.upload(big),
    )

    expect(ours.calls.at(-1)!.url).toBe(
      'https://storage.example/multi/complete?sig=1',
    )
    expect(ours.outcome).toEqual({ value: 'https://fal.media/files/big.mp4' })
  })

  it('stops at once with an AbortError when the signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const ours = await expectParity(queueRoute, (client) =>
      client.subscribe('fal-ai/flux/dev', {
        input: { prompt: 'x' },
        abortSignal: controller.signal,
      }),
    )

    expect(ours.calls).toHaveLength(1)
    expect(ours.outcome).toMatchObject({ error: { name: 'AbortError' } })
  })

  it('throws ApiError with the JSON message on a 4xx', async () => {
    const ours = await expectParity(
      () => () =>
        json(
          { message: 'Request not found' },
          { status: 404, headers: { 'x-fal-request-id': 'req-404' } },
        ),
      (client) => client.queue.result('fal-ai/flux/dev', { requestId: 'x' }),
    )

    expect(ours.outcome).toMatchObject({
      error: {
        name: 'ApiError',
        message: 'Request not found',
        status: 404,
        requestId: 'req-404',
      },
    })
  })

  it('throws ApiError "HTTP <status>: <text>" when the body is not JSON', async () => {
    const ours = await expectParity(
      () => () =>
        new Response('nope', { status: 400, statusText: 'Bad Request' }),
      (client) => client.queue.submit('acme/custom-app', { input: {} }),
    )

    expect(ours.outcome).toMatchObject({
      error: { name: 'ApiError', message: 'HTTP 400: Bad Request' },
    })
  })

  it('throws ValidationError with field errors on a 422', async () => {
    const detail = [
      { loc: ['body', 'prompt'], msg: 'field required', type: 'missing' },
    ]
    const ours = await expectParity(
      () => () =>
        json({ detail }, { status: 422, statusText: 'Unprocessable Entity' }),
      (client) => client.queue.result('fal-ai/flux/dev', { requestId: 'x' }),
    )

    expect(ours.outcome).toMatchObject({
      error: {
        name: 'ValidationError',
        message: 'Unprocessable Entity',
        status: 422,
        body: { detail },
        fieldErrors: detail,
      },
    })
  })
})
