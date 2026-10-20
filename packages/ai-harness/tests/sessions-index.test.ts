import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent } from '@tanstack/ai'
import {
  defineSessionIndexStore,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  SessionMetadataError,
  createHarnessHost,
  defineHarness,
  definePlugin,
  logIdOf,
  logMessageStore,
} from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { ModelMessage, StreamChunk, TokenUsage } from '@tanstack/ai'
import type {
  LogStore,
  SessionIndexEntry,
  SessionIndexKey,
  SessionIndexListOptions,
  SessionIndexPage,
  SessionIndexStore,
} from '@tanstack/ai-persistence'
import type { HarnessPersistence, PluginSessionApi } from '../src'
import type { Reply } from './helpers'

afterEach(() => {
  vi.useRealTimers()
})

/** One model call that answers `content` and reports `usage`. */
function textWithUsage(content: string, usage: TokenUsage) {
  return text(content).map(
    (chunk): StreamChunk =>
      chunk.type === EventType.RUN_FINISHED ? { ...chunk, usage } : chunk,
  )
}

function idOf(message: ModelMessage | undefined) {
  if (!message?.id) throw new Error('The message has no id.')
  return message.id
}

/** Role and content of each message, to compare transcripts. */
const turnsOf = (messages: ReadonlyArray<ModelMessage>) =>
  messages.map((message) => [message.role, message.content])

/** The stored transcript of `threadId` in the default tenant. */
const transcriptOf = (log: LogStore, threadId: string) =>
  logMessageStore({ store: log }).loadThread(threadId)

const threadIds = (page: SessionIndexPage) =>
  page.entries.map((entry) => entry.threadId)

function hostWith(replies: Array<Reply> | Reply = () => text('answer')) {
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence })
  const harness = defineHarness({
    name: 'test/sessions',
    adapter: mockAdapter(replies).adapter,
  })
  return { persistence, host, harness }
}

/** A durable host (a log, metadata, and a session index), and its log. */
function durableHost() {
  const log = memoryLogStore()
  const { metadata, sessions } = memoryPersistence().stores
  const host = createHarnessHost({
    persistence: { stores: { log, metadata, sessions } },
  })
  return { log, host }
}

/** The context items a user pinned to a thread. */
const chipsSchema = z.object({ chips: z.array(z.string()) })

/** A harness whose session metadata is `chipsSchema`. */
const chipsHarness = (name = 'test/chips') =>
  defineHarness({
    name,
    adapter: mockAdapter(() => text('answer')).adapter,
    metadataSchema: chipsSchema,
  })

/**
 * A sessions store that forwards to the memory store of `persistence`, with
 * `overrides` in place of some of its methods.
 */
function storeWith(
  persistence: HarnessPersistence,
  overrides: (store: SessionIndexStore) => Partial<SessionIndexStore>,
) {
  const store = persistence.stores.sessions
  if (!store) throw new Error('The persistence has no sessions store.')
  const forwarding: SessionIndexStore = {
    upsert: (entry) => store.upsert(entry),
    get: (key) => store.get(key),
    list: (options) => store.list(options),
    delete: (key) => store.delete(key),
    getVersioned: (key) => store.getVersioned(key),
    upsertIf: (input) => store.upsertIf(input),
  }
  return defineSessionIndexStore({ ...forwarding, ...overrides(forwarding) })
}

/** Open a session with a plugin that hands out its session API. */
async function openWithApi(persistence: HarnessPersistence) {
  const apis: Array<PluginSessionApi> = []
  const probe = definePlugin({
    name: 'test/probe',
    setup: (ctx) => {
      apis.push(ctx.session)
    },
  })
  const host = createHarnessHost({ persistence })
  const harness = defineHarness({
    name: 'test/sessions-plugin',
    adapter: mockAdapter(() => text('ok')).adapter,
    plugins: () => [probe],
  })
  const session = await host.open(harness, {
    threadId: 'p1',
    user: { id: 'u1' },
  })
  const api = apis[0]
  if (!api) throw new Error('The probe plugin was not set up.')
  return { host, session, api }
}

