import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '../src/memory'
import { reconstructChat } from '../src/reconstruct'

describe('reconstructChat', () => {
  it('returns stored messages for a known threadId', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages!.saveThread('t1', [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])

    const response = await reconstructChat(
      persistence,
      new Request('http://example.test/api/chat?threadId=t1'),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as Array<{ role: string }>
    expect(body).toHaveLength(2)
    expect(body[0]?.role).toBe('user')
  })

  it('returns [] when threadId is missing or unknown', async () => {
    const persistence = memoryPersistence()
    const missing = await reconstructChat(
      persistence,
      new Request('http://example.test/api/chat'),
    )
    expect(await missing.json()).toEqual([])

    const unknown = await reconstructChat(
      persistence,
      new Request('http://example.test/api/chat?threadId=nope'),
    )
    expect(await unknown.json()).toEqual([])
  })

  it('returns 403 when authorize returns false', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages!.saveThread('t1', [
      { role: 'user', content: 'secret' },
    ])

    const response = await reconstructChat(
      persistence,
      new Request('http://example.test/api/chat?threadId=t1'),
      { authorize: () => false },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  it('returns a custom Response from authorize', async () => {
    const persistence = memoryPersistence()
    const response = await reconstructChat(
      persistence,
      new Request('http://example.test/api/chat?threadId=t1'),
      {
        authorize: () =>
          new Response(JSON.stringify({ error: 'login' }), { status: 401 }),
      },
    )
    expect(response.status).toBe(401)
  })

  it('honors a custom query param name', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages!.saveThread('custom-id', [
      { role: 'user', content: 'via-param' },
    ])
    const response = await reconstructChat(
      persistence,
      new Request('http://example.test/api/chat?id=custom-id'),
      { param: 'id' },
    )
    const body = (await response.json()) as Array<{ content: string }>
    expect(body[0]?.content).toBe('via-param')
  })
})
