import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '../src/memory'
import { reconstructChat } from '../src/reconstruct'
import type { ReconstructedChat } from '../src/reconstruct'

async function body(response: Response): Promise<ReconstructedChat> {
  return (await response.json()) as ReconstructedChat
}

function textOf(message: ReconstructedChat['messages'][number]): string {
  const part = message.parts.find((p) => p.type === 'text')
  return part && 'content' in part ? (part.content ?? '') : ''
}

describe('reconstructChat', () => {
  it('returns the stored transcript (as UI messages) for a known threadId', async () => {
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
    const parsed = await body(response)
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[0]?.role).toBe('user')
    expect(textOf(parsed.messages[0]!)).toBe('hello')
    // No run is generating for the thread.
    expect(parsed.activeRun).toBeNull()
  })

  it('reports the active run for a thread that is still generating', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages!.saveThread('t1', [
      { role: 'user', content: 'write a long story' },
    ])
    await persistence.stores.runs!.createOrResume({
      runId: 'run-live',
      threadId: 't1',
      startedAt: 1000,
    })

    const response = await reconstructChat(
      persistence,
      new Request('http://example.test/api/chat?threadId=t1'),
    )
    const parsed = await body(response)
    expect(parsed.activeRun).toEqual({ runId: 'run-live' })

    // Once the run finishes, no active run is reported.
    await persistence.stores.runs!.update('run-live', { status: 'completed' })
    const after = await body(
      await reconstructChat(
        persistence,
        new Request('http://example.test/api/chat?threadId=t1'),
      ),
    )
    expect(after.activeRun).toBeNull()
  })

  it('returns an empty transcript and no active run when threadId is missing or unknown', async () => {
    const persistence = memoryPersistence()
    const missing = await body(
      await reconstructChat(
        persistence,
        new Request('http://example.test/api/chat'),
      ),
    )
    expect(missing).toEqual({ messages: [], activeRun: null, interrupts: null })

    const unknown = await body(
      await reconstructChat(
        persistence,
        new Request('http://example.test/api/chat?threadId=nope'),
      ),
    )
    expect(unknown).toEqual({ messages: [], activeRun: null, interrupts: null })
  })

  it('reports pending interrupts so a reload re-prompts the approval', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages!.saveThread('t1', [
      { role: 'user', content: 'send an email' },
    ])
    const payload = {
      id: 'int-1',
      type: 'tool-approval',
      toolName: 'sendEmail',
      toolCallId: 'call-1',
    }
    await persistence.stores.interrupts!.create({
      interruptId: 'int-1',
      runId: 'run-paused',
      threadId: 't1',
      requestedAt: 1000,
      payload,
    })

    const parsed = await body(
      await reconstructChat(
        persistence,
        new Request('http://example.test/api/chat?threadId=t1'),
      ),
    )
    expect(parsed.interrupts).toEqual({
      runId: 'run-paused',
      pending: [payload],
    })
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
    const parsed = await body(response)
    expect(textOf(parsed.messages[0]!)).toBe('via-param')
  })
})