describe('host.sessions', () => {
  it('writes the entry on open and adds the usage of each turn', async () => {
    const { host, harness } = hostWith([
      () =>
        textWithUsage('one', {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          promptTokensDetails: { cachedTokens: 4 },
        }),
      () =>
        textWithUsage('two', {
          promptTokens: 20,
          completionTokens: 7,
          totalTokens: 27,
          promptTokensDetails: { cacheWriteTokens: 2 },
        }),
    ])
    const session = await host.open(harness, {
      threadId: 't1',
      user: { id: 'u1', name: 'Ada', tenantId: 'org-1' },
    })

    const read = { threadId: 't1', user: { id: 'u1', tenantId: 'org-1' } }
    expect(await host.sessions.get(read)).toEqual({
      tenantId: 'org-1',
      threadId: 't1',
      members: [{ userId: 'u1', role: 'owner' }],
      harness: 'test/sessions',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    // The entry is in the tenant of the user only.
    expect(await host.sessions.get({ threadId: 't1' })).toBeUndefined()

    await session.send('first')
    await session.send('second')

    expect((await host.sessions.get(read))?.usage).toEqual({
      turns: 2,
      promptTokens: 30,
      completionTokens: 12,
      totalTokens: 42,
      cachedTokens: 4,
      cacheWriteTokens: 2,
    })
    await host.close()
  })

  it('keeps the first owner when another user opens the thread again', async () => {
    const { persistence, host, harness } = hostWith()
    await host.open(harness, { threadId: 't1', user: { id: 'alice' } })
    await host.close()
    const next = createHarnessHost({ persistence })

    await next.open(harness, { threadId: 't1', user: { id: 'bob' } })

    expect(await next.sessions.get({ threadId: 't1' })).toMatchObject({
      members: [{ userId: 'alice', role: 'owner' }],
    })
    await next.close()
  })

  it('lists newest first, and only top-level sessions by default', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { persistence, host, harness } = hostWith()
    vi.setSystemTime(1000)
    await host.open(harness, { threadId: 'older' })
    vi.setSystemTime(2000)
    await host.open(harness, { threadId: 'newer' })
    // A child session, as a subagent run writes it.
    await persistence.stores.sessions.upsert({
      threadId: 'subagent:run-1',
      parentThreadId: 'older',
      members: [],
      createdAt: 3000,
      updatedAt: 3000,
    })

    expect(threadIds(await host.sessions.list())).toEqual(['newer', 'older'])
    expect(
      threadIds(await host.sessions.list({ parentThreadId: 'older' })),
    ).toEqual(['subagent:run-1'])
    await host.close()
  })

  it('renames a session, and renames nothing for an unknown thread', async () => {
    const { host, harness } = hostWith()
    await host.open(harness, { threadId: 't1' })

    const renamed = await host.sessions.rename({
      threadId: 't1',
      title: 'Fix the build',
    })

    expect(renamed?.title).toBe('Fix the build')
    expect((await host.sessions.get({ threadId: 't1' }))?.title).toBe(
      'Fix the build',
    )
    expect(
      await host.sessions.rename({ threadId: 'unknown', title: 'x' }),
    ).toBeUndefined()
    expect(await host.sessions.get({ threadId: 'unknown' })).toBeUndefined()
    await host.close()
  })

  it('updates the title, pin, and metadata from app code, and nothing for an unknown thread', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = chipsHarness()
    await host.open(harness, { threadId: 't1', user: { id: 'u1' } })

    const updated = await host.sessions.update({
      harness,
      threadId: 't1',
      update: {
        title: 'Chips',
        pinned: true,
        metadata: { chips: ['a.ts'] },
      },
    })
    const added = await host.sessions.update({
      harness,
      threadId: 't1',
      update: (entry) => ({
        metadata: { chips: [...(entry.metadata?.chips ?? []), 'b.ts'] },
      }),
    })

    expect(updated).toMatchObject({ title: 'Chips', pinned: true })
    expect(added).toMatchObject({
      title: 'Chips',
      metadata: { chips: ['a.ts', 'b.ts'] },
    })
    expect(await host.sessions.get({ threadId: 't1' })).toMatchObject({
      members: [{ userId: 'u1', role: 'owner' }],
      metadata: { chips: ['a.ts', 'b.ts'] },
    })
    expect(
      await host.sessions.update({
        harness,
        threadId: 'unknown',
        update: { title: 'x' },
      }),
    ).toBeUndefined()
    await host.close()
  })

  it('writes nothing when the change function returns undefined', async () => {
    const { host, harness } = hostWith()
    await host.open(harness, { threadId: 't1' })
    const before = await host.sessions.get({ threadId: 't1' })

    expect(
      await host.sessions.update({
        harness,
        threadId: 't1',
        update: () => undefined,
      }),
    ).toBeUndefined()
    expect(await host.sessions.get({ threadId: 't1' })).toEqual(before)
    await host.close()
  })

  it('checks metadata with the harness schema, and writes nothing it refuses', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = chipsHarness()
    await host.open(harness, { threadId: 't1' })

    const write = host.sessions.update({
      harness,
      threadId: 't1',
      update: {
        title: 'Never',
        // @ts-expect-error The schema wants a list of strings.
        metadata: { chips: 'a.ts' },
      },
    })

    await expect(write).rejects.toBeInstanceOf(SessionMetadataError)
    expect((await host.sessions.get({ threadId: 't1' }))?.title).toBeUndefined()
    await host.close()
  })

  it('refuses an update of a thread that another harness runs', async () => {
    const { host, harness } = hostWith()
    await host.open(harness, { threadId: 't1' })

    await expect(
      host.sessions.update({
        harness: chipsHarness(),
        threadId: 't1',
        update: { title: 'x' },
      }),
    ).rejects.toThrow('belongs to harness "test/sessions", not "test/chips"')
    await host.close()
  })

  it('keeps the write of another host that lands between the read and the write', async () => {
    const persistence = memoryPersistence()
    // A store that lets another host write right after the next read.
    let other: (() => Promise<unknown>) | undefined
    const racing = storeWith(persistence, (store) => ({
      getVersioned: async (key) => {
        const read = await store.getVersioned(key)
        const write = other
        other = undefined
        await write?.()
        return read
      },
    }))
    const app = createHarnessHost({
      persistence: { stores: { ...persistence.stores, sessions: racing } },
    })
    const turnEnd = createHarnessHost({ persistence })
    const harness = chipsHarness()
    await turnEnd.open(harness, { threadId: 't1' })
    other = () =>
      turnEnd.sessions.rename({ threadId: 't1', title: 'From the other host' })
    let runs = 0

    await app.sessions.update({
      harness,
      threadId: 't1',
      update: (entry) => {
        runs += 1
        return {
          metadata: { chips: [...(entry.metadata?.chips ?? []), 'a.ts'] },
        }
      },
    })

    expect(runs).toBe(2)
    expect(await racing.get({ threadId: 't1' })).toMatchObject({
      title: 'From the other host',
      metadata: { chips: ['a.ts'] },
    })
    await app.close()
    await turnEnd.close()
  })

  it('throws when another host wins five times in a row', async () => {
    const persistence = memoryPersistence()
    const losing = storeWith(persistence, () => ({
      upsertIf: () => Promise.resolve({ ok: false, reason: 'conflict' }),
    }))
    const harness = chipsHarness()
    const opener = createHarnessHost({ persistence })
    await opener.open(harness, { threadId: 't1' })
    const host = createHarnessHost({
      persistence: { stores: { ...persistence.stores, sessions: losing } },
    })

    await expect(
      host.sessions.update({ harness, threadId: 't1', update: { title: 'x' } }),
    ).rejects.toThrow('changed on another host 5 times in a row')
    await host.close()
    await opener.close()
  })

  it('deletes the entry and the transcript, and closes the open session', async () => {
    const { persistence, host, harness } = hostWith()
    const session = await host.open(harness, { threadId: 't1' })
    await session.send('hi')

    await host.sessions.delete({ threadId: 't1' })

    expect(await host.sessions.get({ threadId: 't1' })).toBeUndefined()
    expect(turnsOf(await transcriptOf(persistence.stores.log, 't1'))).toEqual(
      [],
    )
    expect(host.isOpen(harness, { threadId: 't1' })).toBe(false)
    await host.close()
  })

  it('deletes the entry for good, so the next open writes a new entry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { persistence, host, harness } = hostWith()
    vi.setSystemTime(1000)
    await host.open(harness, { threadId: 't1', user: { id: 'u1' } })
    await host.sessions.rename({ threadId: 't1', title: 'Old title' })

    await host.sessions.delete({ threadId: 't1' })
    expect(await host.sessions.get({ threadId: 't1' })).toBeUndefined()
    await host.close()
    vi.setSystemTime(2000)
    const next = createHarnessHost({ persistence })
    await next.open(harness, { threadId: 't1' })

    expect(await next.sessions.get({ threadId: 't1' })).toEqual({
      threadId: 't1',
      members: [],
      harness: 'test/sessions',
      createdAt: 2000,
      updatedAt: 2000,
    })
    await next.close()
  })

  it('refuses to open a child thread: its root thread reads it', async () => {
    const { persistence, host, harness } = hostWith()
    await persistence.stores.sessions.upsert({
      threadId: 'subagent:run-1',
      parentThreadId: 't1',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })

    await expect(
      host.open(harness, { threadId: 'subagent:run-1' }),
    ).rejects.toThrow(
      '"subagent:run-1" is a child thread of "t1". Open the root thread and read the child through it.',
    )
    expect(host.isOpen(harness, { threadId: 'subagent:run-1' })).toBe(false)
    await host.close()
  })

  it('refuses a sessions store without compare-and-set at the start', () => {
    const { log, sessions } = memoryPersistence().stores
    // A store in plain JS, with no getVersioned and no upsertIf.
    const plain = {
      get: (key: SessionIndexKey) => sessions.get(key),
      upsert: (entry: SessionIndexEntry) => sessions.upsert(entry),
      list: (options?: SessionIndexListOptions) => sessions.list(options),
      delete: (key: SessionIndexKey) => sessions.delete(key),
    }

    expect(() =>
      createHarnessHost({
        // @ts-expect-error The types need both methods. A JS caller can leave them out.
        persistence: { stores: { log, sessions: plain } },
      }),
    ).toThrow('stores.sessions needs getVersioned and upsertIf.')
  })

  it('forks the transcript before or through a message into a new thread, with the settings', async () => {
    const { persistence, host, harness } = hostWith()
    const session = await host.open(harness, {
      threadId: 't1',
      user: { id: 'u1' },
    })
    await session.updateThreadSettings({
      settings: { instructions: 'Be brief.' },
    })
    await session.send('first')
    await session.send('second')
    await host.sessions.rename({ threadId: 't1', title: 'Chat' })
    const [, , second] = await session.transcript()

    const before = await host.sessions.fork({
      harness,
      threadId: 't1',
      at: {
        before: idOf(second),
      },
    })
    const through = await host.sessions.fork({
      harness,
      threadId: 't1',
      at: {
        through: idOf(second),
      },
    })

    expect(before).toEqual({
      threadId: expect.any(String),
      harness: 'test/sessions',
      title: 'Chat (fork)',
      members: [{ userId: 'u1', role: 'owner' }],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    expect(before.threadId).not.toBe(through.threadId)
    expect(await host.sessions.get({ threadId: before.threadId })).toEqual(
      before,
    )
    expect(
      turnsOf(await transcriptOf(persistence.stores.log, before.threadId)),
    ).toEqual([
      ['user', 'first'],
      ['assistant', 'answer'],
    ])
    expect(
      turnsOf(await transcriptOf(persistence.stores.log, through.threadId)),
    ).toEqual([
      ['user', 'first'],
      ['assistant', 'answer'],
      ['user', 'second'],
    ])
    for (const { threadId } of [before, through]) {
      const fork = await host.open(harness, { threadId })
      expect(fork.threadSettings()).toEqual({ instructions: 'Be brief.' })
    }
    await host.close()
  })

  it('forks before the first message into a thread with no messages, but with the settings', async () => {
    const { persistence, host, harness } = hostWith()
    const session = await host.open(harness, { threadId: 't1' })
    await session.updateThreadSettings({
      settings: { instructions: 'Be brief.' },
    })
    await session.send('first')
    const [first] = await session.transcript()

    const fork = await host.sessions.fork({
      harness,
      threadId: 't1',
      at: {
        before: idOf(first),
      },
    })

    expect(await transcriptOf(persistence.stores.log, fork.threadId)).toEqual(
      [],
    )
    const forked = await host.open(harness, { threadId: fork.threadId })
    expect(forked.threadSettings()).toEqual({ instructions: 'Be brief.' })
    await host.close()
  })

  it('forks a durable thread into one transcript record in a new log', async () => {
    const { log, host } = durableHost()
    const harness = defineHarness({
      name: 'test/sessions-durable',
      adapter: mockAdapter(() => text('durable answer')).adapter,
    })
    const session = await host.open(harness, { threadId: 'd1' })
    await session.send('hi')
    const [, answer] = await session.transcript()

    const fork = await host.sessions.fork({
      harness,
      threadId: 'd1',
      at: {
        through: idOf(answer),
      },
    })

    const records = await log.read({
      logId: logIdOf({ logId: fork.threadId }),
    })
    expect(records.map(({ record }) => [record.type, record.keep])).toEqual([
      ['harness.transcript', 0],
    ])
    const forked = await host.open(harness, { threadId: fork.threadId })
    expect(turnsOf(await forked.transcript())).toEqual([
      ['user', 'hi'],
      ['assistant', 'durable answer'],
    ])
    await host.close()
  })

  it('refuses a fork at a message that is not in the transcript', async () => {
    const { host, harness } = hostWith()
    const session = await host.open(harness, { threadId: 't1' })
    await session.send('hi')

    await expect(
      host.sessions.fork({
        harness,
        threadId: 't1',
        at: { through: 'not-a-message' },
      }),
    ).rejects.toThrow('Thread "t1" has no message "not-a-message".')
    expect(threadIds(await host.sessions.list())).toEqual(['t1'])
    await host.close()
  })

  it('refuses a fork with a harness that does not run the thread', async () => {
    const { host, harness } = hostWith()
    const session = await host.open(harness, { threadId: 't1' })
    await session.send('hi')
    const [, answer] = await session.transcript()
    const other = defineHarness({
      name: 'test/other',
      adapter: mockAdapter(() => text('other')).adapter,
    })

    await expect(
      host.sessions.fork({
        harness: other,
        threadId: 't1',
        at: { through: idOf(answer) },
      }),
    ).rejects.toThrow(
      'Thread "t1" belongs to harness "test/sessions", not "test/other".',
    )
    expect(threadIds(await host.sessions.list())).toEqual(['t1'])
    expect((await host.sessions.get({ threadId: 't1' }))?.harness).toBe(
      'test/sessions',
    )
    await host.close()
  })

  it('forks with any harness without a sessions store, as there is no entry to check', async () => {
    const { log, metadata } = memoryPersistence().stores
    const host = createHarnessHost({
      persistence: { stores: { log, metadata } },
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    const { harness } = hostWith()
    const session = await host.open(harness, { threadId: 't1' })
    await session.send('hi')
    const [, answer] = await session.transcript()
    // One harness at a time has a thread open: the fork opens it again.
    await session.close()
    const other = defineHarness({
      name: 'test/other',
      adapter: mockAdapter(() => text('other')).adapter,
    })

    const fork = await host.sessions.fork({
      harness: other,
      threadId: 't1',
      at: {
        through: idOf(answer),
      },
    })

    expect(fork.harness).toBe('test/other')
    expect(turnsOf(await transcriptOf(log, fork.threadId))).toEqual([
      ['user', 'hi'],
      ['assistant', 'answer'],
    ])
    await host.close()
  })
})

describe('tenants', () => {
  const ada = { id: 'ada', tenantId: 'org-a' }
  const bo = { id: 'bo', tenantId: 'org-b' }

  it('keeps one thread id of two tenants apart: two sessions, two entries, and two logs', async () => {
    const { log, host } = durableHost()
    const harness = defineHarness({
      name: 'test/tenants',
      adapter: mockAdapter(() => text('answer')).adapter,
    })
    const a = await host.open(harness, { threadId: 't1', user: ada })
    const b = await host.open(harness, { threadId: 't1', user: bo })

    await a.send('from a')
    await b.send('from b')

    expect(a).not.toBe(b)
    expect(turnsOf(await a.transcript())).toEqual([
      ['user', 'from a'],
      ['assistant', 'answer'],
    ])
    expect(turnsOf(await b.transcript())).toEqual([
      ['user', 'from b'],
      ['assistant', 'answer'],
    ])
    expect(
      await host.sessions.get({ threadId: 't1', user: ada }),
    ).toMatchObject({
      tenantId: 'org-a',
      members: [{ userId: 'ada', role: 'owner' }],
    })
    expect(await host.sessions.get({ threadId: 't1', user: bo })).toMatchObject(
      {
        tenantId: 'org-b',
        members: [{ userId: 'bo', role: 'owner' }],
      },
    )
    const listed = await host.sessions.list({ user: ada })
    expect(listed.entries.map((entry) => entry.tenantId)).toEqual(['org-a'])
    const logOf = (tenantId: string) =>
      logMessageStore({ store: log, tenantId }).loadThread('t1')
    expect(turnsOf(await logOf('org-a'))).toEqual([
      ['user', 'from a'],
      ['assistant', 'answer'],
    ])
    expect(turnsOf(await logOf('org-b'))).toEqual([
      ['user', 'from b'],
      ['assistant', 'answer'],
    ])
    expect(await log.read({ logId: logIdOf({ logId: 't1' }) })).toEqual([])
    await host.close()
  })
})

describe('child sessions', () => {
  it('gives an agent run child the harness of its parent', async () => {
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes',
      run: (ctx) =>
        ctx.chat({ adapter: mockAdapter(() => text('ok')).adapter }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-child',
        adapter: mockAdapter([]).adapter,
        agents: [writer],
      }),
      {
        threadId: 't1',
      },
    )

    await session.agents.writer.start()

    const page = await host.sessions.list({ parentThreadId: 't1' })
    expect(page.entries.map((entry) => entry.harness)).toEqual([
      'test/agent-child',
    ])
    await host.close()
  })

  it('lists a subagent child with parentThreadId, with the owner and harness of its parent', async () => {
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) =>
        ctx.chat({ adapter: mockAdapter(() => text('Note 1')).adapter }),
    })
    const harness = defineHarness({
      name: 'test/subagent-child',
      adapter: mockAdapter([
        () => toolCall('writer', { prompt: 'Notes' }, 'call-1'),
        () => text('Done.'),
      ]).adapter,
      subagents: { agents: [writer] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, {
      threadId: 'lead',
      user: { id: 'alice' },
    })

    await session.send('Notes, please')

    const page = await host.sessions.list({ parentThreadId: 'lead' })
    expect(page.entries).toEqual([
      {
        threadId: expect.stringMatching(/^subagent:/),
        parentThreadId: 'lead',
        parentToolCallId: 'call-1',
        members: [],
        harness: 'test/subagent-child',
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    ])
    await host.close()
  })
})

