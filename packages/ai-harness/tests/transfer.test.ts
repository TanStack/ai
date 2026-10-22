import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  configOption,
  createHarnessHost,
  defineHarness,
  definePlugin,
  logIdOf,
  membersOnly,
} from '../src'
import { mediaIdOf, mediaPart } from '../src/media-entry'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
  turnInterrupts,
  wrapLogStore,
} from './helpers'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { HarnessHost, HostEvent } from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

interface User {
  id: string
  tenantId: string
}

const olga: User = { id: 'olga', tenantId: 'acme' }
const bea: User = { id: 'bea', tenantId: 'acme' }
const cid: User = { id: 'cid', tenantId: 'acme' }
const gus: User = { id: 'gus', tenantId: 'globex' }

const SOURCE = 'src'
const NOTE = 'Refund for order 42.'

/** A plugin with a config option and a counter in its saved state. */
const counter = definePlugin({
  name: 'test/counter',
  setup: (ctx) => {
    const state = ctx.state({ count: 0 })
    return {
      config: {
        tone: configOption.select({
          options: ['plain', 'warm'],
          default: 'plain',
        }),
      },
      tools: [
        toolDefinition({
          name: 'count',
          description: 'Count one up',
          inputSchema: z.object({}),
        }).server(async () => {
          await state.update((current) => ({ count: current.count + 1 }))
          return 'counted'
        }),
      ],
    }
  },
})

const contents = (messages: ReadonlyArray<ModelMessage>) =>
  messages.map(
    (message) => `${message.role}:${JSON.stringify(message.content)}`,
  )

/** `chunks` with this usage on RUN_FINISHED, as a provider reports it. */
function withUsage(
  chunks: Array<StreamChunk>,
  prompt: number,
  completion: number,
) {
  return chunks.map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: {
            promptTokens: prompt,
            completionTokens: completion,
            totalTokens: prompt + completion,
          },
        }
      : chunk,
  )
}

/** The records of the log of a thread of tenant `acme`, in order. */
async function recordsOf(log: LogStore, threadId: string) {
  const entries = await log.read({
    logId: logIdOf({ tenantId: 'acme', logId: threadId }),
  })
  return entries.map((entry) => entry.record)
}

const transfersIn = async (log: LogStore, threadId: string) =>
  (await recordsOf(log, threadId)).filter(
    (record) => record.type === 'harness.transferred',
  )

/**
 * A host with `membersOnly()` access, a `support` harness (the source) and
 * a `billing` harness (the target), each with scripted turns.
 */
function accessHost({
  support = () => text('ok'),
  billing = () => text('billing here'),
}: { support?: Array<Reply> | Reply; billing?: Array<Reply> | Reply } = {}) {
  const persistence = memoryPersistence()
  const host: HarnessHost<User> = createHarnessHost({
    persistence,
    access: { getUser: (): User | null => null, rules: membersOnly() },
  })
  const supportModel = mockAdapter(support)
  const billingModel = mockAdapter(billing)
  return {
    host,
    log: persistence.stores.log,
    support: defineHarness({
      name: 'test/support',
      adapter: supportModel.adapter,
    }),
    billing: defineHarness({
      name: 'test/billing',
      adapter: billingModel.adapter,
    }),
    supportCalls: supportModel.calls,
    billingCalls: billingModel.calls,
  }
}

/** Read `host.events()` into a list until `stop` runs. */
function readEvents(host: HarnessHost<User>) {
  const events: Array<HostEvent> = []
  const reader = new AbortController()
  const reading = (async () => {
    for await (const event of host.events({ signal: reader.signal })) {
      events.push(event)
    }
  })()
  const stop = async () => {
    reader.abort()
    await reading
  }
  return { events, stop }
}

