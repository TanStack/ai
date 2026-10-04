import { describe, expect, it, vi } from 'vitest'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { loadLogState, sessionOf } from '../src/log'
import { gate, messageTexts, mockAdapter, text, toolCall } from './helpers'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { HarnessSession, ProjectOptions, SessionEvent } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/** The stores of a durable host: a log, runs, and metadata. */
function durablePersistence(log: LogStore = memoryLogStore()) {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log, runs, metadata } }
}

/** Signals become user messages. A compaction keeps a summary and a tail. */
const project: ProjectOptions = {
  version: 'v1',
  record: ({ messages, record }) => {
    if (record.type === 'app.signal' && typeof record.text === 'string') {
      return [...messages, { role: 'user', content: record.text }]
    }
    if (
      record.type === 'app.compact' &&
      typeof record.summary === 'string' &&
      typeof record.firstKept === 'number'
    ) {
      return [
        { role: 'assistant', content: record.summary },
        ...messages.slice(record.firstKept),
      ]
    }
    return undefined
  },
}

/** A model call that streams `deltas` of message `messageId`, then waits. */
function streamsThenWaits(
  messageId: string,
  deltas: Array<string>,
  until: Promise<void>,
): Reply {
  return () =>
    (async function* (): AsyncGenerator<StreamChunk> {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        timestamp: Date.now(),
      }
      for (const delta of deltas) {
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta,
          timestamp: Date.now(),
        }
      }
      await until
    })()
}

/** The events of a session from the start, once `isDone` holds for them. */
async function eventsUntil(
  session: HarnessSession,
  isDone: (seen: Array<SessionEvent>) => boolean,
) {
  const controller = new AbortController()
  const seen: Array<SessionEvent> = []
  const reading = (async () => {
    for await (const entry of session.events({
      from: '0',
      signal: controller.signal,
    })) {
      seen.push(entry)
      if (isDone(seen)) controller.abort()
    }
  })()
  await reading
  return seen
}

const deltasOf = (seen: Array<SessionEvent>, messageId: string) =>
  seen
    .map((entry) => entry.event)
    .filter(
      (event) =>
        event.type === EventType.TEXT_MESSAGE_CONTENT &&
        event.messageId === messageId,
    )
    .map((event) => ('delta' in event ? event.delta : ''))
    .join('')

/** One model call: signed thinking, a tool call, signed thinking, a tool call. */
function thinkCallThinkCall(): Array<StreamChunk> {
  const thinking = (
    id: string,
    content: string,
    signature: string,
  ): Array<StreamChunk> => [
    { type: EventType.STEP_STARTED, stepName: id, timestamp: Date.now() },
    { type: EventType.REASONING_START, messageId: id, timestamp: Date.now() },
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: id,
      role: 'reasoning',
      timestamp: Date.now(),
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: id,
      delta: content,
      timestamp: Date.now(),
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: id,
      encryptedValue: signature,
      timestamp: Date.now(),
    },
    {
      type: EventType.REASONING_MESSAGE_END,
      messageId: id,
      timestamp: Date.now(),
    },
    { type: EventType.REASONING_END, messageId: id, timestamp: Date.now() },
  ]
  const call = (id: string, city: string): Array<StreamChunk> => [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: id,
      toolCallName: 'lookup',
      timestamp: Date.now(),
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: id,
      delta: JSON.stringify({ city }),
      timestamp: Date.now(),
    },
    { type: EventType.TOOL_CALL_END, toolCallId: id, timestamp: Date.now() },
  ]
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: Date.now(),
    },
    ...thinking('think-1', 'Check Berlin.', 'sig-1'),
    ...call('call-1', 'Berlin'),
    ...thinking('think-2', 'Now Paris.', 'sig-2'),
    ...call('call-2', 'Paris'),
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: Date.now(),
      metadata: { tanstack: { finishReason: 'tool_calls' } },
    },
  ]
}

// The types refuse these store sets. The runtime check is for JavaScript
// callers and dynamic store bags, so these tests pass them with `as never`.
describe('durable host stores', () => {
  it('needs runs next to the log', () => {
    const { metadata } = memoryPersistence().stores
    expect(() =>
      createHarnessHost({
        persistence: { stores: { log: memoryLogStore(), metadata } } as never,
      }),
    ).toThrow('needs stores.runs')
  })

  it('refuses a message store next to the log', () => {
    const { messages, runs } = memoryPersistence().stores
    expect(() =>
      createHarnessHost({
        persistence: {
          stores: { log: memoryLogStore(), runs, messages },
        } as never,
      }),
    ).toThrow('Remove stores.messages and stores.inbox')
  })

  it('refuses host records without a log, and harness record types', async () => {
    const { adapter } = mockAdapter([])
    const harness = defineHarness({ name: 'test/append', adapter })
    const today = await createHarnessHost({
      persistence: memoryPersistence(),
    }).open(harness, { threadId: THREAD })
    await expect(today.append([{ type: 'app.x' }])).rejects.toThrow(
      'session.append needs a durable host',
    )

    const durable = await createHarnessHost({
      persistence: durablePersistence(),
    }).open(harness, { threadId: THREAD })
    await expect(durable.append([{ type: 'harness.event' }])).rejects.toThrow(
      'reserved for the harness',
    )
  })
})

