import { describe, expect, it } from 'vitest'
import type { ModelMessage } from '@tanstack/ai'
import { defineMessageStore, memoryPersistence } from '../src'
import type { MessageStore } from '../src'
import { reconstructChat } from '../src/reconstruct'
import type { ReconstructedChat } from '../src/reconstruct'

async function body(response: Response): Promise<ReconstructedChat> {
  return (await response.json()) as ReconstructedChat
}

function textOf(message: ReconstructedChat['messages'][number]): string {
  const part = message.parts.find((p) => p.type === 'text')
  return part && 'content' in part ? (part.content ?? '') : ''
}

function idsOf(parsed: ReconstructedChat) {
  return parsed.messages.map((message) => message.id)
}

function chatUrl(query = 'threadId=t1') {
  if (query === '') return 'http://example.test/api/chat'
  return `http://example.test/api/chat?${query}`
}

async function hydrate(
  persistence: Parameters<typeof reconstructChat>[0],
  url: string,
) {
  return body(await reconstructChat(persistence, new Request(url)))
}

async function saveThread(messages: Array<ModelMessage>, threadId = 't1') {
  const persistence = memoryPersistence()
  await persistence.stores.messages.saveThread(threadId, messages)
  return persistence
}

const threeTurnThread: Array<ModelMessage> = [
  { id: '1', role: 'user', content: 'one' },
  { id: '2', role: 'assistant', content: 'two' },
  { id: '3', role: 'user', content: 'three' },
]

describe('reconstructChat', () => {
  it('returns the stored transcript (as UI messages) for a known threadId', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages!.saveThread('t1', [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])

    const response = await reconstructChat(persistence, new Request(chatUrl()))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const parsed = await body(response)
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[0]?.role).toBe('user')
    expect(textOf(parsed.messages[0]!)).toBe('hello')
    // No run is generating for the thread.
    expect(parsed.activeRun).toBeNull()
  })

  it('restores persisted structured output as a message part', async () => {
    const persistence = memoryPersistence()
    const structuredOutput = {
      type: 'structured-output' as const,
      status: 'complete' as const,
      raw: '{"name":"Ada"}',
      data: { name: 'Ada' },
      partial: { name: 'Ada' },
    }
    await persistence.stores.messages!.saveThread('t1', [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: structuredOutput.raw,
        structuredOutput,
      },
    ])

    const parsed = await hydrate(persistence, chatUrl())
    expect(parsed.messages[0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      parts: [structuredOutput],
    })
  })

  it('restores persisted ui-resource widgets into parts', async () => {
    const persistence = memoryPersistence()
    const uiResource = {
      type: 'ui-resource' as const,
      resource: {
        uri: 'ui://widget/todos',
        mimeType: 'text/html',
        text: '<div>todos</div>',
      },
      toolCallId: 'tc-1',
      toolName: 'getTodos',
    }
    await persistence.stores.messages!.saveThread('t1', [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'here',
        name: 'Ada',
        metadata: { tanstack: { uiResources: [uiResource] } },
      },
    ])

    const parsed = await hydrate(persistence, chatUrl())

    expect(parsed.messages[0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      name: 'Ada',
      parts: [{ type: 'text', content: 'here' }, uiResource],
    })
  })

  it('restores persisted message metadata', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages!.saveThread('t1', [
      {
        id: 'user-1',
        role: 'user',
        content: 'hello',
        metadata: { author: { id: 'user-42' } },
      },
    ])

    const parsed = await hydrate(persistence, chatUrl())

    expect(parsed.messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      metadata: { author: { id: 'user-42' } },
    })
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

    const parsed = await hydrate(persistence, chatUrl())
    expect(parsed.activeRun).toEqual({ runId: 'run-live' })

    // Once the run finishes, no active run is reported.
    await persistence.stores.runs!.update('run-live', { status: 'completed' })
    const after = await hydrate(persistence, chatUrl())
    expect(after.activeRun).toBeNull()
  })

  it('lists finished runs with their timings when includeRuns is set (#1061)', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages.saveThread('t1', [
      { id: 'u1', role: 'user', content: 'one' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'two',
        metadata: { tanstack: { run: { id: 'r1' } } },
      },
      { id: 'u2', role: 'user', content: 'three' },
    ])
    const runs = persistence.stores.runs
    await runs.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1000 })
    await runs.update('r1', { status: 'completed', finishedAt: 4000 })
    await runs.createOrResume({ runId: 'r2', threadId: 't1', startedAt: 5000 })
    await runs.update('r2', { status: 'failed', finishedAt: 6000 })
    await runs.createOrResume({ runId: 'r3', threadId: 't1', startedAt: 7000 })

    const withRuns = await body(
      await reconstructChat(persistence, new Request(chatUrl()), {
        includeRuns: true,
      }),
    )
    const plain = await hydrate(persistence, chatUrl())

    expect(withRuns.runs).toEqual([
      { runId: 'r1', status: 'completed', startedAt: 1000, finishedAt: 4000 },
      { runId: 'r2', status: 'failed', startedAt: 5000, finishedAt: 6000 },
    ])
    expect(withRuns.activeRun).toEqual({ runId: 'r3' })
    // The assistant message of each run carries that run's timings.
    expect(withRuns.messages[1]?.metadata?.tanstack).toEqual({
      run: { id: 'r1', startedAt: 1000, finishedAt: 4000 },
    })
    expect(withRuns.messages[0]?.metadata?.tanstack?.run).toBeUndefined()
    expect('runs' in plain).toBe(false)
    expect(plain.messages[1]?.metadata?.tanstack?.run).toEqual({ id: 'r1' })
  })

  it('returns an empty transcript and no active run when threadId is missing or unknown', async () => {
    const persistence = memoryPersistence()
    const missing = await hydrate(persistence, chatUrl(''))
    expect(missing).toEqual({ messages: [], activeRun: null, interrupts: null })

    const unknown = await hydrate(persistence, chatUrl('threadId=nope'))
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

    const parsed = await hydrate(persistence, chatUrl())
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
      new Request(chatUrl()),
      { authorize: () => false },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  it('returns a custom Response from authorize', async () => {
    const persistence = memoryPersistence()
    const response = await reconstructChat(
      persistence,
      new Request(chatUrl()),
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
      new Request(chatUrl('id=custom-id')),
      { param: 'id' },
    )
    const parsed = await body(response)
    expect(textOf(parsed.messages[0]!)).toBe('via-param')
  })
})

