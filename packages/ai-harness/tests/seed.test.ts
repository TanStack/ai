import { describe, expect, it } from 'vitest'
import { convertMessagesToModelMessages } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  createHarnessHost,
  defineHarness,
  membersOnly,
} from '../src'
import { after, gate, messageTexts, mockAdapter, text } from './helpers'
import type { ModelMessage, UIMessage } from '@tanstack/ai'
import type { Reply } from './helpers'

/** A conversation that an app kept before it used the harness. */
const OLD: Array<ModelMessage> = [
  { id: 'old-1', role: 'user', content: 'Where is my order?' },
  {
    id: 'old-2',
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call-old',
        type: 'function',
        function: { name: 'findOrder', arguments: '{"id":42}' },
      },
    ],
  },
  { role: 'tool', toolCallId: 'call-old', content: 'Shipped.' },
  { id: 'old-4', role: 'assistant', content: 'Order 42 shipped yesterday.' },
]

const idsOf = (messages: ReadonlyArray<ModelMessage>) =>
  messages.map((message) => message.id)

/** A log and metadata, so a second host can open the thread after a close. */
function persistenceFor() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

async function open(replies: Array<Reply> = [() => text('ok')]) {
  const { adapter, calls } = mockAdapter(replies)
  const persistence = persistenceFor()
  const host = createHarnessHost({ persistence })
  const harness = defineHarness({ name: 'test/seed', adapter })
  const session = await host.open(harness, { threadId: 't1' })
  return { session, calls, host, harness, persistence }
}

