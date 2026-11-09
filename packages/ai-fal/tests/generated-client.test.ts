import { describe, expect, it } from 'vitest'
import { createFalClient } from '../src/client'

/** The queue submit and result calls go through the generated fal client. */
function fakeFal() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init })
    return Response.json(
      { request_id: 'req-1', images: [] },
      { headers: { 'x-fal-request-id': 'req-1' } },
    )
  }
  return { calls, fetchImpl }
}

describe('generated fal queue client', () => {
  it('submits to the queue host with the endpoint id slashes kept', async () => {
    const { calls, fetchImpl } = fakeFal()
    const client = createFalClient({ credentials: 'k', fetch: fetchImpl })

    await client.queue.submit('fal-ai/flux/dev', { input: { prompt: 'a cat' } })

    expect(calls).toEqual([
      {
        url: 'https://queue.fal.run/fal-ai/flux/dev',
        init: expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ prompt: 'a cat' }),
          headers: expect.objectContaining({
            Authorization: 'Key k',
            'Content-Type': 'application/json',
            'x-fal-queue-priority': 'normal',
          }),
        }),
      },
    ])
  })

  it('fetches the result from the owner/alias queue path', async () => {
    const { calls, fetchImpl } = fakeFal()
    const client = createFalClient({ credentials: 'k', fetch: fetchImpl })

    const result = await client.queue.result('fal-ai/flux/dev', {
      requestId: 'req-1',
    })

    expect(result).toEqual({
      data: { request_id: 'req-1', images: [] },
      requestId: 'req-1',
    })
    expect(calls).toEqual([
      {
        url: 'https://queue.fal.run/fal-ai/flux/requests/req-1',
        init: expect.objectContaining({
          method: 'GET',
          body: undefined,
          headers: expect.objectContaining({ Authorization: 'Key k' }),
        }),
      },
    ])
  })
})
