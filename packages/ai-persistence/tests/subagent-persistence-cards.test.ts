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

describe('host ownership collisions', () => {
  it.each(['foreign', 'malformed'])(
    'does not replace a %s client host marker',
    async (kind) => {
      const { stores } = memoryPersistence()
      const recorder = createSubagentRunRecorder({
        messages: stores.messages,
        runs: stores.runs,
        intervalMs: 0,
      })
      const original: ModelMessage = {
        id: 'assistant:run-1',
        role: 'assistant',
        content: 'writer:\nNotes',
        metadata: {
          tanstack: { runId: 'run-1' },
          'tanstack:subagentHost': { version: 1, runId: 'run-1' },
        },
      }
      const user: ModelMessage = { id: 'u1', role: 'user', content: 'Research' }
      await stores.messages.saveThread('desk', [user, original])
      const marker =
        kind === 'foreign'
          ? { version: 1, runId: 'foreign-run' }
          : { version: 2, runId: 'run-1' }
      const incoming: ModelMessage = {
        id: 'client-host',
        role: 'assistant',
        content: original.content,
        metadata: { 'tanstack:subagentHost': marker },
      }
      await recorder.start({
        threadId: 'desk',
        runId: 'run-2',
        messages: [user, incoming],
      })
      const saved = await stores.messages.loadThread('desk')
      const client = saved.find((message) => message.id === 'client-host')
      expect(client?.metadata).toEqual(incoming.metadata)
      expect(incoming.metadata).toEqual({ 'tanstack:subagentHost': marker })
    },
  )
  it('does not overwrite an ordinary reply while a child streams', async () => {
    const { stores } = memoryPersistence()
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      runs: stores.runs,
      intervalMs: 0,
    })
    const main: ModelMessage = {
      id: 'assistant:r1',
      role: 'assistant',
      content: 'All clean.',
      metadata: { tanstack: { runId: 'r1' } },
    }
    await recorder.start({
      threadId: 'desk',
      runId: 'r1',
      messages: [{ id: 'u1', role: 'user', content: 'Research' }, main],
    })
    await recorder.chunk({
      threadId: 'desk',
      runId: 'r1',
      chunk: {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 'child',
        name: 'writer',
        timestamp: t,
      },
    })
    await recorder.chunk({
      threadId: 'desk',
      runId: 'r1',
      chunk: {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'note',
        delta: 'Notes',
        subagentRunId: 'child',
        timestamp: t,
      },
    })
    const saved = await stores.messages.loadThread('desk')
    expect(saved.find((message) => message.id === main.id)).toEqual(main)
    const host = saved.find(
      (message) => message.id !== main.id && message.role === 'assistant',
    )
    expect(host?.content).toBe('writer:\nNotes')
    expect(host?.metadata).toMatchObject({
      'tanstack:subagentHost': { version: 1, runId: 'r1' },
    })
    expect(new Set(saved.map((message) => message.id)).size).toBe(saved.length)
  })
})

describe('handoff host ID collision', () => {
  it('keeps an occupied canonical reply and creates one distinct marked host', async () => {
    const persistence = memoryPersistence()
    const ordinary: ModelMessage = {
      id: 'assistant:run-1',
      role: 'assistant',
      content: 'Ordinary before.',
      metadata: { tanstack: { runId: 'run-1' } },
    }
    const child = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: async function* () {
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'note',
          delta: 'Notes',
          timestamp: t,
        }
      },
    })
    const main = scriptedAdapter([
      [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'main',
          role: 'assistant',
          timestamp: t,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'main',
          delta: 'All clean.',
          timestamp: t,
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'main', timestamp: t },
      ],
    ])
    await collect(
      chat({
        adapter: main,
        threadId: 'desk',
        runId: 'run-1',
        messages: [{ id: 'u1', role: 'user', content: 'Research' }, ordinary],
        middleware: [withPersistence(persistence)],
        subagents: {
          agents: [child],
          router: () => 'writer',
          strategy: 'handoff',
        },
      }),
    )
    const stored = await persistence.stores.messages.loadThread('desk')
    expect(stored.find((message) => message.id === ordinary.id)).toEqual(
      ordinary,
    )
    expect(new Set(stored.map((message) => message.id)).size).toBe(
      stored.length,
    )
    const marked = stored.filter(
      (message) =>
        message.metadata &&
        Object.hasOwn(message.metadata, 'tanstack:subagentHost'),
    )
    expect(marked).toHaveLength(1)
    expect(marked[0]?.id).not.toBe(ordinary.id)
    const desk = await loadDesk(persistence)
    expect(
      desk.messages
        .flatMap((message) => message.parts)
        .filter((part) => part.type === 'subagent'),
    ).toHaveLength(1)
    expect(
      desk.messages
        .flatMap((message) => message.parts)
        .filter((part) => part.type === 'text'),
    ).toEqual(
      expect.arrayContaining([
        { type: 'text', content: 'Ordinary before.' },
        { type: 'text', content: 'All clean.' },
      ]),
    )
  })
})

