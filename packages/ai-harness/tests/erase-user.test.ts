import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { getLogRecords, toolDefinition } from '@tanstack/ai'
import { LogTruncatedError, memoryPersistence } from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  createHarnessHost,
  defineHarness,
  logIdOf,
  membersOnly,
} from '../src'
import { mediaPart } from '../src/media-entry'
import { gate, messageTexts, mockAdapter, text, toolCall } from './helpers'
import type { LogStore } from '@tanstack/ai-persistence'
import type { ChatMiddleware } from '@tanstack/ai'
import type { ProjectOptions } from '../src'
import type { Reply } from './helpers'

const noop = toolDefinition({
  name: 'noop',
  description: 'Does nothing',
  inputSchema: z.object({}),
})

/**
 * The fold of a durable compaction record: `head` replaces the messages
 * before `from`, as `projectCompaction` of `@tanstack/ai-compaction` does.
 */
const compaction: ProjectOptions = {
  record: ({ messages, record }) =>
    record.type === 'tanstack.compaction' &&
    Array.isArray(record.head) &&
    typeof record.from === 'number'
      ? [...record.head, ...messages.slice(record.from)]
      : undefined,
}

const ada = { id: 'ada' }
const bob = { id: 'bob' }

/** A host on `persistence`, and a harness that answers with `replies`. */
function setup(
  replies: Array<Reply>,
  persistence = memoryPersistence(),
  access?: NonNullable<Parameters<typeof createHarnessHost>[0]>['access'],
) {
  const host = createHarnessHost({
    persistence,
    ...(access ? { access } : {}),
  })
  const harness = defineHarness({
    name: 'test/erase',
    adapter: mockAdapter(replies).adapter,
  })
  return { host, harness, persistence }
}

/** Ada and Bob each ask once in thread `t1`. */
async function sharedThread(persistence = memoryPersistence()) {
  const replies = [
    () => text('Reply to Ada'),
    () => text('Reply to Bob'),
    () => text('Later reply'),
  ]
  const { host, harness } = setup(replies, persistence)
  const session = await host.open(harness, { threadId: 't1', user: ada })
  await session.send('Ada secret', { user: ada })
  await session.send('Bob question', { user: bob })
  return { host, harness, session, persistence }
}

/** Every stored byte of the log: its snapshot and the records it keeps. */
async function storedLog(log: LogStore, logId: string) {
  const snapshot = await log.getSnapshot({ logId })
  try {
    return JSON.stringify([snapshot, await log.read({ logId })])
  } catch (error) {
    if (!(error instanceof LogTruncatedError)) throw error
    const kept = await log.read({ logId, after: error.firstSeq - 1 })
    return JSON.stringify([snapshot, kept])
  }
}

const shapeOf = (messages: ReadonlyArray<{ role: string; content: unknown }>) =>
  messages.map(({ role, content }) => [role, content])

