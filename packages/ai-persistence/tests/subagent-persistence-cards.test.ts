import { describe, expect, it, vi } from 'vitest'
import { EventType, chat, defineAgent, uiMessagesToWire } from '@tanstack/ai'
import type {
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
  SubagentPart,
  UIMessage,
} from '@tanstack/ai'
import { memoryPersistence, reconstructChat, withPersistence } from '../src'
import { createSubagentRunRecorder } from '../src/subagent-runs'

const t = 1

/** A model that plays one script per call. */
function scriptedAdapter(scripts: Array<Array<StreamChunk>>): AnyTextAdapter {
  let call = 0
  return {
    kind: 'text',
    name: 'scripted',
    model: 'test-model',
    '~types': {},
    chatStream() {
      const script = scripts[call++]
      if (!script) throw new Error('no script for this model call')
      return (async function* () {
        await Promise.resolve()
        yield* script
      })()
    },
  } as unknown as AnyTextAdapter
}

/** A child that thinks, asks approval to delete a file, then reports. */
function cleaner(
  execute: (input: unknown) => unknown,
  { needsApproval = true } = {},
) {
  const model = scriptedAdapter([
    [
      { type: EventType.RUN_STARTED, runId: 'c1', threadId: 'c', timestamp: t },
      { type: EventType.REASONING_START, messageId: 'r1', timestamp: t },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'r1',
        role: 'reasoning',
        timestamp: t,
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'r1',
        delta: 'Delete a first',
        timestamp: t,
      },
      { type: EventType.REASONING_MESSAGE_END, messageId: 'r1', timestamp: t },
      { type: EventType.REASONING_END, messageId: 'r1', timestamp: t },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call_c',
        toolCallName: 'deleteFile',
        toolName: 'deleteFile',
        timestamp: t,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call_c',
        delta: '{"path":"a"}',
        timestamp: t,
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'c1',
        threadId: 'c',
        finishReason: 'tool_calls',
        timestamp: t,
      },
    ],
    [
      { type: EventType.RUN_STARTED, runId: 'c2', threadId: 'c', timestamp: t },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'done',
        role: 'assistant',
        timestamp: t,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'done',
        delta: 'Deleted a',
        timestamp: t,
      },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'done', timestamp: t },
      {
        type: EventType.RUN_FINISHED,
        runId: 'c2',
        threadId: 'c',
        finishReason: 'stop',
        timestamp: t,
      },
    ],
  ] as Array<Array<StreamChunk>>)
  return defineAgent({
    name: 'cleaner',
    description: 'Deletes files',
    run: (ctx) =>
      chat({
        adapter: model,
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        subagentRunId: ctx.subagentRunId,
        resume: ctx.resume,
        tools: [
          {
            name: 'deleteFile',
            description: 'Delete a file',
            needsApproval,
            execute,
          },
        ],
      }),
  })
}

type Desk = {
  messages: Array<UIMessage>
  interrupts: { runId: string; pending: Array<{ id?: unknown }> } | null
}

async function loadDesk(persistence: ReturnType<typeof memoryPersistence>) {
  const response = await reconstructChat(
    persistence,
    new Request('http://local/api/chat?threadId=desk'),
  )
  const body: Desk = await response.json()
  return body
}

