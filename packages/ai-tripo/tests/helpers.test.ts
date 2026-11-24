import { describe, expect, it, vi } from 'vitest'
import { checkTripoRig, getTripoBalance, uploadTripoFile } from '../src/helpers'
import type { ContentPartSource } from '@tanstack/ai'
import type { CheckTripoRigOptions } from '../src/helpers'

// A fake fetch that answers with `{ code: 0, data }` for each body, in order.
function fakeFetch(...data: Array<object>) {
  const queue = [...data]
  return vi.fn<typeof fetch>(async () => {
    const next = queue.shift()
    if (!next) throw new Error('fakeFetch: no response left')
    return new Response(JSON.stringify({ code: 0, data: next }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
}

type FakeFetch = ReturnType<typeof fakeFetch>

function requestPath(fetch: FakeFetch, index: number) {
  return new URL(String(fetch.mock.calls[index]?.[0])).pathname
}

function requestBody(fetch: FakeFetch, index: number) {
  return JSON.parse(String(fetch.mock.calls[index]?.[1]?.body))
}

const glbUrl: ContentPartSource = {
  type: 'url',
  value: 'https://cdn.test/knight.glb',
}

function checkRig(
  fetch: FakeFetch,
  source: ContentPartSource = glbUrl,
  options?: CheckTripoRigOptions,
) {
  return checkTripoRig(source, {
    apiKey: 'key',
    fetch,
    pollInterval: 0,
    ...options,
  })
}

describe('getTripoBalance', () => {
  it('returns balance and frozen from GET /account/balance', async () => {
    const fetch = fakeFetch({ balance: 10000, frozen: 200 })

    const balance = await getTripoBalance({ apiKey: 'key', fetch })

    expect(balance).toEqual({ balance: 10000, frozen: 200 })
    expect(requestPath(fetch, 0)).toBe('/v3/account/balance')
  })
})

describe('checkTripoRig', () => {
  it('polls a queued task until success and returns the rig type', async () => {
    const fetch = fakeFetch(
      { task_id: 'rc-1' },
      { task_id: 'rc-1', status: 'queued' },
      {
        task_id: 'rc-1',
        status: 'success',
        output: { riggable: true, rig_type: 'biped' },
      },
    )

    const result = await checkRig(fetch)

    expect(result).toEqual({ riggable: true, rigType: 'biped' })
    expect(requestPath(fetch, 0)).toBe('/v3/animations/rig-check')
    expect(requestBody(fetch, 0)).toEqual({
      input: 'https://cdn.test/knight.glb',
    })
    expect(requestPath(fetch, 2)).toBe('/v3/tasks/rc-1')
  })

  it('uploads a data source first and sends the file_token as input', async () => {
    const fetch = fakeFetch(
      { file_token: 'file_abc' },
      { task_id: 'rc-1' },
      { task_id: 'rc-1', status: 'success', output: { riggable: false } },
    )

    const result = await checkRig(fetch, {
      type: 'data',
      value: 'Z2xURg==',
      mimeType: 'model/gltf-binary',
    })

    expect(result).toEqual({ riggable: false })
    expect(requestPath(fetch, 0)).toBe('/v3/files')
    expect(requestBody(fetch, 1)).toEqual({ input: 'file_abc' })
  })

  it('throws the Tripo error when the task fails', async () => {
    const fetch = fakeFetch(
      { task_id: 'rc-1' },
      {
        task_id: 'rc-1',
        status: 'failed',
        error_message: 'Model has no mesh',
      },
    )

    await expect(checkRig(fetch)).rejects.toThrow(
      'tripo: rig check failed: Model has no mesh',
    )
  })

  it('rejects with the abort reason during the wait and sends no more requests', async () => {
    const fetch = fakeFetch(
      { task_id: 'rc-1' },
      { task_id: 'rc-1', status: 'running' },
    )
    const controller = new AbortController()
    const reason = new Error('stopped')

    const outcome = checkRig(fetch, glbUrl, {
      pollInterval: 60_000,
      abortSignal: controller.signal,
    }).catch((error: unknown) => error)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    controller.abort(reason)

    expect(await outcome).toBe(reason)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('uploadTripoFile', () => {
  it('returns the file_token from POST /files', async () => {
    const fetch = fakeFetch({ file_token: 'file_xyz' })

    const token = await uploadTripoFile(
      new Blob(['png'], { type: 'image/png' }),
      { apiKey: 'key', fetch },
    )

    expect(token).toBe('file_xyz')
    expect(requestPath(fetch, 0)).toBe('/v3/files')
  })
})