describe('durable session log', () => {
  it('opens the thread again after a session fails to open', async () => {
    let fail = true
    const { adapter } = mockAdapter([])
    const harness = defineHarness({
      name: 'test/flaky-open',
      adapter,
      plugins: () => [
        definePlugin({
          name: 'test/flaky',
          setup: () => {
            if (fail) throw new Error('setup failed')
          },
        }),
      ],
    })
    const host = createHarnessHost({ persistence: durablePersistence() })

    await expect(host.open(harness, { threadId: THREAD })).rejects.toThrow(
      'setup failed',
    )
    fail = false
    await expect(host.open(harness, { threadId: THREAD })).resolves.toBeTruthy()
    await host.close()
  })

  it('keeps a streamed text block when the host stops in the middle', async () => {
    const persistence = durablePersistence()
    const release = gate()
    const { adapter } = mockAdapter([
      streamsThenWaits('m-live', ['Hello, ', 'wor'], release.opened),
    ])
    const harness = defineHarness({ name: 'test/crash-mid-text', adapter })
    const first = createHarnessHost({ persistence, coalesceMs: 5 })
    const session = await first.open(harness, { threadId: THREAD })
    const turn = session.prompt('say hello')

    // The deltas reach the log after the coalescing window.
    await vi.waitFor(async () => {
      const entries = await persistence.stores.log.read(THREAD)
      const events = entries.map((entry) => entry.record.event)
      expect(JSON.stringify(events)).toContain('wor')
    })

    // The first host never closes, like a process that stopped.
    const next = createHarnessHost({ persistence })
    const reopened = await next.open(harness, { threadId: THREAD })
    const seen = await eventsUntil(
      reopened,
      (events) => deltasOf(events, 'm-live') === 'Hello, wor',
    )

    expect(seen.map((entry) => entry.event)).toContainEqual(
      expect.objectContaining({
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'm-live',
      }),
    )
    expect(deltasOf(seen, 'm-live')).toBe('Hello, wor')

    release.open()
    await Promise.resolve(turn).catch(() => {})
    await first.close()
    await next.close()
  })

  it('writes host records in the same batch as the waiting events, in order', async () => {
    const inner = memoryLogStore()
    const batches: Array<Array<unknown>> = []
    const log: LogStore = {
      append: async (threadId, seq, records) => {
        await inner.append(threadId, seq, records)
        batches.push(
          records.map((record) =>
            record.type === 'harness.event' ? record.event : record,
          ),
        )
      },
      read: (threadId, options) => inner.read(threadId, options),
      subscribe: (threadId, listener) => inner.subscribe(threadId, listener),
    }
    const release = gate()
    const { adapter } = mockAdapter([
      streamsThenWaits('m1', ['partial'], release.opened),
    ])
    const host = createHarnessHost({
      persistence: durablePersistence(log),
      coalesceMs: 60_000,
    })
    const session = await host.open(
      defineHarness({ name: 'test/batch', adapter }),
      { threadId: THREAD },
    )
    const turn = session.prompt('go')
    await vi.waitFor(() =>
      expect(JSON.stringify(batches)).toContain('TEXT_MESSAGE_START'),
    )

    await session.append([{ type: 'app.note', n: 1 }])

    expect(batches.at(-1)).toEqual([
      expect.objectContaining({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: 'partial',
      }),
      { type: 'app.note', n: 1 },
    ])
    release.open()
    await Promise.resolve(turn).catch(() => {})
    await host.close()
  })

  it('gives the model the same context that a rebuild of the log gives', async () => {
    const persistence = durablePersistence()
    let session: HarnessSession | undefined
    const check = toolDefinition({
      name: 'check',
      description: 'Check the build',
    }).server(async () => {
      await session?.append([
        { type: 'app.signal', text: '[signal] tests failed' },
      ])
      return 'checked'
    })
    const { adapter, calls } = mockAdapter([
      () => text('first answer'),
      () => toolCall('check', {}),
      () => text('second answer'),
    ])
    const host = createHarnessHost({ persistence, project })
    session = await host.open(
      defineHarness({ name: 'test/project', adapter, tools: [check] }),
      { threadId: THREAD },
    )

    await session.prompt('one')
    // Between turns: the next turn starts with it.
    await session.append([
      { type: 'app.signal', text: '[signal] build failed' },
    ])
    await session.prompt('two')

    expect(messageTexts(calls[1])).toEqual([
      'one',
      'first answer',
      '[signal] build failed',
      'two',
    ])
    // During a tool call: the next model call of the same turn has it, after
    // the tool result.
    // The tool-call message has no text: its content is null.
    expect(messageTexts(calls[2]).slice(-3)).toEqual([
      'null',
      'checked',
      '[signal] tests failed',
    ])
    const rebuilt = sessionOf(
      await loadLogState({
        store: persistence.stores.log,
        logId: THREAD,
        project,
      }),
      THREAD,
    )
    expect(await session.transcript()).toEqual(rebuilt.messages)
    expect(rebuilt.messages.map((message) => message.content).at(-1)).toBe(
      'second answer',
    )
    await host.close()
  })

  it('hides the older span after a compaction record', async () => {
    const persistence = durablePersistence()
    const { adapter, calls } = mockAdapter([
      () => text('a1'),
      () => text('a2'),
      () => text('a3'),
    ])
    const host = createHarnessHost({ persistence, project })
    const session = await host.open(
      defineHarness({ name: 'test/compact', adapter }),
      { threadId: THREAD },
    )
    await session.prompt('q1')
    await session.prompt('q2')

    await session.append([
      { type: 'app.compact', summary: 'Earlier: q1 and a1.', firstKept: 2 },
    ])
    await session.prompt('q3')

    expect(messageTexts(calls[2])).toEqual([
      'Earlier: q1 and a1.',
      'q2',
      'a2',
      'q3',
    ])
    const rebuilt = sessionOf(
      await loadLogState({
        store: persistence.stores.log,
        logId: THREAD,
        project,
      }),
      THREAD,
    )
    expect(rebuilt.messages.map((message) => message.content)).toEqual([
      'Earlier: q1 and a1.',
      'q2',
      'a2',
      'q3',
      'a3',
    ])
    await host.close()
  })

  it('stops the session when another host wrote to the thread', async () => {
    const inner = memoryLogStore()
    // This host does not see the other writer, like one in another process.
    const log: LogStore = {
      append: (threadId, seq, records) => inner.append(threadId, seq, records),
      read: (threadId, options) => inner.read(threadId, options),
      subscribe: () => () => {},
    }
    const { adapter } = mockAdapter([() => text('never saved')])
    const host = createHarnessHost({ persistence: durablePersistence(log) })
    const harness = defineHarness({ name: 'test/conflict', adapter })
    const session = await host.open(harness, { threadId: THREAD })
    await inner.append(THREAD, 1, [{ type: 'app.from-another-host' }])

    await expect(session.prompt('hi')).rejects.toThrow('Another host wrote')

    // The host opens a new session, which folds the log again.
    await vi.waitFor(async () =>
      expect(await host.open(harness, { threadId: THREAD })).not.toBe(session),
    )
    await host.close()
  })

  it('lets a second host read live events without fencing the first', async () => {
    const persistence = durablePersistence()
    const { adapter } = mockAdapter([() => text('streamed answer')])
    const harness = defineHarness({ name: 'test/reader', adapter })
    const writer = createHarnessHost({ persistence })
    const reader = createHarnessHost({ persistence })
    const live = await writer.open(harness, { threadId: THREAD })
    const watching = await reader.open(harness, { threadId: THREAD })

    const seen = eventsUntil(watching, (events) =>
      events.some((entry) => entry.event.type === EventType.TEXT_MESSAGE_END),
    )
    const result = await live.prompt('hi')

    expect(result.text).toBe('streamed answer')
    expect((await seen).map((entry) => entry.event.type)).toContain(
      EventType.TEXT_MESSAGE_CONTENT,
    )
    await writer.close()
    await reader.close()
  })

  it('keeps the block order of an answer in the log and after a rebuild', async () => {
    const persistence = durablePersistence()
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up the weather',
    }).server(async () => 'sunny')
    const { adapter, calls } = mockAdapter([
      () => thinkCallThinkCall(),
      () => text('Both are sunny.'),
    ])
    const harness = defineHarness({
      name: 'test/block-order',
      adapter,
      tools: [lookup],
    })
    const host = createHarnessHost({ persistence })
    const session = await host.open(harness, { threadId: THREAD })

    await session.prompt('Weather in Berlin and Paris?')

    const order = [
      { type: 'thinking', index: 0 },
      { type: 'tool-call', id: 'call-1' },
      { type: 'thinking', index: 1 },
      { type: 'tool-call', id: 'call-2' },
    ]
    const answer = (messages: Array<ModelMessage>) =>
      messages.find((message) => message.toolCalls?.length)
    // The next model call of the turn gets the map.
    expect(answer(calls[1].messages)?.blockOrder).toEqual(order)
    const transcript = await session.transcript()
    expect(answer(transcript)).toMatchObject({
      thinking: [
        { content: 'Check Berlin.', signature: 'sig-1' },
        { content: 'Now Paris.', signature: 'sig-2' },
      ],
      blockOrder: order,
    })

    // A fold of the log gives the same messages.
    const rebuilt = sessionOf(
      await loadLogState({ store: persistence.stores.log, logId: THREAD }),
      THREAD,
    )
    expect(rebuilt.messages).toEqual(transcript)

    // The first host never closes, like a process that stopped. A second
    // host that opens the thread gets the same messages.
    const next = createHarnessHost({ persistence })
    const reopened = await next.open(harness, { threadId: THREAD })
    expect(await reopened.transcript()).toEqual(transcript)
    await host.close().catch(() => {})
    await next.close()
  })
})