describe('host.sessions.eraseUser', () => {
  it("replaces only the user's own messages, and keeps the turns", async () => {
    const { host, harness, session, persistence } = await sharedThread()
    const before = await session.transcript()

    await host.sessions.eraseUser({ harness, threadId: 't1', userId: 'ada' })

    const after = await session.transcript()
    expect(shapeOf(after)).toEqual([
      ['user', '[removed]'],
      ['assistant', 'Reply to Ada'],
      ['user', 'Bob question'],
      ['assistant', 'Reply to Bob'],
    ])
    // The ids stay, so the turns keep their shape.
    expect(after.map((message) => message.id)).toEqual(
      before.map((message) => message.id),
    )
    const stored = await storedLog(
      persistence.stores.log,
      logIdOf({ logId: 't1' }),
    )
    expect(stored).not.toContain('Ada secret')
    expect(stored).toContain('Bob question')

    // The thread goes on, and the model gets the placeholder.
    await session.send('Next', { user: bob })
    expect(shapeOf(await session.transcript()).at(-1)).toEqual([
      'assistant',
      'Later reply',
    ])
    await host.close()
  })

  it("with replies: 'remove', also replaces the answers to the user", async () => {
    const { host, harness, session } = await sharedThread()

    await host.sessions.eraseUser({
      harness,
      threadId: 't1',
      userId: 'ada',
      replies: 'remove',
    })

    expect(shapeOf(await session.transcript())).toEqual([
      ['user', '[removed]'],
      ['assistant', '[removed]'],
      ['user', 'Bob question'],
      ['assistant', 'Reply to Bob'],
    ])
    await host.close()
  })

  it('leaves no trace of the user after a durable compaction', async () => {
    const persistence = memoryPersistence()
    const { adapter, calls } = mockAdapter([
      () => text('Reply to Ada'),
      () => text('Reply to Bob'),
      () => text('Later reply'),
      () => text('Last reply'),
    ])
    // A durable compaction before the model call of the third turn. The
    // summary quotes Ada, as a model summary can.
    const compact: ChatMiddleware = {
      name: 'test:compact',
      onConfig: async (ctx, config) => {
        if (ctx.phase !== 'beforeModel' || config.messages.length !== 5) return
        await getLogRecords(ctx).append([
          {
            type: 'tanstack.compaction',
            head: [{ role: 'user', content: 'Summary: Ada said Ada secret.' }],
            from: 2,
          },
        ])
      },
    }
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/erase-compaction',
      adapter,
      middleware: [compact],
      durability: { addRecordsToModelContext: compaction },
    })
    const session = await host.open(harness, { threadId: 't1', user: ada })
    await session.send('Ada secret', { user: ada })
    await session.send('Bob question', { user: bob })
    await session.send('Bob again', { user: bob })
    expect(messageTexts(calls[2])[0]).toContain('Ada secret')

    await host.sessions.eraseUser({ harness, threadId: 't1', userId: 'ada' })

    expect(JSON.stringify(await session.transcript())).not.toContain(
      'Ada secret',
    )
    await session.send('Bob last', { user: bob })
    expect(messageTexts(calls[3]).join(' ')).not.toContain('Ada secret')
    expect(messageTexts(calls[3])).toContain('Bob question')
    const stored = await storedLog(
      persistence.stores.log,
      logIdOf({ logId: 't1' }),
    )
    expect(stored).not.toContain('Ada secret')
    await host.close()
  })

  it('keeps the erase for a new host that opens the thread', async () => {
    const persistence = memoryPersistence()
    const first = await sharedThread(persistence)
    await first.host.sessions.eraseUser({
      harness: first.harness,
      threadId: 't1',
      userId: 'ada',
    })
    await first.host.close()

    const { host, harness } = setup([], persistence)
    const session = await host.open(harness, { threadId: 't1', user: bob })

    expect(shapeOf(await session.transcript())).toEqual([
      ['user', '[removed]'],
      ['assistant', 'Reply to Ada'],
      ['user', 'Bob question'],
      ['assistant', 'Reply to Bob'],
    ])
    await host.close()
  })

  it('erases a steer that joined a running turn', async () => {
    const held = gate()
    const { adapter } = mockAdapter([
      () =>
        (async function* () {
          await held.opened
          yield* toolCall('noop', {})
        })(),
      () => text('Done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/erase-steer',
      adapter,
      tools: [noop.server(() => ({ ok: true }))],
    })
    const session = await host.open(harness, { threadId: 't1', user: ada })
    const running = session.send('Ada start', { user: ada })
    await vi.waitFor(() => expect(session.snapshot().status).toBe('running'))
    const steer = session.send('Ada steer', { user: ada, mode: 'steer' })
    held.open()
    await Promise.all([running, steer])
    expect(JSON.stringify(await session.transcript())).toContain('Ada steer')

    await host.sessions.eraseUser({ harness, threadId: 't1', userId: 'ada' })

    expect(JSON.stringify(await session.transcript())).not.toContain('Ada')
    await host.close()
  })

  it('deletes the media that the user sent', async () => {
    const { host, harness } = setup([() => text('A cat'), () => text('A dog')])
    const session = await host.open(harness, { threadId: 't1', user: ada })
    const cat = await session.putMedia({
      body: new TextEncoder().encode('cat'),
      mimeType: 'image/png',
      name: 'cat.png',
    })
    const dog = await session.putMedia({
      body: new TextEncoder().encode('dog'),
      mimeType: 'image/png',
      name: 'dog.png',
    })
    await session.send([{ type: 'text', content: 'What?' }, mediaPart(cat)], {
      user: ada,
    })
    await session.send([{ type: 'text', content: 'And?' }, mediaPart(dog)], {
      user: bob,
    })

    await host.sessions.eraseUser({ harness, threadId: 't1', userId: 'ada' })

    expect(await session.getMedia({ id: cat.id })).toBeNull()
    expect(await session.getMedia({ id: dog.id })).not.toBeNull()
    await host.close()
  })

  it('refuses while a turn runs on the thread', async () => {
    const held = gate()
    const { host, harness } = setup([
      () =>
        (async function* () {
          await held.opened
          yield* text('done')
        })(),
    ])
    const session = await host.open(harness, { threadId: 't1', user: ada })
    const running = session.send('Ada secret', { user: ada })
    await vi.waitFor(() => expect(session.snapshot().status).toBe('running'))

    await expect(
      host.sessions.eraseUser({ harness, threadId: 't1', userId: 'ada' }),
    ).rejects.toThrow(/busy/)

    held.open()
    await running
    await host.close()
  })

  it('needs the erase action: a member cannot erase', async () => {
    const { host, harness } = setup([() => text('ok')], memoryPersistence(), {
      getUser: () => null,
      rules: membersOnly(),
    })
    await host.open(harness, { threadId: 't1', user: ada })
    await host.sessions.share({
      threadId: 't1',
      userId: 'bob',
      role: 'member',
      user: ada,
    })

    await expect(
      host.sessions.eraseUser({
        harness,
        threadId: 't1',
        userId: 'ada',
        user: bob,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await host.sessions.eraseUser({
      harness,
      threadId: 't1',
      userId: 'bob',
      user: ada,
    })
    await host.close()
  })
})