describe('ctx.session.indexEntry and updateIndexEntry', () => {
  it('reads and changes the entry of the thread of the plugin', async () => {
    const { host, api } = await openWithApi(memoryPersistence())

    expect(await api.indexEntry()).toMatchObject({
      threadId: 'p1',
      harness: 'test/sessions-plugin',
    })
    const changed = await api.updateIndexEntry({
      title: 'From a plugin',
      metadata: { model: 'm-1' },
    })

    expect(changed).toMatchObject({
      title: 'From a plugin',
      metadata: { model: 'm-1' },
    })
    expect(await host.sessions.get({ threadId: 'p1' })).toMatchObject({
      threadId: 'p1',
      title: 'From a plugin',
      metadata: { model: 'm-1' },
      members: [{ userId: 'u1', role: 'owner' }],
    })
    await host.close()
  })

  it('types the metadata of a plugin with a schema, and checks its writes with it', async () => {
    const apis: Array<PluginSessionApi<z.infer<typeof chipsSchema>>> = []
    const chipsPlugin = definePlugin({
      name: 'test/chips-plugin',
      // Stricter than the harness: at most two chips.
      metadataSchema: chipsSchema.refine(({ chips }) => chips.length <= 2),
      setup: (ctx) => {
        apis.push(ctx.session)
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    await host.open(
      defineHarness({
        name: 'test/chips',
        adapter: mockAdapter(() => text('ok')).adapter,
        metadataSchema: chipsSchema,
        plugins: () => [chipsPlugin],
      }),
      {
        threadId: 'p1',
      },
    )
    const [api] = apis
    if (!api) throw new Error('The chips plugin was not set up.')

    await api.updateIndexEntry({ metadata: { chips: ['a.ts', 'b.ts'] } })

    expect((await api.indexEntry())?.metadata?.chips).toEqual(['a.ts', 'b.ts'])
    await expect(
      api.updateIndexEntry((entry) => ({
        metadata: { chips: [...(entry.metadata?.chips ?? []), 'c.ts'] },
      })),
    ).rejects.toBeInstanceOf(SessionMetadataError)
    expect((await host.sessions.get({ threadId: 'p1' }))?.metadata).toEqual({
      chips: ['a.ts', 'b.ts'],
    })
    await host.close()
  })

  it('keeps the harness keys that a plugin schema does not know', async () => {
    const apis: Array<PluginSessionApi<z.infer<typeof chipsSchema>>> = []
    const chipsPlugin = definePlugin({
      name: 'test/chips-plugin',
      metadataSchema: chipsSchema,
      setup: (ctx) => {
        apis.push(ctx.session)
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/chips-theme',
      adapter: mockAdapter(() => text('ok')).adapter,
      metadataSchema: chipsSchema.extend({ theme: z.string().optional() }),
      plugins: () => [chipsPlugin],
    })
    await host.open(harness, { threadId: 'p1' })
    await host.sessions.update({
      harness,
      threadId: 'p1',
      update: {
        metadata: { chips: [], theme: 'dark' },
      },
    })
    const [api] = apis
    if (!api) throw new Error('The chips plugin was not set up.')

    await api.updateIndexEntry((entry) => ({
      metadata: { ...entry.metadata, chips: ['a.ts'] },
    }))

    expect((await host.sessions.get({ threadId: 'p1' }))?.metadata).toEqual({
      chips: ['a.ts'],
      theme: 'dark',
    })
    await host.close()
  })

  it('refuses a metadataSchema that is not a Standard Schema', () => {
    const jsonSchema = { type: 'object' }
    expect(() =>
      defineHarness({ name: 'test/json', metadataSchema: jsonSchema }),
    ).toThrow('metadataSchema must be a Standard Schema')
    expect(() =>
      definePlugin({ name: 'test/json', metadataSchema: jsonSchema }),
    ).toThrow('metadataSchema must be a Standard Schema')
  })

  it('reads nothing and writes nothing without a sessions store', async () => {
    const { log, metadata } = memoryPersistence().stores
    const { host, session, api } = await openWithApi({
      stores: { log, metadata },
    })
    await session.send('hi')

    expect(await host.sessions.list()).toEqual({ entries: [] })
    expect(await host.sessions.get({ threadId: 'p1' })).toBeUndefined()
    expect(
      await host.sessions.rename({ threadId: 'p1', title: 'x' }),
    ).toBeUndefined()
    expect(await api.indexEntry()).toBeUndefined()
    expect(await api.updateIndexEntry({ title: 'x' })).toBeUndefined()
    await host.close()
  })
})