describe('session.seed', () => {
  it('starts an empty thread with the messages, and the next turn reads them', async () => {
    const { session, calls, host } = await open([
      () => text('It arrives today.'),
    ])

    expect(await session.seed({ messages: OLD })).toMatchObject({
      status: 'accepted',
    })
    await session.send('When does it arrive?')

    expect(messageTexts(calls[0])).toEqual([
      'Where is my order?',
      'null',
      'Shipped.',
      'Order 42 shipped yesterday.',
      'When does it arrive?',
    ])
    expect(calls[0].messages[1].toolCalls[0].id).toBe('call-old')
    const transcript = await session.transcript()
    expect(idsOf(transcript.slice(0, OLD.length))).toEqual(idsOf(OLD))
    expect(transcript).toHaveLength(OLD.length + 2)
    await host.close()
  })

  it('keeps the seed in the log for the next host', async () => {
    const { session, host, harness, persistence } = await open()
    await session.seed({ messages: OLD })
    await host.close()

    const next = createHarnessHost({ persistence })
    const reopened = await next.open(harness, { threadId: 't1' })

    expect(idsOf(await reopened.transcript())).toEqual(idsOf(OLD))
    await next.close()
  })

  it('accepts a retry and writes nothing, also after a turn', async () => {
    const { session, host } = await open()
    await session.seed({ messages: OLD })
    await session.send('Thanks.')
    const before = await session.transcript()

    expect(await session.seed({ messages: OLD })).toMatchObject({
      status: 'accepted',
    })
    expect(await session.transcript()).toEqual(before)
    await host.close()
  })

  it('refuses a thread with other messages', async () => {
    const { session, host } = await open()
    await session.send('Hello.')

    expect(await session.seed({ messages: OLD })).toMatchObject({
      status: 'rejected',
      reason: 'not_empty',
    })
    expect(await session.transcript()).toHaveLength(2)
    await host.close()
  })

  it('refuses a tool call with no result', async () => {
    const { session, host } = await open()

    expect(await session.seed({ messages: OLD.slice(0, 2) })).toMatchObject({
      status: 'rejected',
      reason: 'open_tool_call',
    })
    expect(await session.transcript()).toEqual([])
    await host.close()
  })

  it('writes one of two seeds that start at once', async () => {
    const { session, host } = await open()
    const other: Array<ModelMessage> = [
      { id: 'other-1', role: 'user', content: 'Hello.' },
    ]

    const receipts = await Promise.all([
      session.seed({ messages: OLD }),
      session.seed({ messages: other }),
      session.seed({ messages: OLD }),
    ])

    expect(receipts.map((receipt) => receipt.status)).toEqual([
      'accepted',
      'rejected',
      'accepted',
    ])
    expect(receipts[1]).toMatchObject({ reason: 'not_empty' })
    expect(idsOf(await session.transcript())).toEqual(idsOf(OLD))
    await host.close()
  })

  it('refuses an empty seed of a thread with messages, and accepts it in an empty thread', async () => {
    const { session, host } = await open()

    expect(await session.seed({ messages: [] })).toMatchObject({
      status: 'accepted',
    })
    expect(await session.transcript()).toEqual([])
    await session.seed({ messages: OLD })
    expect(await session.seed({ messages: [] })).toMatchObject({
      status: 'rejected',
      reason: 'not_empty',
    })
    await host.close()
  })

  it('refuses a tool result with no call before it', async () => {
    const { session, host } = await open()
    const orphan: Array<ModelMessage> = [
      ...OLD.slice(0, 1),
      { role: 'tool', toolCallId: 'call-none', content: 'Shipped.' },
    ]
    const unnamed: Array<ModelMessage> = [
      ...OLD.slice(0, 1),
      { id: 'tool-1', role: 'tool', content: 'Shipped.' },
    ]
    const answeredTwice = [...OLD.slice(0, 3), ...OLD.slice(2, 3)]

    for (const messages of [orphan, unnamed, answeredTwice]) {
      expect(await session.seed({ messages })).toMatchObject({
        status: 'rejected',
        reason: 'unknown_tool_call',
      })
    }
    expect(await session.transcript()).toEqual([])
    await host.close()
  })

  it('refuses while a turn runs', async () => {
    const release = gate()
    const { session, host } = await open([after(release.opened, 'Done.')])
    const turn = session.send('Hello.')
    await turn.receipt

    expect(await session.seed({ messages: OLD })).toMatchObject({
      status: 'rejected',
      reason: 'busy',
    })
    release.open()
    await turn
    await host.close()
  })

  it('throws for a message with no id', async () => {
    const { session, host } = await open()

    await expect(
      session.seed({ messages: [{ role: 'user', content: 'Hi.' }] }),
    ).rejects.toThrow(/Message 0 of the seed has no id/)
    await host.close()
  })

  it('takes the model messages of UI messages, and a retry of them', async () => {
    const { session, host } = await open()
    const chat: Array<UIMessage> = [
      { id: 'u-1', role: 'user', parts: [{ type: 'text', content: 'Hi.' }] },
      {
        id: 'a-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'lookUp',
            arguments: '{}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            content: '{"found":true}',
            state: 'complete',
          },
          { type: 'text', content: 'Found it.' },
        ],
      },
    ]
    const messages = convertMessagesToModelMessages(chat)

    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await session.seed({ messages })).toMatchObject({
        status: 'accepted',
      })
    }
    expect(await session.transcript()).toHaveLength(messages.length)
    await host.close()
  })

  it('needs the send action on a host with access', async () => {
    interface User {
      id: string
      tenantId: string
    }
    const olga: User = { id: 'olga', tenantId: 'acme' }
    const vic: User = { id: 'vic', tenantId: 'acme' }
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: { getUser: (): User | null => null, rules: membersOnly() },
    })
    const harness = defineHarness({
      name: 'test/seed-access',
      adapter: mockAdapter([]).adapter,
    })
    const owner = await host.open(harness, { threadId: 't1', user: olga })
    await host.sessions.share({
      threadId: 't1',
      userId: vic.id,
      role: 'viewer',
      user: olga,
    })
    const viewer = await host.open(harness, { threadId: 't1', user: vic })

    await expect(viewer.seed({ messages: OLD })).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    expect(await owner.seed({ messages: OLD })).toMatchObject({
      status: 'accepted',
    })
    await host.close()
  })
})