describe('host.transfer to a new thread', () => {
  it('makes a thread of the target harness in the source tenant, with the user as its only member', async () => {
    const { host, support, billing, billingCalls } = accessHost()
    const reader = readEvents(host)
    const source = await host.open(support, {
      threadId: SOURCE,
      user: olga,
    })
    await source.send('one')
    await host.sessions.share({
      threadId: SOURCE,
      userId: bea.id,
      role: 'member',
      user: olga,
    })

    const { transferId, threadId } = await host.transfer({
      from: { harness: support, threadId: SOURCE },
      to: { harness: billing },
      envelope: { note: NOTE },
      user: olga,
    })

    const entry = await host.sessions.get({ threadId, user: olga })
    expect(entry).toMatchObject({
      tenantId: 'acme',
      harness: 'test/billing',
      members: [{ userId: 'olga', role: 'owner' }],
      metadata: {
        'harness:transferredFrom': [
          { transferId, harness: 'test/support', threadId: SOURCE },
        ],
      },
    })
    expect(entry?.parentThreadId).toBeUndefined()
    const sourceEntry = await host.sessions.get({
      threadId: SOURCE,
      user: olga,
    })
    expect(sourceEntry?.metadata).toMatchObject({
      'harness:transferredTo': [
        { transferId, harness: 'test/billing', threadId },
      ],
    })
    // The target is a root thread: the list has it, and it opens alone.
    const listed = await host.sessions.list({ user: olga })
    expect(listed.entries.map((listedEntry) => listedEntry.threadId)).toContain(
      threadId,
    )
    const target = await host.open(billing, { threadId, user: olga })
    // `messages` defaults to 'none': the note alone.
    expect(contents(await target.transcript())).toEqual([
      `user:${JSON.stringify(NOTE)}`,
    ])
    await target.send('Hi.')
    expect(messageTexts(billingCalls[0])).toEqual([NOTE, 'Hi.'])
    // The members of the source do not come along.
    await expect(
      host.open(billing, { threadId, user: bea }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    // The source goes on.
    await source.send('two')
    expect(source.snapshot().status).toBe('idle')

    await waitFor(() =>
      expect(reader.events).toContainEqual({
        type: 'transferred',
        transferId,
        tenantId: 'acme',
        from: { harness: 'test/support', threadId: SOURCE },
        to: { harness: 'test/billing', threadId },
        userId: 'olga',
        at: expect.any(Number),
      }),
    )
    await reader.stop()
    await host.close()
  })

  it("copies the settled messages and their media for messages: 'all', and no settings, config, state, or waits", async () => {
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy',
      inputSchema: z.object({}),
      needsApproval: true,
    }).server(async () => 'deployed')
    const { adapter } = mockAdapter([
      () => text('a cat'),
      () => toolCall('count', {}, 'c1'),
      () => text('counted once'),
      () => toolCall('deploy', {}, 'c2'),
    ])
    const persistence = memoryPersistence()
    const { log } = persistence.stores
    const host = createHarnessHost({ persistence })
    const support = defineHarness({
      name: 'test/support',
      adapter,
      tools: [deploy],
      models: { main: adapter },
      plugins: () => [counter],
    })
    const billing = defineHarness({
      name: 'test/billing',
      adapter: mockAdapter(() => text('billing here')).adapter,
      plugins: () => [counter],
    })
    const source = await host.open(support, {
      threadId: SOURCE,
      user: olga,
    })
    await source.updateThreadSettings({
      settings: { model: 'main', instructions: 'Be brief.' },
    })
    await source.setPluginSetting({ key: 'tone', value: 'warm' })
    const bytes = new Uint8Array([1, 2, 3, 4])
    const record = await source.putMedia({
      body: bytes,
      mimeType: 'image/png',
      name: 'cat.png',
    })
    await source.send([
      { type: 'text', content: 'What is this?' },
      mediaPart(record),
    ])
    await source.send('Count.')
    await source.send('Deploy.')
    expect(turnInterrupts(source.snapshot())).toHaveLength(1)

    const { threadId } = await host.transfer({
      from: { harness: support, threadId: SOURCE },
      to: { harness: billing },
      envelope: { note: NOTE, messages: 'all' },
      user: olga,
    })

    const target = await host.open(billing, { threadId, user: olga })
    const transcript = await target.transcript()
    const sourceTranscript = await source.transcript()
    // The note, then the transcript up to the deploy call, which has no
    // result yet.
    const settled = sourceTranscript.slice(0, -1)
    expect(sourceTranscript.at(-1)?.toolCalls?.[0]?.id).toBe('c2')
    expect(transcript.map((message) => message.role)).toEqual([
      'user',
      ...settled.map((message) => message.role),
    ])
    expect(transcript.slice(2).map((message) => message.content)).toEqual(
      settled.slice(1).map((message) => message.content),
    )
    // The media file has a copy in the target thread.
    const parts = Array.isArray(transcript[1]?.content)
      ? transcript[1].content
      : []
    const id = parts.map(mediaIdOf).find((value) => value !== undefined)
    if (!id) throw new Error('The transfer lost the media part.')
    expect(id).not.toBe(record.id)
    expect(await target.getMedia({ id })).toMatchObject({
      threadId,
      name: 'cat.png',
    })
    expect(await target.loadMedia({ id })).toEqual(bytes)
    expect(await target.getMedia({ id: record.id })).toBeNull()
    // Nothing else moved.
    expect(target.threadSettings()).toEqual({})
    expect(target.pluginSettings().tone?.value).toBe('plain')
    expect(target.snapshot().plugins['test/counter']).toEqual({ count: 0 })
    expect(turnInterrupts(target.snapshot())).toEqual([])
    const types = new Set(
      (
        await log.read({
          logId: logIdOf({ tenantId: 'acme', logId: threadId }),
        })
      ).map((entry) => entry.record.type),
    )
    for (const type of [
      'harness.settings',
      'harness.config',
      'harness.plugin.state',
      'harness.state',
      'harness.wait',
      'harness.interrupt',
    ]) {
      expect(types.has(type)).toBe(false)
    }
    await host.close()
  })

  it("adds one summary message by the source model for messages: 'summary', and counts its usage in the source", async () => {
    const { host, log, support, billing, supportCalls } = accessHost({
      support: [
        () => text('A1'),
        () => withUsage(text('The user wants a refund.'), 7, 3),
      ],
    })
    const source = await host.open(support, {
      threadId: SOURCE,
      user: olga,
    })
    await source.send('I want my money back.')

    const { threadId } = await host.transfer({
      from: { harness: support, threadId: SOURCE },
      to: { harness: billing },
      envelope: { note: NOTE, messages: 'summary' },
      user: olga,
    })

    const target = await host.open(billing, { threadId, user: olga })
    expect(contents(await target.transcript())).toEqual([
      `user:${JSON.stringify(NOTE)}`,
      `assistant:${JSON.stringify('Summary of the conversation so far:\nThe user wants a refund.')}`,
    ])
    // The model of the source read the transcript.
    const [prompt] = messageTexts(supportCalls[1])
    expect(prompt).toContain('I want my money back.')
    expect(prompt).toContain('A1')
    await waitFor(() =>
      expect(source.usage().bySender.olga).toMatchObject({
        calls: 1,
        totalTokens: 10,
      }),
    )
    // The summary call counts under the source `transfer`.
    expect(source.usage().bySource).toEqual({
      transfer: source.usage().bySender.olga,
    })
    expect(
      (await recordsOf(log, SOURCE)).filter(
        (record) => record.type === 'harness.usage',
      ),
    ).toEqual([
      expect.objectContaining({ source: 'transfer', label: 'summary' }),
    ])
    expect(target.usage().total.calls).toBe(0)
    await host.close()
  })
})

