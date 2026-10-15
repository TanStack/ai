import { describe, expect, it } from 'vitest'
import { createHarnessClient } from '../src/client'
import type { MediaRecord } from '../src/client'

const record: MediaRecord = {
  id: 'm1',
  threadId: 'thread-m',
  kind: 'image',
  mimeType: 'image/png',
  name: 'cat photo.png',
  size: 3,
  source: 'user',
  createdAt: 1,
}

// A fake handler: it keeps each request and answers with `answer`.
function setup(answer: (request: Request) => Response) {
  const requests: Array<Request> = []
  const client = createHarnessClient({
    url: 'http://local/api/harness/',
    threadId: 'thread-m',
    headers: () => ({ authorization: 'Bearer t' }),
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return answer(request)
    },
  })
  return { client, requests }
}

// What the client sent in its first request.
async function sent(requests: Array<Request>) {
  const [request] = requests
  if (!request) throw new Error('The client sent no request')
  return {
    url: request.url,
    method: request.method,
    contentType: request.headers.get('content-type'),
    authorization: request.headers.get('authorization'),
    body: [...new Uint8Array(await request.arrayBuffer())],
  }
}

describe('client media', () => {
  it('uploads the raw bytes with their type and returns the stored record', async () => {
    const { client, requests } = setup(() => Response.json(record))

    // A view on a bigger buffer: only the bytes of the view are sent.
    const bytes = new Uint8Array([0, 1, 2, 3, 9]).subarray(1, 4)

    const stored = await client.upload(bytes, {
      name: 'cat photo.png',
      mimeType: 'image/png',
    })

    expect(stored).toEqual(record)
    expect(await sent(requests)).toEqual({
      url: 'http://local/api/harness/media?threadId=thread-m&name=cat+photo.png',
      method: 'POST',
      contentType: 'image/png',
      authorization: 'Bearer t',
      body: [1, 2, 3],
    })
  })

  it('throws with the status and the error of a refused upload', async () => {
    const { client } = setup(() =>
      Response.json({ error: 'The file is over 100 MB' }, { status: 413 }),
    )

    await expect(
      client.upload(new Blob(['big']), {
        name: 'big.mp4',
        mimeType: 'video/mp4',
      }),
    ).rejects.toThrow('Harness upload failed (413): The file is over 100 MB')
  })

  it('throws with the status text when a proxy refuses the upload with a page', async () => {
    const { client } = setup(
      () =>
        new Response('<html>Too large</html>', {
          status: 413,
          statusText: 'Payload Too Large',
        }),
    )

    await expect(
      client.upload(new ArrayBuffer(3), {
        name: 'a.png',
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('Harness upload failed (413): Payload Too Large')
  })

  it('throws a clear error when the upload answer is not a media record', async () => {
    const { client } = setup(() => Response.json({ id: 'm1' }))

    await expect(
      client.upload(new Blob(['abc']), {
        name: 'a.png',
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('Harness upload failed: the answer is not a media record')
  })

  it('makes the signed path of a media file an absolute url', async () => {
    const { client, requests } = setup(() =>
      Response.json({
        path: 'media?threadId=thread-m&id=m1&exp=5000&sig=abc',
        expiresAt: 5000,
      }),
    )

    expect(await client.mediaUrl('m1')).toEqual({
      url: 'http://local/api/harness/media?threadId=thread-m&id=m1&exp=5000&sig=abc',
      expiresAt: 5000,
    })
    expect(await sent(requests)).toEqual({
      url: 'http://local/api/harness/media-url?threadId=thread-m&id=m1',
      method: 'GET',
      contentType: null,
      authorization: 'Bearer t',
      body: [],
    })
  })

  it('throws when the media-url answer has no signed path', async () => {
    const { client } = setup(() => Response.json({ expiresAt: 5000 }))

    await expect(client.mediaUrl('m1')).rejects.toThrow(
      'Harness media-url failed: the answer has no signed path',
    )
  })

  it('loads the bytes of a media file', async () => {
    const { client, requests } = setup(
      () => new Response(new Uint8Array([7, 8, 9])),
    )

    expect([...(await client.loadMedia('m1'))]).toEqual([7, 8, 9])
    expect(await sent(requests)).toEqual({
      url: 'http://local/api/harness/media?threadId=thread-m&id=m1',
      method: 'GET',
      contentType: null,
      authorization: 'Bearer t',
      body: [],
    })
  })

  it('throws instead of returning the error page of a missing media file', async () => {
    const { client } = setup(() => new Response('not found', { status: 404 }))

    await expect(client.loadMedia('gone')).rejects.toThrow(
      'Harness media failed (404)',
    )
  })
})
