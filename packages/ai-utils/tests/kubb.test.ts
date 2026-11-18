import { describe, expect, it } from 'vitest'
import { sendWith } from '../src/kubb'
import type { GeneratedRequest } from '../src/kubb'

describe('sendWith', () => {
  it('hands the built request to send and returns its Response unread', async () => {
    const sent: Array<GeneratedRequest> = []
    const reply = new Response('{"ok":true}', {
      headers: { 'content-type': 'application/json' },
    })
    const client = sendWith(async (request) => {
      sent.push(request)
      return await Promise.resolve(reply)
    })

    const result = await client({
      method: 'POST',
      url: '/v1/items/{item_id}',
      path: { item_id: 'a b' },
      body: { name: 'x' },
      contentType: { request: 'application/json' },
    })

    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/v1/items/a%20b',
        headers: { 'Content-Type': 'application/json' },
        body: '{"name":"x"}',
        signal: undefined,
      },
    ])
    expect(result.response).toBe(reply)
    expect(reply.bodyUsed).toBe(false)
  })

  it('passes a FormData body through without a content type', async () => {
    let sent: GeneratedRequest | undefined
    const client = sendWith(async (request) => {
      sent = request
      return await Promise.resolve(new Response(null, { status: 204 }))
    })
    const form = new FormData()
    form.append('file', new Blob(['x']), 'a.txt')

    await client({
      method: 'POST',
      url: '/upload',
      body: form,
      contentType: { request: 'multipart/form-data' },
    })

    expect(sent?.body).toBe(form)
    expect(sent?.headers).toEqual({})
  })

  it('lets the sender throw for a failed request', async () => {
    const client = sendWith(() => Promise.reject(new Error('429')))
    await expect(client({ method: 'POST', url: '/x' })).rejects.toThrow('429')
  })
})