describe('reconstructChat paging', () => {
  it('with limit returns the newest UI window and page.truncated', async () => {
    const persistence = await saveThread(threeTurnThread)
    const parsed = await hydrate(persistence, chatUrl('threadId=t1&limit=2'))
    expect(idsOf(parsed)).toEqual(['2', '3'])
    expect(parsed.page).toEqual({ truncated: true, cursor: '2' })
  })

  it('limit=0 returns the full thread', async () => {
    const persistence = await saveThread(threeTurnThread)
    const parsed = await hydrate(persistence, chatUrl('threadId=t1&limit=0'))
    expect(idsOf(parsed)).toEqual(['1', '2', '3'])
    expect(parsed.page).toBeUndefined()
  })

  it('unknown before returns empty messages and keeps truncated true', async () => {
    const persistence = await saveThread(threeTurnThread)
    await persistence.stores.runs.createOrResume({
      runId: 'run-live',
      threadId: 't1',
      startedAt: 1000,
    })
    const parsed = await hydrate(
      persistence,
      chatUrl('threadId=t1&limit=2&before=no-such-cursor'),
    )
    expect(parsed.messages).toEqual([])
    expect(parsed.page).toEqual({
      truncated: true,
      cursor: 'no-such-cursor',
    })
    expect(parsed.activeRun).toEqual({ runId: 'run-live' })
  })

  it('does not split an assistant from its tool result across a page', async () => {
    const persistence = await saveThread([
      { id: 'user-1', role: 'user', content: 'ask' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      {
        id: 'tool-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: 'found it',
      },
      { id: 'user-2', role: 'user', content: 'thanks' },
    ])
    const parsed = await hydrate(persistence, chatUrl('threadId=t1&limit=2'))
    expect(idsOf(parsed)).toEqual(['assistant-1', 'user-2'])
    expect(parsed.messages[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool-call', id: 'call-1' }),
        expect.objectContaining({
          type: 'tool-result',
          toolCallId: 'call-1',
          content: 'found it',
        }),
      ]),
    )
  })

  it('loads an older window from the minted cursor without overlapping ids', async () => {
    const persistence = await saveThread(threeTurnThread)
    const older = await hydrate(
      persistence,
      chatUrl('threadId=t1&limit=2&before=2'),
    )
    expect(idsOf(older)).toEqual(['1'])
    expect(older.page).toEqual({ truncated: false })
  })

  it('mints a library cursor when a MessagePage is longer than pageSize', async () => {
    const persistence = memoryPersistence()
    const inner = persistence.stores.messages
    persistence.stores.messages = defineMessageStore({
      loadThread(threadId, options) {
        if (options?.limit === undefined) {
          return inner.loadThread(threadId)
        }
        return Promise.resolve({
          messages: threeTurnThread,
          truncated: true as const,
          cursor: 'before-1',
        })
      },
      saveThread(threadId, messages) {
        return inner.saveThread(threadId, messages)
      },
    } as MessageStore)
    const parsed = await hydrate(persistence, chatUrl('threadId=t1&limit=2'))
    expect(idsOf(parsed)).toEqual(['2', '3'])
    expect(parsed.page).toEqual({ truncated: true, cursor: '2' })
  })

  it('keeps a MessagePage adapter cursor when the UI window fits pageSize', async () => {
    const persistence = memoryPersistence()
    const inner = persistence.stores.messages
    persistence.stores.messages = defineMessageStore({
      loadThread(threadId, options) {
        if (options?.limit === undefined) {
          return inner.loadThread(threadId)
        }
        return Promise.resolve({
          messages: [
            { id: '2', role: 'assistant', content: 'two' },
            { id: '3', role: 'user', content: 'three' },
          ],
          truncated: true as const,
          cursor: 'adapter-cursor',
        })
      },
      saveThread(threadId, messages) {
        return inner.saveThread(threadId, messages)
      },
    } as MessageStore)
    const parsed = await hydrate(persistence, chatUrl('threadId=t1&limit=2'))
    expect(idsOf(parsed)).toEqual(['2', '3'])
    expect(parsed.page).toEqual({
      truncated: true,
      cursor: 'adapter-cursor',
    })
  })

  it('slices an array adapter that honors limit plus one', async () => {
    const persistence = memoryPersistence()
    const inner = persistence.stores.messages
    await inner.saveThread('t1', threeTurnThread)
    persistence.stores.messages = defineMessageStore({
      loadThread(threadId, options) {
        const limit = options?.limit
        if (limit === undefined) {
          return inner.loadThread(threadId)
        }
        return inner
          .loadThread(threadId)
          .then((list) => list.slice(Math.max(0, list.length - limit)))
      },
      saveThread(threadId, messages) {
        return inner.saveThread(threadId, messages)
      },
    } as MessageStore)
    const parsed = await hydrate(persistence, chatUrl('threadId=t1&limit=2'))
    expect(idsOf(parsed)).toEqual(['2', '3'])
    expect(parsed.page).toEqual({ truncated: true, cursor: '2' })
  })

  it('treats a truncated MessagePage without a usable cursor as complete', async () => {
    const persistence = memoryPersistence()
    const inner = persistence.stores.messages
    persistence.stores.messages = defineMessageStore({
      loadThread(threadId, options) {
        if (options?.limit === undefined) {
          return inner.loadThread(threadId)
        }
        return Promise.resolve({
          messages: [
            { id: '2', role: 'assistant', content: 'two' },
            { id: '3', role: 'user', content: 'three' },
          ],
          truncated: true as const,
          cursor: '',
        })
      },
      saveThread(threadId, messages) {
        return inner.saveThread(threadId, messages)
      },
    } as MessageStore)
    const parsed = await hydrate(persistence, chatUrl('threadId=t1&limit=2'))
    expect(idsOf(parsed)).toEqual(['2', '3'])
    expect(parsed.page).toEqual({ truncated: false })
  })
})
