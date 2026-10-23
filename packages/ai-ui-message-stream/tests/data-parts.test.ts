import { describe, expect, it, vi } from 'vitest'
import { EventSchemas } from '@ag-ui/core/schemas'
import { EventType } from '@tanstack/ai'
import { ChatClient } from '@tanstack/ai-client'
import { readUIMessageStream } from 'ai'
import { fromChatTransport } from '../src'
import { DataParts, dataChunkEvent, isDataChunk } from '../src/data-parts'
import type { StreamChunk } from '@tanstack/ai'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

/** The last AI SDK message built from these events' data chunks. */
async function readMessage(list: Array<StreamChunk>): Promise<UIMessage> {
  const parts = new DataParts()
  const chunks: Array<UIMessageChunk> = [
    { type: 'start', messageId: 'm' },
    ...list.flatMap((event) => parts.chunks(event)),
    { type: 'finish' },
  ]
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  let last: UIMessage | undefined
  for await (const message of readUIMessageStream({ stream })) last = message
  if (!last) throw new Error('no message')
  return last
}

describe('DataParts (TanStack server, AI SDK client)', () => {
  it('replaces an activity part in place on each delta', async () => {
    const message = await readMessage([
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: 'plan-1',
        activityType: 'plan',
        content: { steps: ['a'], done: false },
      },
      {
        type: EventType.ACTIVITY_DELTA,
        messageId: 'plan-1',
        activityType: 'plan',
        patch: [
          { op: 'add', path: '/steps/-', value: 'b' },
          { op: 'replace', path: '/done', value: true },
        ],
      },
      // A failed patch keeps the last content.
      {
        type: EventType.ACTIVITY_DELTA,
        messageId: 'plan-1',
        activityType: 'plan',
        patch: [{ op: 'remove', path: '/missing' }],
      },
      // No snapshot for this id.
      {
        type: EventType.ACTIVITY_DELTA,
        messageId: 'other',
        activityType: 'plan',
        patch: [],
      },
    ])
    expect(message.parts).toEqual([
      {
        type: 'data-plan',
        id: 'plan-1',
        data: { steps: ['a', 'b'], done: true },
      },
    ])
  })

  it('keeps an activity when replace is false', async () => {
    const snapshot = {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'a',
      activityType: 'plan',
      content: { v: 1 },
    } as const
    const message = await readMessage([
      snapshot,
      { ...snapshot, content: { v: 2 }, replace: false },
    ])
    expect(message.parts).toEqual([
      { type: 'data-plan', id: 'a', data: { v: 1 } },
    ])
  })

  it('sends the full shared state on snapshot and delta', async () => {
    const message = await readMessage([
      { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1, tags: ['x'] } },
      {
        type: EventType.STATE_DELTA,
        delta: [
          { op: 'test', path: '/tags', value: ['x'] },
          { op: 'copy', from: '/count', path: '/previous' },
          { op: 'replace', path: '/count', value: 2 },
          { op: 'move', from: '/tags/0', path: '/first' },
        ],
      },
    ])
    expect(message.parts).toEqual([
      {
        type: 'data-state',
        id: 'state',
        data: { count: 2, tags: [], previous: 1, first: 'x' },
      },
    ])
  })

  it('shows a subagent card going from running to finished', async () => {
    const parts = new DataParts()
    const tagged = { subagentRunId: 'sub-1' }
    const list: Array<StreamChunk> = [
      {
        type: EventType.SUBAGENT_STARTED,
        ...tagged,
        name: 'researcher',
        description: 'Finds facts',
        parentToolCallId: 'call-1',
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'c1',
        role: 'assistant',
        ...tagged,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'c1',
        delta: 'Found ',
        ...tagged,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'c1',
        delta: 'it.',
        ...tagged,
      },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'c1', ...tagged },
      { type: EventType.SUBAGENT_FINISHED, ...tagged },
    ]
    for (const event of list) EventSchemas.parse(event)

    const statuses = list.flatMap((event) =>
      parts
        .chunks(event)
        .map((chunk) =>
          'data' in chunk && typeof chunk.data === 'object' && chunk.data
            ? 'status' in chunk.data && chunk.data.status
            : undefined,
        ),
    )
    expect(statuses).toEqual(['running', 'running', 'running', 'finished'])

    const message = await readMessage(list)
    expect(message.parts).toEqual([
      {
        type: 'data-subagent',
        id: 'sub-1',
        data: {
          id: 'sub-1',
          name: 'researcher',
          description: 'Finds facts',
          parentToolCallId: 'call-1',
          status: 'finished',
          text: 'Found it.',
        },
      },
    ])
  })

  it('marks a subagent card as errored or suspended', async () => {
    const message = await readMessage([
      { type: EventType.SUBAGENT_STARTED, subagentRunId: 'a', name: 'a' },
      {
        type: EventType.SUBAGENT_ERROR,
        subagentRunId: 'a',
        message: 'boom',
        code: 'E1',
      },
      // An error is final.
      { type: EventType.SUBAGENT_FINISHED, subagentRunId: 'a' },
      { type: EventType.SUBAGENT_STARTED, subagentRunId: 'b', name: 'b' },
      {
        type: EventType.SUBAGENT_FINISHED,
        subagentRunId: 'b',
        outcome: { type: 'suspended', interruptIds: ['i1'] },
      },
    ])
    expect(message.parts.map((p) => 'data' in p && p.data)).toEqual([
      {
        id: 'a',
        name: 'a',
        status: 'error',
        error: { message: 'boom', code: 'E1' },
        text: '',
      },
      {
        id: 'b',
        name: 'b',
        status: 'suspended',
        interruptIds: ['i1'],
        text: '',
      },
    ])
  })
})