describe('marked handoff host preservation', () => {
  it('transfers a proved host to only its same-turn client replacement', async () => {
    const { stores } = memoryPersistence()
    const user: ModelMessage = { id: 'user', role: 'user', content: 'Research' }
    const original: ModelMessage = {
      id: 'original-host',
      role: 'assistant',
      content: 'writer:\nNotes.',
      metadata: {
        tanstack: { runId: 'run-1' },
        'tanstack:subagentHost': { version: 1, runId: 'run-1' },
      },
    }
    await stores.messages.saveThread('desk', [user, original])
    const ordinary: ModelMessage = {
      id: 'ordinary',
      role: 'assistant',
      content: 'Ordinary reply.',
      metadata: { audit: 'ordinary' },
    }
    const replacement: ModelMessage = {
      id: 'client-host',
      role: 'assistant',
      content: original.content,
      metadata: { audit: 'client' },
    }
    const incoming = [user, ordinary, replacement]
    const before = JSON.stringify(incoming)
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      ...(stores.runs ? { runs: stores.runs } : {}),
      intervalMs: 0,
    })
    await recorder.start({
      threadId: 'desk',
      runId: 'run-1',
      messages: incoming,
    })
    const saved = await stores.messages.loadThread('desk')
    expect(saved.filter((message) => message.id === ordinary.id)).toEqual([
      ordinary,
    ])
    expect(saved.some((message) => message.id === original.id)).toBe(false)
    const marked = saved.filter(
      (message) =>
        message.metadata &&
        Object.hasOwn(message.metadata, 'tanstack:subagentHost'),
    )
    expect(marked).toEqual([
      {
        ...replacement,
        metadata: {
          audit: 'client',
          tanstack: { runId: 'run-1' },
          'tanstack:subagentHost': { version: 1, runId: 'run-1' },
        },
      },
    ])
    expect(JSON.stringify(incoming)).toBe(before)
  })

  it.each([false, true])(
    'gives the streaming recorder an unused host ID with missing ID %s',
    async (missingId) => {
      const { stores } = memoryPersistence()
      const ordinary: ModelMessage = {
        id: 'assistant:run-1',
        role: 'assistant',
        content: 'Ordinary reply.',
        metadata: { audit: 'ordinary' },
      }
      const occupiedSuffix: ModelMessage = {
        id: 'assistant:run-1:1',
        role: 'assistant',
        content: 'Another ordinary reply.',
      }
      const metadata = {
        tanstack: { runId: 'run-1', responseId: 'original-response' },
        'tanstack:subagentHost': { version: 1, runId: 'run-1' },
        audit: 'host',
      }
      const host: ModelMessage = {
        ...(!missingId ? { id: ordinary.id } : {}),
        role: 'assistant',
        content: 'Old notes.',
        metadata,
      }
      await stores.messages.saveThread('desk', [ordinary, occupiedSuffix, host])
      const recorder = createSubagentRunRecorder({
        messages: stores.messages,
        ...(stores.runs ? { runs: stores.runs } : {}),
        intervalMs: 0,
      })
      await recorder.chunk({
        threadId: 'desk',
        runId: 'run-1',
        chunk: {
          type: EventType.SUBAGENT_STARTED,
          subagentRunId: 'child',
          name: 'writer',
          timestamp: t,
        },
      })
      await recorder.chunk({
        threadId: 'desk',
        runId: 'run-1',
        chunk: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          subagentRunId: 'child',
          messageId: 'notes',
          delta: 'New notes.',
          timestamp: t,
        },
      })
      const saved = await stores.messages.loadThread('desk')
      expect(saved.filter((message) => message.id === ordinary.id)).toEqual([
        ordinary,
      ])
      expect(
        saved.filter((message) => message.id === occupiedSuffix.id),
      ).toEqual([occupiedSuffix])
      const marked = saved.filter(
        (message) =>
          message.metadata &&
          Object.hasOwn(message.metadata, 'tanstack:subagentHost'),
      )
      expect(marked).toHaveLength(1)
      expect(marked[0]).toMatchObject({
        id: 'assistant:run-1:2',
        content: 'writer:\nNew notes.',
        metadata,
      })
      expect(new Set(saved.map((message) => message.id)).size).toBe(
        saved.length,
      )
    },
  )

  it('gives an explicitly duplicated host ID an unused ID in public chat', async () => {
    const ordinary: ModelMessage = {
      id: 'assistant:run-1',
      role: 'assistant',
      content: 'Ordinary reply.',
    }
    const occupiedSuffix: ModelMessage = {
      id: 'assistant:run-1:1',
      role: 'assistant',
      content: 'Another ordinary reply.',
    }
    const host: ModelMessage = {
      id: ordinary.id,
      role: 'assistant',
      content: 'Old child notes.',
      metadata: {
        tanstack: { runId: 'run-1' },
        'tanstack:subagentHost': { version: 1, runId: 'run-1' },
      },
    }
    const observed: Array<ModelMessage> = []
    const main: AnyTextAdapter = {
      ...scriptedAdapter([]),
      chatStream(options) {
        observed.push(...options.messages)
        return (async function* () {
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'main',
            delta: 'Done.',
            timestamp: t,
          }
        })()
      },
    }
    const child = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: async function* () {
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'note',
          delta: 'New notes.',
          timestamp: t,
        }
      },
    })
    await collect(
      chat({
        adapter: main,
        threadId: 'desk',
        runId: 'run-1',
        messages: [
          { id: 'user', role: 'user', content: 'Research' },
          ordinary,
          occupiedSuffix,
          host,
        ],
        subagents: {
          agents: [child],
          router: () => 'writer',
          strategy: 'handoff',
        },
      }),
    )
    expect(observed.filter((message) => message.id === ordinary.id)).toEqual([
      ordinary,
    ])
    expect(
      observed.filter((message) => message.id === occupiedSuffix.id),
    ).toEqual([occupiedSuffix])
    const marked = observed.filter(
      (message) =>
        message.metadata &&
        Object.hasOwn(message.metadata, 'tanstack:subagentHost'),
    )
    expect(marked).toHaveLength(1)
    expect(marked[0]?.id).toBe('assistant:run-1:2')
    expect(marked[0]?.content).toBe('New notes.')
    expect(new Set(observed.map((message) => message.id)).size).toBe(
      observed.length,
    )
  })

  it.each([false, true])(
    'preserves host metadata and collision safety with missing ID %s',
    async (missingId) => {
      const persistence = memoryPersistence()
      const metadata = {
        tanstack: {
          runId: 'run-1',
          source: {
            provider: 'anthropic',
            api: 'anthropic-messages',
            model: 'requested-model',
          },
          responseId: 'genuine-response',
        },
        'tanstack:subagentHost': { version: 1, runId: 'run-1' },
        audit: 'keep-me',
      }
      const host: ModelMessage = {
        ...(!missingId ? { id: 'marked-host' } : {}),
        role: 'assistant',
        content: 'Old notes',
        metadata,
      }
      const ordinary: ModelMessage = {
        id: 'assistant:run-1',
        role: 'assistant',
        content: 'Ordinary before.',
        metadata: { tanstack: { runId: 'run-1' } },
      }
      const child = defineAgent({
        name: 'writer',
        description: 'Writes notes',
        run: async function* () {
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'note',
            delta: 'Notes',
            timestamp: t,
          }
        },
      })
      const main = scriptedAdapter([
        [
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'main',
            delta: 'All clean.',
            timestamp: t,
          },
        ],
      ])
      await collect(
        chat({
          adapter: main,
          threadId: 'desk',
          runId: 'run-1',
          messages: [
            { id: 'u1', role: 'user', content: 'Research' },
            ordinary,
            host,
          ],
          middleware: [withPersistence(persistence)],
          subagents: {
            agents: [child],
            router: () => 'writer',
            strategy: 'handoff',
          },
        }),
      )
      const saved = await persistence.stores.messages.loadThread('desk')
      expect(saved.find((message) => message.id === ordinary.id)).toEqual(
        ordinary,
      )
      const marked = saved.filter(
        (message) =>
          message.metadata &&
          Object.hasOwn(message.metadata, 'tanstack:subagentHost'),
      )
      expect(marked).toHaveLength(1)
      expect(marked[0]?.metadata).toEqual(metadata)
      expect(marked[0]?.id).not.toBe(ordinary.id)
      expect(metadata.audit).toBe('keep-me')
    },
  )
})
