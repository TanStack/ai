import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '../src'
import { createHarnessClient } from '../src/client'
import { mockAdapter, text } from './helpers'
import type { ModelMessage, StreamChunk, TokenUsage } from '@tanstack/ai'
import type { SessionIndexPage } from '@tanstack/ai-persistence'
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
    principal: { id: 'u1' },
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
      principal: { id: 'u1', name: 'Ada', tenantId: 'org-1' },
    })

    expect(await host.sessions.get('t1')).toEqual({
      threadId: 't1',
      harness: 'test/sessions',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      principal: { id: 'u1', tenantId: 'org-1' },
    })

    await session.prompt('first')
    await session.prompt('second')

    expect((await host.sessions.get('t1'))?.usage).toEqual({
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
    const { host, harness } = hostWith()
    await host.open(harness, { threadId: 't1', principal: { id: 'alice' } })
    await host.close()

    await host.open(harness, { threadId: 't1', principal: { id: 'bob' } })

    expect((await host.sessions.get('t1'))?.principal).toEqual({ id: 'alice' })
    await host.close()
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

    const renamed = await host.sessions.rename('t1', 'Fix the build')

    expect(renamed?.title).toBe('Fix the build')
    expect((await host.sessions.get('t1'))?.title).toBe('Fix the build')
    expect(await host.sessions.rename('unknown', 'x')).toBeUndefined()
    expect(await host.sessions.get('unknown')).toBeUndefined()
    await host.close()
  })

  it('deletes the index entry only, and a later turn does not bring it back', async () => {
    const { persistence, host, harness } = hostWith()
    const session = await host.open(harness, { threadId: 't1' })
    await session.prompt('hi')

    await host.sessions.delete('t1')
    await session.prompt('still here')

    expect(await host.sessions.get('t1')).toBeUndefined()
    expect(
      turnsOf(await persistence.stores.messages.loadThread('t1')),
    ).toEqual([
      ['user', 'hi'],
      ['assistant', 'answer'],
      ['user', 'still here'],
      ['assistant', 'answer'],
    ])
    await host.close()
  })

  it('forks the transcript before or through a message into a new thread', async () => {
    const { persistence, host, harness } = hostWith()
    const session = await host.open(harness, {
      threadId: 't1',
      principal: { id: 'u1' },
    })
    await session.prompt('first')
    await session.prompt('second')
    await host.sessions.rename('t1', 'Chat')
    const [, , second] = await session.transcript()

    const before = await host.sessions.fork('t1', { before: idOf(second) })
    const through = await host.sessions.fork('t1', { through: idOf(second) })

    expect(before).toEqual({
      threadId: expect.any(String),
      harness: 'test/sessions',
      title: 'Chat (fork)',
      principal: { id: 'u1' },
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    expect(before.threadId).not.toBe(through.threadId)
    expect(await host.sessions.get(before.threadId)).toEqual(before)
    const { messages } = persistence.stores
    expect(turnsOf(await messages.loadThread(before.threadId))).toEqual([
      ['user', 'first'],
      ['assistant', 'answer'],
    ])
    expect(turnsOf(await messages.loadThread(through.threadId))).toEqual([
      ['user', 'first'],
      ['assistant', 'answer'],
      ['user', 'second'],
    ])
    await host.close()
  })

  it('forks a durable thread into one transcript record in a new log', async () => {
    const log = memoryLogStore()
    const { runs, metadata, sessions } = memoryPersistence().stores
    const host = createHarnessHost({
      persistence: { stores: { log, runs, metadata, sessions } },
    })
    const harness = defineHarness({
      name: 'test/sessions-durable',
      adapter: mockAdapter(() => text('durable answer')).adapter,
    })
    const session = await host.open(harness, { threadId: 'd1' })
    await session.prompt('hi')
    const [, answer] = await session.transcript()

    const fork = await host.sessions.fork('d1', { through: idOf(answer) })

    const records = await log.read(fork.threadId)
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
    await session.prompt('hi')

    await expect(
      host.sessions.fork('t1', { through: 'not-a-message' }),
    ).rejects.toThrow('The transcript has no message with id not-a-message.')
    expect(threadIds(await host.sessions.list())).toEqual(['t1'])
    await host.close()
  })
})