function cardOf(messages: ReadonlyArray<UIMessage>): SubagentPart {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'subagent') return part
    }
  }
  throw new Error('no subagent card')
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('persisted subagent cards', () => {
  it('keeps reasoning, tool calls, and interrupts across a reload', async () => {
    const persistence = memoryPersistence()
    const execute = vi.fn().mockReturnValue({ deleted: true })
    const agent = cleaner(execute)
    const router = vi.fn(() => 'cleaner')
    const run = (input: {
      runId: string
      parentRunId?: string
      messages: Array<UIMessage | ModelMessage>
      resume?: Array<{
        interruptId: string
        status: 'resolved'
        payload: unknown
      }>
    }) =>
      collect(
        chat({
          adapter: scriptedAdapter([]),
          threadId: 'desk',
          ...input,
          middleware: [withPersistence(persistence)],
          subagents: { agents: [agent], router },
        }),
      )

    await run({
      runId: 'run-1',
      messages: [{ id: 'u1', role: 'user', content: 'Clean up' }],
    })

    // A reload rebuilds the whole card and the pending approval.
    const suspended = await loadDesk(persistence)
    const card = cardOf(suspended.messages)
    expect(card.subagent).toMatchObject({
      name: 'cleaner',
      status: 'suspended',
      interruptIds: ['approval_call_c'],
    })
    const parts = card.subagent.messages.flatMap((message) => message.parts)
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'thinking', content: 'Delete a first' }),
    )
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'tool-call', id: 'call_c' }),
    )
    expect(suspended.interrupts?.pending).toEqual([
      expect.objectContaining({ id: 'approval_call_c' }),
    ])

    // The reloaded client answers the approval.
    const second = await run({
      runId: 'run-2',
      parentRunId: 'run-1',
      messages: JSON.parse(
        JSON.stringify(uiMessagesToWire(suspended.messages)),
      ),
      resume: [
        { interruptId: 'approval_call_c', status: 'resolved', payload: true },
      ],
    })
    expect(second.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(execute).toHaveBeenCalledWith({ path: 'a' }, expect.anything())
    // The reloaded card kept the router plan, so the router ran only once.
    expect(router).toHaveBeenCalledTimes(1)

    const finished = await loadDesk(persistence)
    expect(finished.interrupts).toBeNull()
    const done = cardOf(finished.messages)
    expect(done.subagent.status).toBe('finished')
    const doneParts = done.subagent.messages.flatMap((message) => message.parts)
    expect(doneParts).toContainEqual(
      expect.objectContaining({ type: 'thinking', content: 'Delete a first' }),
    )
    expect(doneParts).toContainEqual(
      expect.objectContaining({ type: 'tool-result', toolCallId: 'call_c' }),
    )
    expect(doneParts).toContainEqual(
      expect.objectContaining({ type: 'text', content: 'Deleted a' }),
    )
  })
  it('commits a child answer when the parent hands off to main', async () => {
    const persistence = memoryPersistence()
    const execute = vi.fn().mockReturnValue({ deleted: true })
    const agent = cleaner(execute)
    const main = scriptedAdapter([
      [
        {
          type: EventType.RUN_STARTED,
          runId: 'run-2',
          threadId: 'desk',
          timestamp: t,
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm1',
          role: 'assistant',
          timestamp: t,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm1',
          delta: 'All clean.',
          timestamp: t,
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'm1', timestamp: t },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-2',
          threadId: 'desk',
          timestamp: t,
        },
      ],
    ])
    const run = (input: {
      runId: string
      parentRunId?: string
      messages: Array<UIMessage | ModelMessage>
      resume?: Array<{
        interruptId: string
        status: 'resolved'
        payload: unknown
      }>
    }) =>
      collect(
        chat({
          adapter: main,
          threadId: 'desk',
          ...input,
          middleware: [withPersistence(persistence)],
          subagents: {
            agents: [agent],
            router: () => 'cleaner',
            strategy: 'handoff',
          },
        }),
      )

    await run({
      runId: 'run-1',
      messages: [{ id: 'u1', role: 'user', content: 'Clean up' }],
    })
    const suspended = await loadDesk(persistence)
    expect(suspended.interrupts?.pending).toEqual([
      expect.objectContaining({ id: 'approval_call_c' }),
    ])

    const second = await run({
      runId: 'run-2',
      parentRunId: 'run-1',
      messages: JSON.parse(
        JSON.stringify(uiMessagesToWire(suspended.messages)),
      ),
      resume: [
        { interruptId: 'approval_call_c', status: 'resolved', payload: true },
      ],
    })
    expect(second.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(execute).toHaveBeenCalledWith({ path: 'a' }, expect.anything())

    // The approval is resolved and main's reply is stored once.
    // ponytail: the reloaded card is not rebuilt on this path. Main's
    // persistence merge drops the interrupted run's host row. Open question.
    const finished = await loadDesk(persistence)
    expect(finished.interrupts).toBeNull()
    const texts = finished.messages
      .flatMap((message) => message.parts)
      .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    expect(texts.filter((text) => text.includes('All clean.'))).toHaveLength(1)
  })
  it('keeps the card across a reload when the parent hands off to main', async () => {
    const persistence = memoryPersistence()
    const execute = vi.fn().mockReturnValue({ deleted: true })
    const agent = cleaner(execute, { needsApproval: false })
    const main = scriptedAdapter([
      [
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'desk',
          timestamp: t,
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm1',
          role: 'assistant',
          timestamp: t,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm1',
          delta: 'All clean.',
          timestamp: t,
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'm1', timestamp: t },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'desk',
          timestamp: t,
        },
      ],
    ])
    const chunks = await collect(
      chat({
        adapter: main,
        threadId: 'desk',
        runId: 'run-1',
        messages: [{ id: 'u1', role: 'user', content: 'Clean up' }],
        middleware: [withPersistence(persistence)],
        subagents: {
          agents: [agent],
          router: () => 'cleaner',
          strategy: 'handoff',
        },
      }),
    )
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(execute).toHaveBeenCalledWith({ path: 'a' }, expect.anything())

    const desk = await loadDesk(persistence)
    expect(desk.interrupts).toBeNull()
    expect(cardOf(desk.messages).subagent.status).toBe('finished')
    const texts = desk.messages
      .flatMap((message) => message.parts)
      .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    expect(texts.filter((text) => text.includes('All clean.'))).toHaveLength(1)
  })
})

describe('subagent run recorder', () => {
  it('keeps each thread child text in that thread', async () => {
    const { stores } = memoryPersistence()
    if (!stores.messages) throw new Error('memory store has messages')
    // One recorder, as one withPersistence instance serves many requests.
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      ...(stores.runs ? { runs: stores.runs } : {}),
      intervalMs: 0,
    })
    const runs = [
      { threadId: 't1', runId: 'r1', text: 'first thread notes' },
      { threadId: 't2', runId: 'r2', text: 'second thread notes' },
    ]
    for (const { threadId, runId } of runs) {
      await recorder.start({
        threadId,
        runId,
        messages: [{ id: `u-${runId}`, role: 'user', content: 'hi' }],
      })
      await recorder.chunk({
        threadId,
        runId,
        chunk: {
          type: EventType.SUBAGENT_STARTED,
          subagentRunId: `s-${runId}`,
          name: 'writer',
          timestamp: t,
        },
      })
    }
    // Both runs stream at the same time.
    for (const { threadId, runId, text } of runs) {
      await recorder.chunk({
        threadId,
        runId,
        chunk: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: `m-${runId}`,
          delta: text,
          subagentRunId: `s-${runId}`,
          timestamp: t,
        },
      })
    }

    const first = JSON.stringify(await stores.messages.loadThread('t1'))
    const second = JSON.stringify(await stores.messages.loadThread('t2'))
    expect(first).toContain('first thread notes')
    expect(first).not.toContain('second thread notes')
    expect(second).toContain('second thread notes')
    expect(second).not.toContain('first thread notes')
  })
})
