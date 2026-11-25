import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeshyApiError, createMeshyClient, mapMeshyStatus } from '../src/client'
import type { MeshyTask } from '../src/client'

const jsonResponse = (
  body: object,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
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

function createTask(overrides?: Partial<MeshyTask>): MeshyTask {
  return { id: 'task-1', status: 'PENDING', ...overrides }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createMeshyClient', () => {
  it('sends a Bearer key from MESHY_API_KEY', async () => {
    vi.stubEnv('MESHY_API_KEY', 'env-key')
    const fetch = fakeFetch(jsonResponse({ result: 'task-1' }))
    const client = createMeshyClient({ fetch })

    const result = await client.post('/v2/text-to-3d', { prompt: 'a chest' })

    expect(result).toEqual({ result: 'task-1' })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://api.meshy.ai/openapi/v2/text-to-3d')
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer env-key',
    )
  })

  it('throws MeshyApiError with Meshy message and status', async () => {
    const fetch = fakeFetch(jsonResponse({ message: 'Invalid model' }, 400))
    const client = createMeshyClient({ apiKey: 'key', fetch })

    const error = await client
      .post('/v2/text-to-3d', { prompt: 'a chest' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(MeshyApiError)
    expect(error).toMatchObject({
      name: 'MeshyApiError',
      status: 400,
      message: 'Meshy request failed (400): Invalid model',
    })
  })

  it('does not retry a POST that fails with 500', async () => {
    const fetch = fakeFetch(
      jsonResponse({ message: 'Server error' }, 500),
      jsonResponse({ result: 'task-2' }),
    )
    const client = createMeshyClient({ apiKey: 'key', fetch })

    await expect(
      client.post('/v1/image-to-3d', { image_url: 'https://x/y.png' }),
    ).rejects.toMatchObject({ status: 500 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry a POST that fails with 429 NoMorePendingTasks', async () => {
    const fetch = fakeFetch(
      jsonResponse({ message: 'NoMorePendingTasks' }, 429, {
        'retry-after': '0',
      }),
      jsonResponse({ result: 'task-2' }),
    )
    const client = createMeshyClient({ apiKey: 'key', fetch })

    await expect(
      client.post('/v1/rigging', { input_task_id: 'task-1' }),
    ).rejects.toMatchObject({
      status: 429,
      message: 'Meshy request failed (429): NoMorePendingTasks',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries a GET on 429 with Retry-After', async () => {
    const fetch = fakeFetch(
      jsonResponse({ message: 'Too many requests' }, 429, {
        'retry-after': '0',
      }),
      jsonResponse({ id: 'task-1', status: 'SUCCEEDED' }),
    )
    const client = createMeshyClient({ apiKey: 'key', fetch })

    const task = await client.get('/v2/text-to-3d/task-1')

    expect(task).toEqual({ id: 'task-1', status: 'SUCCEEDED' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('mapMeshyStatus', () => {
  it('mapMeshyStatus maps every status', () => {
    expect(mapMeshyStatus(createTask({ status: 'PENDING' }))).toEqual({
      status: 'pending',
    })
    expect(
      mapMeshyStatus(createTask({ status: 'IN_PROGRESS', progress: 40 })),
    ).toEqual({ status: 'processing', progress: 40 })
    expect(
      mapMeshyStatus(createTask({ status: 'SUCCEEDED', progress: 100 })),
    ).toEqual({ status: 'completed', progress: 100 })
    expect(
      mapMeshyStatus(
        createTask({
          status: 'FAILED',
          task_error: { message: 'Mesh is broken' },
        }),
      ),
    ).toEqual({ status: 'failed', error: 'Mesh is broken' })
    expect(
      mapMeshyStatus(createTask({ status: 'CANCELED', task_error: null })),
    ).toEqual({ status: 'failed', error: 'Meshy task CANCELED' })
  })
})