describe('host.transfer retries', () => {
  it('writes one record with the same transferId in both logs, and a retry makes no second thread', async () => {
    const { host, log, support, billing } = accessHost()
    const source = await host.open(support, {
      threadId: SOURCE,
      user: olga,
    })
    await source.send('one')
    const options = {
      from: { harness: support, threadId: SOURCE },
      to: { harness: billing },
      envelope: { note: NOTE, messages: 'all' as const },
      user: olga,
      transferId: 'tr-1',
    }

    const first = await host.transfer(options)
    const second = await host.transfer(options)

    expect(second).toEqual(first)
    expect(first.transferId).toBe('tr-1')
    const listed = await host.sessions.list({ user: olga })
    expect(listed.entries).toHaveLength(2)
    const target = await host.open(billing, {
      threadId: first.threadId,
      user: olga,
    })
    expect(contents(await target.transcript())).toEqual([
      `user:${JSON.stringify(NOTE)}`,
      ...contents(await source.transcript()),
    ])
    expect(await transfersIn(log, first.threadId)).toEqual([
      expect.objectContaining({
        transferId: 'tr-1',
        from: { harness: 'test/support', threadId: SOURCE },
        user: { id: 'olga', tenantId: 'acme' },
      }),
    ])
    expect(await transfersIn(log, SOURCE)).toEqual([
      expect.objectContaining({
        transferId: 'tr-1',
        to: { harness: 'test/billing', threadId: first.threadId },
      }),
    ])
    const entry = await host.sessions.get({
      threadId: first.threadId,
      user: olga,
    })
    expect(entry?.metadata?.['harness:transferredFrom']).toHaveLength(1)
    await host.close()
  })

  it('writes only the source record on a retry after the source write failed', async () => {
    const logState = memoryLogState()
    const log = memoryLogStore({ state: logState })
    const { sessions } = memoryPersistence().stores
    // The first host cannot write the source end of a transfer.
    const failing = wrapLogStore(log, {
      append: (options) =>
        options.records.some(
          (record) => record.type === 'harness.transferred',
        ) && options.logId === logIdOf({ logId: SOURCE })
          ? Promise.reject(new Error('The store is down.'))
          : log.append(options),
    })
    const support = defineHarness({
      name: 'test/support',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const billing = defineHarness({
      name: 'test/billing',
      adapter: mockAdapter(() => text('billing here')).adapter,
    })
    const options = {
      from: { harness: support, threadId: SOURCE },
      to: { harness: billing },
      envelope: { note: NOTE },
      transferId: 'tr-2',
    }
    const first = createHarnessHost({
      persistence: { stores: { log: failing, sessions } },
    })
    const source = await first.open(support, { threadId: SOURCE })
    await source.send('one')
    await expect(first.transfer(options)).rejects.toThrow('The store is down.')
    await first.close()

    const second = createHarnessHost({
      persistence: { stores: { log, sessions } },
    })
    const { threadId } = await second.transfer(options)

    const target = await second.open(billing, { threadId })
    expect(contents(await target.transcript())).toEqual([
      `user:${JSON.stringify(NOTE)}`,
    ])
    const sourceState = await storedThreadState(log, { threadId: SOURCE })
    expect(sourceState.transfers.get('tr-2')?.to).toEqual({
      harness: 'test/billing',
      threadId,
    })
    await second.close()
  })
})

describe('host.transfer access', () => {
  it('refuses a user of another tenant, a non-member, and a member who is not the owner', async () => {
    const { host, support, billing } = accessHost()
    const source = await host.open(support, {
      threadId: SOURCE,
      user: olga,
    })
    await source.send('one')
    await host.sessions.share({
      threadId: SOURCE,
      userId: cid.id,
      role: 'member',
      user: olga,
    })
    const transfer = (user: User) =>
      host.transfer({
        from: { harness: support, threadId: SOURCE },
        to: { harness: billing },
        envelope: { note: NOTE },
        user,
      })

    for (const user of [gus, bea, cid]) {
      await expect(transfer(user)).rejects.toBeInstanceOf(AccessDeniedError)
    }
    // No target thread was made, in any tenant.
    expect((await host.sessions.list({ user: olga })).entries).toHaveLength(1)
    expect((await host.sessions.list({ user: gus })).entries).toEqual([])
    await host.close()
  })

  it('throws for a source thread that does not exist, also with no access', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const support = defineHarness({
      name: 'test/support',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const billing = defineHarness({
      name: 'test/billing',
      adapter: mockAdapter(() => text('billing here')).adapter,
    })

    await expect(
      host.transfer({
        from: { harness: support, threadId: 'case-42 ' },
        to: { harness: billing, threadId: 'target' },
        envelope: { note: NOTE, messages: 'all' },
      }),
    ).rejects.toThrow('Thread "case-42 " does not exist.')
    expect(await host.sessions.get({ threadId: 'case-42 ' })).toBeUndefined()
    expect(await host.sessions.get({ threadId: 'target' })).toBeUndefined()
    await host.close()
  })

  it('refuses an existing target of another harness, or one the user cannot send to, and keeps the members of a target it can', async () => {
    const { host, support, billing } = accessHost()
    const source = await host.open(support, {
      threadId: SOURCE,
      user: olga,
    })
    await source.send('one')
    await host.open(support, { threadId: 'other', user: olga })
    await host.open(billing, { threadId: 'bea-billing', user: bea })
    await host.sessions.share({
      threadId: 'bea-billing',
      userId: olga.id,
      role: 'viewer',
      user: bea,
    })
    const transfer = (threadId: string) =>
      host.transfer({
        from: { harness: support, threadId: SOURCE },
        to: { harness: billing, threadId },
        envelope: { note: NOTE },
        user: olga,
      })

    await expect(transfer('other')).rejects.toThrow(
      'belongs to harness "test/support"',
    )
    await expect(transfer('bea-billing')).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    await host.sessions.share({
      threadId: 'bea-billing',
      userId: olga.id,
      role: 'member',
      user: bea,
    })
    await transfer('bea-billing')
    const entry = await host.sessions.get({
      threadId: 'bea-billing',
      user: bea,
    })
    expect(entry?.members).toEqual([
      { userId: 'bea', role: 'owner' },
      { userId: 'olga', role: 'member' },
    ])
    await host.close()
  })
})

describe('host.transfer across hosts', () => {
  it('writes the source record through the input lane when another host owns the source', async () => {
    const logState = memoryLogState()
    const { sessions } = memoryPersistence().stores
    const release = gate()
    const support = defineHarness({
      name: 'test/support',
      adapter: mockAdapter([() => text('A1'), after(release.opened, 'A2')])
        .adapter,
    })
    const billing = defineHarness({
      name: 'test/billing',
      adapter: mockAdapter(() => text('billing here')).adapter,
    })
    const one = createHarnessHost({
      persistence: {
        stores: { log: memoryLogStore({ state: logState }), sessions },
      },
    })
    const twoLog = memoryLogStore({ state: logState })
    const two = createHarnessHost({
      persistence: { stores: { log: twoLog, sessions } },
    })
    const source = await one.open(support, { threadId: SOURCE })
    await source.send('one')
    // Host one owns the log while this turn runs.
    const turn = source.send('two')
    await waitFor(() => expect(source.snapshot().status).toBe('running'))

    const { threadId } = await two.transfer({
      from: { harness: support, threadId: SOURCE },
      to: { harness: billing },
      envelope: { note: NOTE, messages: 'all' },
      transferId: 'tr-3',
    })

    // Host one appended the offered record.
    await waitFor(async () =>
      expect(
        (await storedThreadState(twoLog, { threadId: SOURCE })).transfers.get(
          'tr-3',
        )?.to,
      ).toEqual({ harness: 'test/billing', threadId }),
    )
    expect(
      await twoLog.listOfferedInputs({ logId: logIdOf({ logId: SOURCE }) }),
    ).toEqual([])
    // The saved messages moved: not the answer of the turn that runs.
    const target = await two.open(billing, { threadId })
    expect(contents(await target.transcript())).toEqual([
      `user:${JSON.stringify(NOTE)}`,
      'user:"one"',
      'assistant:"A1"',
      'user:"two"',
    ])
    release.open()
    await turn
    await one.close()
    await two.close()
  })
})