describe('ctx.session.entry and updateEntry', () => {
  it('reads and changes the entry of the thread of the plugin', async () => {
    const { host, api } = await openWithApi(memoryPersistence())

    expect(await api.entry()).toMatchObject({
      threadId: 'p1',
      harness: 'test/sessions-plugin',
    })
    const changed = await api.updateEntry({
      title: 'From a plugin',
      metadata: { model: 'm-1' },
    })

    expect(changed).toMatchObject({
      title: 'From a plugin',
      metadata: { model: 'm-1' },
    })
    expect(await host.sessions.get('p1')).toMatchObject({
      threadId: 'p1',
      title: 'From a plugin',
      metadata: { model: 'm-1' },
      principal: { id: 'u1' },
    })
    await host.close()
  })

  it('reads nothing and writes nothing without a sessions store', async () => {
    const { messages, runs, metadata } = memoryPersistence().stores
    const { host, session, api } = await openWithApi({
      stores: { messages, runs, metadata },
    })
    await session.prompt('hi')

    expect(await host.sessions.list()).toEqual({ entries: [] })
    expect(await host.sessions.get('p1')).toBeUndefined()
    expect(await host.sessions.rename('p1', 'x')).toBeUndefined()
    expect(await api.entry()).toBeUndefined()
    expect(await api.updateEntry({ title: 'x' })).toBeUndefined()
    await host.close()
  })
})

describe('sessions over HTTP', () => {
  /** A handler where the `x-user` header is the principal. */
  function setup() {
    const harness = defineHarness({
      name: 'test/sessions-http',
      adapter: mockAdapter(() => text('hello')).adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: (request) => {
        const id = request.headers.get('x-user')
        return id ? { id } : null
      },
      canAccess: (_principal, threadId) => threadId !== 'hidden',
    })
    const fetch: typeof globalThis.fetch = (input, init) =>
      handler(new Request(input, init))
    const clientOf = (user: string) =>
      createHarnessClient({
        url: 'http://local/api/harness',
        threadId: `${user}-thread`,
        headers: { 'x-user': user },
        fetch,
      })
    /** Prompt in the thread of `client` and wait for the answer. */
    const chat = async (client: ReturnType<typeof clientOf>) => {
      await client.prompt('hi')
      await vi.waitFor(async () =>
        expect(await client.transcript()).toHaveLength(2),
      )
      return client.transcript()
    }
    return { host, harness, handler, clientOf, chat }
  }

  it('lists, renames, forks, and deletes the sessions of the user', async () => {
    const { host, clientOf, chat } = setup()
    const alice = clientOf('alice')
    const [, answer] = await chat(alice)

    expect(threadIds(await alice.listSessions())).toEqual(['alice-thread'])
    expect(
      (await alice.renameSession('alice-thread', 'Greetings')).title,
    ).toBe('Greetings')
    const fork = await alice.forkSession('alice-thread', {
      through: idOf(answer),
    })
    expect(fork.title).toBe('Greetings (fork)')
    expect(threadIds(await alice.listSessions()).sort()).toEqual(
      ['alice-thread', fork.threadId].sort(),
    )

    await alice.deleteSession(fork.threadId)

    expect(threadIds(await alice.listSessions())).toEqual(['alice-thread'])
    await host.close()
  })

  it('keeps one user out of the sessions of another', async () => {
    const { host, harness, clientOf, chat } = setup()
    const alice = clientOf('alice')
    const bob = clientOf('bob')
    const [, answer] = await chat(alice)
    await chat(bob)
    // Alice owns this thread, but `canAccess` refuses it.
    await host.open(harness, { threadId: 'hidden', principal: { id: 'alice' } })

    expect(threadIds(await bob.listSessions())).toEqual(['bob-thread'])
    expect(threadIds(await alice.listSessions())).toEqual(['alice-thread'])
    await expect(bob.renameSession('alice-thread', 'Mine')).rejects.toThrow(
      '(404)',
    )
    await expect(bob.deleteSession('alice-thread')).rejects.toThrow('(404)')
    await expect(
      bob.forkSession('alice-thread', { through: idOf(answer) }),
    ).rejects.toThrow('(404)')
    await expect(alice.renameSession('hidden', 'x')).rejects.toThrow('(403)')
    expect(await host.sessions.get('alice-thread')).toMatchObject({
      principal: { id: 'alice' },
    })
    expect((await host.sessions.get('alice-thread'))?.title).toBeUndefined()
    await host.close()
  })

  it('answers 400 for a bad sessions request', async () => {
    const { host, handler, clientOf, chat } = setup()
    const alice = clientOf('alice')
    await chat(alice)
    const post = async (body: unknown) =>
      (
        await handler(
          new Request('http://local/api/harness/sessions', {
            method: 'POST',
            headers: { 'x-user': 'alice', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
        )
      ).status

    expect(
      await post({
        op: 'fork',
        threadId: 'alice-thread',
        before: 'a',
        through: 'b',
      }),
    ).toBe(400)
    expect(await post({ op: 'move', threadId: 'alice-thread' })).toBe(400)
    const list = await handler(
      new Request('http://local/api/harness/sessions?limit=0', {
        headers: { 'x-user': 'alice' },
      }),
    )
    expect(list.status).toBe(400)
    await expect(
      alice.forkSession('alice-thread', { before: 'not-a-message' }),
    ).rejects.toThrow(
      '(400): The transcript has no message with id not-a-message.',
    )
    await host.close()
  })
})
