import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TripoApiError,
  createTripoClient,
  mapTripoStatus,
  tripoInputFor,
} from '../src/client'
import type { TripoTask } from '../src/client'

const jsonResponse = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// A fake fetch that answers with the given responses, in order.
function fakeFetch(...responses: Array<Response>) {
  const queue = [...responses]
  return vi.fn<typeof fetch>(async () => {
    const next = queue.shift()
    if (!next) throw new Error('fakeFetch: no response left')
    return next
  })
}

function clientWith(...responses: Array<Response>) {
  const fetch = fakeFetch(...responses)
  return { fetch, client: createTripoClient({ apiKey: 'key', fetch }) }
}

function createTask(overrides?: Partial<TripoTask>): TripoTask {
  return { task_id: 'task-1', status: 'queued', ...overrides }
}

// The `file` entry of the first request's FormData body.
function uploadedFile(fetch: ReturnType<typeof fakeFetch>) {
  const form = fetch.mock.calls[0]?.[1]?.body
  if (!(form instanceof FormData)) throw new Error('expected FormData')
  const file = form.get('file')
  if (!(file instanceof File)) throw new Error('expected a File')
  return file
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createTripoClient', () => {
  it('sends a Bearer key from TRIPO_API_KEY and unwraps data', async () => {
    vi.stubEnv('TRIPO_API_KEY', 'env-key')
    const fetch = fakeFetch(jsonResponse({ code: 0, data: { task_id: 't1' } }))
    const client = createTripoClient({ fetch })

    const result = await client.post('/generation/text-to-model', {
      prompt: 'a chest',
    })

    expect(result).toEqual({ task_id: 't1' })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://openapi.tripo3d.ai/v3/generation/text-to-model')
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer env-key',
    )
  })

  it('unwraps data on a GET', async () => {
    const { client } = clientWith(
      jsonResponse({ code: 0, data: { task_id: 't1', status: 'running' } }),
    )

    expect(await client.get('/tasks/t1')).toEqual({
      task_id: 't1',
      status: 'running',
    })
  })

  it('throws TripoApiError for a 200 body with a code that is not 0', async () => {
    const { client } = clientWith(
      jsonResponse({
        code: 1004,
        message: 'One or more of your parameter is invalid',
        suggestion: 'Check prompt',
      }),
    )

    const error = await client
      .post('/generation/text-to-model', { prompt: '' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripoApiError)
    expect(error).toMatchObject({
      status: 200,
      code: 1004,
      suggestion: 'Check prompt',
      message:
        'Tripo request failed (200): One or more of your parameter is invalid',
    })
  })

  it('throws TripoApiError with the HTTP status on a 401', async () => {
    const { client } = clientWith(
      jsonResponse({ code: 2, message: 'Authentication required' }, 401),
    )

    await expect(client.post('/files', { x: 1 })).rejects.toMatchObject({
      name: 'TripoApiError',
      status: 401,
      code: 2,
      message: 'Tripo request failed (401): Authentication required',
    })
  })

  it('does not retry a POST that fails with 500', async () => {
    const { client, fetch } = clientWith(
      jsonResponse({ code: 1000, message: 'Unknown error' }, 500),
      jsonResponse({ code: 0, data: { task_id: 't2' } }),
    )

    await expect(
      client.post('/generation/text-to-model', { prompt: 'a chest' }),
    ).rejects.toMatchObject({ status: 500 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('uploads a Blob as the FormData field file and returns the token', async () => {
    const { client, fetch } = clientWith(
      jsonResponse({ code: 0, data: { file_token: 'file_abc' } }),
    )

    const token = await client.upload(
      new Blob(['png-bytes'], { type: 'image/png' }),
    )

    expect(token).toBe('file_abc')
    expect(fetch.mock.calls[0]?.[0]).toBe('https://openapi.tripo3d.ai/v3/files')
    const file = uploadedFile(fetch)
    expect(file.name).toBe('upload.png')
    expect(await file.text()).toBe('png-bytes')
  })

  it('throws before a request when the upload type is unknown', async () => {
    const { client, fetch } = clientWith()

    await expect(
      client.upload(new Blob(['x'], { type: 'application/octet-stream' })),
    ).rejects.toThrow(/^tripo: cannot upload a file of type/)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('mapTripoStatus', () => {
  it.each([
    [{ status: 'queued' }, { status: 'pending' }],
    [
      { status: 'running', progress: 40 },
      { status: 'processing', progress: 40 },
    ],
    [
      { status: 'success', progress: 100 },
      { status: 'completed', progress: 100 },
    ],
    [
      { status: 'failed', error_message: 'Mesh is broken' },
      { status: 'failed', error: 'Mesh is broken' },
    ],
    [
      { status: 'cancelled' },
      { status: 'failed', error: 'Tripo task cancelled' },
    ],
    [{ status: 'banned' }, { status: 'failed', error: 'Tripo task banned' }],
    [{ status: 'expired' }, { status: 'failed', error: 'Tripo task expired' }],
    [{ status: 'unknown' }, { status: 'processing' }],
  ])('maps %o', (task, expected) => {
    expect(mapTripoStatus(createTask(task))).toEqual(expected)
  })
})

describe('tripoInputFor', () => {
  it('returns a url source as it is', async () => {
    const { client, fetch } = clientWith()

    const input = await tripoInputFor(client, {
      type: 'url',
      value: 'https://example.com/cat.png',
    })

    expect(input).toBe('https://example.com/cat.png')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a tripo file source value', async () => {
    const { client } = clientWith()

    expect(
      await tripoInputFor(client, {
        type: 'file',
        value: 'task-1',
        provider: 'tripo',
      }),
    ).toBe('task-1')
  })

  it('throws for a file source from another provider', async () => {
    const { client } = clientWith()

    await expect(
      tripoInputFor(client, {
        type: 'file',
        value: 'file-1',
        provider: 'openai',
      }),
    ).rejects.toThrow('tripo: file source was issued by openai')
  })

  it('uploads a data source once and returns the token', async () => {
    const { client, fetch } = clientWith(
      jsonResponse({ code: 0, data: { file_token: 'file_xyz' } }),
    )

    const input = await tripoInputFor(client, {
      type: 'data',
      value: btoa('jpeg-bytes'),
      mimeType: 'image/jpeg',
    })

    expect(input).toBe('file_xyz')
    expect(fetch).toHaveBeenCalledTimes(1)
    const file = uploadedFile(fetch)
    expect(file.name).toBe('upload.jpg')
    expect(await file.text()).toBe('jpeg-bytes')
  })
})