describe('dataChunkEvent (AI SDK server, TanStack client)', () => {
  it('maps a persistent data chunk with an id to an activity snapshot', () => {
    const chunk: UIMessageChunk = {
      type: 'data-weather',
      id: 'w-1',
      data: { city: 'Oslo' },
    }
    if (!isDataChunk(chunk)) throw new Error('not a data chunk')
    const event = dataChunkEvent(chunk)
    EventSchemas.parse(event)
    expect(event).toEqual({
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'w-1',
      activityType: 'weather',
      content: { city: 'Oslo' },
      replace: true,
    })
  })

  it.each<UIMessageChunk>([
    { type: 'data-ping', id: 'p', data: { a: 1 }, transient: true },
    { type: 'data-ping', data: { a: 1 } },
    { type: 'data-ping', id: 'p', data: 'text' },
    { type: 'data-ping', id: 'p', data: [1, 2] },
  ])('keeps $type as a CUSTOM event: %o', (chunk) => {
    if (!isDataChunk(chunk)) throw new Error('not a data chunk')
    const event = dataChunkEvent(chunk)
    EventSchemas.parse(event)
    expect(event).toEqual({
      type: EventType.CUSTOM,
      name: 'data-ping',
      value: chunk.data,
    })
  })

  it('shows the activity in the TanStack client and replaces it by id', async () => {
    const chunks: Array<UIMessageChunk> = [
      { type: 'start', messageId: 'a' },
      { type: 'text-start', id: '0' },
      { type: 'data-weather', id: 'w-1', data: { city: 'Oslo' } },
      { type: 'data-weather', id: 'w-1', data: { city: 'Bergen' } },
      { type: 'text-delta', id: '0', delta: 'Sunny.' },
      { type: 'text-end', id: '0' },
      { type: 'finish', finishReason: 'stop' },
    ]
    const transport: ChatTransport<UIMessage> = {
      sendMessages: () =>
        Promise.resolve(
          new ReadableStream({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk)
              controller.close()
            },
          }),
        ),
      reconnectToStream: () => Promise.resolve(null),
    }
    const client = new ChatClient({
      threadId: 't',
      connection: fromChatTransport(transport),
    })
    await client.sendMessage('weather?')
    await vi.waitFor(() =>
      expect(client.getMessages().map((m) => [m.role, m.parts])).toEqual([
        ['user', [expect.objectContaining({ type: 'text' })]],
        [
          'assistant',
          [expect.objectContaining({ type: 'text', content: 'Sunny.' })],
        ],
        [
          'activity',
          [
            {
              type: 'activity',
              activityType: 'weather',
              content: { city: 'Bergen' },
            },
          ],
        ],
      ]),
    )
  })
})
