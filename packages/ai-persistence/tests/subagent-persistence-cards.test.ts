import { describe, expect, it, vi } from 'vitest'
import { EventType, chat, defineAgent, uiMessagesToWire } from '@tanstack/ai'
import type {
  AnyTextAdapter,
  ChatMiddleware,
  DefinedAgent,
  ModelMessage,
  StreamChunk,
  SubagentPart,
  UIMessage,
} from '@tanstack/ai'
import { memoryPersistence, reconstructChat, withPersistence } from '../src'
import { createSubagentRunRecorder } from '../src/subagent-runs'
import type { SessionIndexStore } from '../src'

const t = 1

/** A model that plays one script per call. */
function scriptedAdapter(scripts: Array<Array<StreamChunk>>) {
  let call = 0
  return {
    kind: 'text',
    name: 'scripted',
    model: 'test-model',
    '~types': {
      providerOptions: undefined,
      inputModalities: undefined,
      messageMetadataByModality: undefined,
      toolCapabilities: undefined,
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    chatStream: () => {
      const script = scripts[call++]
      if (!script) throw new Error('no script for this model call')
      return (async function* () {
        await Promise.resolve()
        yield* script
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } satisfies AnyTextAdapter
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
  ])
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

/** One text message, start to end. */
function textMessage(
  messageId: string,
  text: string,
  ids: { subagentRunId?: string } = {},
) {
  return [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      ...ids,
      timestamp: t,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: text,
      ...ids,
      timestamp: t,
    },
    { type: EventType.TEXT_MESSAGE_END, messageId, ...ids, timestamp: t },
  ] satisfies Array<StreamChunk>
}

/** A child start, as the parent stream carries it. */
function childStarted(
  subagentRunId: string,
  links: { parentToolCallId?: string; parentSubagentRunId?: string },
) {
  return {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId,
    name: 'writer',
    ...links,
    timestamp: t,
  } satisfies StreamChunk
}

/**
 * `store`, where another host runs `write` between the read and the write of
 * the first `times` compare-and-set writes.
 */
function racingSessions(
  store: SessionIndexStore,
  write: () => Promise<void>,
  times: number,
) {
  let raced = 0
  return {
    get: (key) => store.get(key),
    getVersioned: (key) => store.getVersioned(key),
    upsert: (entry) => store.upsert(entry),
    upsertIf: async (input) => {
      if (raced < times) {
        raced += 1
        await write()
      }
      return store.upsertIf(input)
    },
    list: (options) => store.list(options),
    delete: (key) => store.delete(key),
  } satisfies SessionIndexStore
}

/** Feed one parent run's chunks on thread `desk` to a recorder. */
async function feed(
  recorder: ReturnType<typeof createSubagentRunRecorder>,
  runId: string,
  chunks: ReadonlyArray<StreamChunk>,
) {
  for (const chunk of chunks) {
    await recorder.chunk({ threadId: 'desk', runId, chunk })
  }
}

/** A child that writes one note per call and keeps the messages it saw. */
function noteTaker() {
  const seen: Array<ReadonlyArray<UIMessage | ModelMessage>> = []
  const agent = defineAgent({
    name: 'writer',
    description: 'Writes notes',
    run: async function* (ctx) {
      seen.push(ctx.messages)
      yield* textMessage(`note-${seen.length}`, `Note ${seen.length}`)
    },
  })
  return { agent, seen }
}

/** A parent model that calls the `writer` agent tool once, then stops. */
function callingSubagent(toolCallId: string, args: object) {
  return scriptedAdapter([
    [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: 'writer',
        timestamp: t,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: JSON.stringify(args),
        timestamp: t,
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'model',
        threadId: 'desk',
        finishReason: 'tool_calls',
        timestamp: t,
      },
    ],
    [
      {
        type: EventType.RUN_FINISHED,
        runId: 'model',
        threadId: 'desk',
        finishReason: 'stop',
        timestamp: t,
      },
    ],
  ])
}

/** One parent turn that calls the `writer` tool. The thread is `desk`. */
function subagentTurn(
  middleware: ChatMiddleware,
  agent: DefinedAgent,
  turn: { runId: string; toolCallId: string; args: object; threadId?: string },
) {
  return collect(
    chat({
      adapter: callingSubagent(turn.toolCallId, turn.args),
      threadId: turn.threadId ?? 'desk',
      runId: turn.runId,
      messages: [{ id: `u-${turn.runId}`, role: 'user', content: 'Notes' }],
      middleware: [middleware],
      subagents: { agents: [agent] },
    }),
  )
}

/** The id of the first child a run started. */
function startedId(chunks: ReadonlyArray<StreamChunk>) {
  const started = chunks.find(
    (chunk) => chunk.type === EventType.SUBAGENT_STARTED,
  )
  if (started?.type !== EventType.SUBAGENT_STARTED) {
    throw new Error('no child started')
  }
  return started.subagentRunId
}

/** The parsed result of one tool call. */
function toolResult(chunks: ReadonlyArray<StreamChunk>, toolCallId: string) {
  const result = chunks.find(
    (chunk) =>
      chunk.type === EventType.TOOL_CALL_RESULT &&
      chunk.toolCallId === toolCallId,
  )
  if (
    result?.type !== EventType.TOOL_CALL_RESULT ||
    typeof result.content !== 'string'
  ) {
    throw new Error(`no text result for ${toolCallId}`)
  }
  return JSON.parse(result.content)
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

  /** Start one child, end it with this error, then end the parent run. */
  async function settleChild(
    error: { message: string; code?: string },
    end: 'finish' | 'abort',
  ) {
    const persistence = memoryPersistence()
    const { messages, runs } = persistence.stores
    if (!messages || !runs) throw new Error('memory store has messages')
    const recorder = createSubagentRunRecorder({
      messages,
      runs,
      intervalMs: 0,
    })
    const base = { threadId: 'desk', runId: 'parent-run' }
    await recorder.start({
      ...base,
      messages: [{ role: 'user', content: 'Research this' }],
    })
    await recorder.chunk({
      ...base,
      chunk: {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 'child-run',
        name: 'researcher',
        timestamp: t,
      },
    })
    await recorder.chunk({
      ...base,
      chunk: {
        type: EventType.SUBAGENT_ERROR,
        subagentRunId: 'child-run',
        ...error,
        timestamp: t,
      },
    })
    await recorder[end](base)
    return cardOf((await loadDesk(persistence)).messages).subagent
  }

  it('keeps the error of a stopped child after a reload', async () => {
    const child = await settleChild({ message: 'Stopped' }, 'abort')
    expect(child.status).toBe('error')
    expect(child.error).toEqual({ message: 'Stopped' })
  })

  it('keeps the error code of a failed child after a reload', async () => {
    const child = await settleChild(
      { message: 'Provider failed', code: 'provider_error' },
      'finish',
    )
    expect(child.status).toBe('error')
    expect(child.error).toEqual({
      message: 'Provider failed',
      code: 'provider_error',
    })
  })

  it('gives a nested child to the child that started it', async () => {
    const { stores } = memoryPersistence()
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      sessions: stores.sessions,
      intervalMs: 0,
    })
    await feed(recorder, 'run-1', [
      childStarted('outer', { parentToolCallId: 'call_1' }),
      childStarted('inner', {
        parentSubagentRunId: 'outer',
        parentToolCallId: 'call_n',
      }),
      ...textMessage('m1', 'Inner notes', { subagentRunId: 'inner' }),
    ])

    expect(
      await stores.sessions.get({ threadId: 'subagent:inner' }),
    ).toMatchObject({
      parentThreadId: 'subagent:outer',
      parentToolCallId: 'call_n',
    })
    // The outer child's chat can continue it. The top thread cannot.
    const fromOuter = { threadId: 'desk:writer', subagentRunId: 'outer' }
    expect((await recorder.loadChild('inner', fromOuter))?.messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'Inner notes' }),
    ])
    expect(
      await recorder.loadChild('inner', { threadId: 'desk' }),
    ).toBeUndefined()
  })

  it('writes each child in the tenant of the recorder, with no members', async () => {
    const { stores } = memoryPersistence()
    await stores.sessions.upsert({
      tenantId: 'org-1',
      threadId: 'desk',
      members: [{ userId: 'alice', role: 'owner' }],
      createdAt: t,
      updatedAt: t,
    })
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      sessions: stores.sessions,
      tenantId: 'org-1',
      intervalMs: 0,
    })
    await feed(recorder, 'run-1', [
      childStarted('outer', { parentToolCallId: 'call_1' }),
      childStarted('inner', {
        parentSubagentRunId: 'outer',
        parentToolCallId: 'call_n',
      }),
    ])

    const children = await Promise.all(
      ['subagent:outer', 'subagent:inner'].map((threadId) =>
        stores.sessions.get({ tenantId: 'org-1', threadId }),
      ),
    )
    // No members: access to a child goes through its top-level thread.
    const child = { tenantId: 'org-1', members: [] }
    expect(children).toEqual([
      expect.objectContaining(child),
      expect.objectContaining(child),
    ])
    // Nothing went to the default tenant.
    expect(await stores.sessions.list()).toEqual({ entries: [] })
  })

  it('keeps a change that another host makes to a child entry while it writes', async () => {
    const { stores } = memoryPersistence()
    const named = {
      threadId: 'subagent:child',
      members: [],
      title: 'Named elsewhere',
      createdAt: 5,
      updatedAt: 5,
    }
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      sessions: racingSessions(
        stores.sessions,
        () => stores.sessions.upsert(named),
        1,
      ),
      intervalMs: 0,
    })

    await feed(recorder, 'run-1', [
      childStarted('child', { parentToolCallId: 'call_1' }),
    ])

    expect(await stores.sessions.get({ threadId: 'subagent:child' })).toEqual({
      ...named,
      parentThreadId: 'desk',
      parentToolCallId: 'call_1',
      updatedAt: expect.any(Number),
    })
  })

  it('warns and goes on when another host changes a child entry on every try', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { stores } = memoryPersistence()
      let writes = 0
      const elsewhere = () =>
        stores.sessions.upsert({
          threadId: 'subagent:child',
          members: [],
          createdAt: 5,
          updatedAt: (writes += 1),
        })
      const recorder = createSubagentRunRecorder({
        messages: stores.messages,
        sessions: racingSessions(stores.sessions, elsewhere, 5),
        intervalMs: 0,
      })

      await feed(recorder, 'run-1', [
        childStarted('child', { parentToolCallId: 'call_1' }),
      ])

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('changed on another host 5 times'),
      )
      // The recorder wrote nothing over the other host's entry.
      expect(await stores.sessions.get({ threadId: 'subagent:child' })).toEqual(
        {
          threadId: 'subagent:child',
          members: [],
          createdAt: 5,
          updatedAt: 5,
        },
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('loads a waiting continued child without the messages of the call it waits in', async () => {
    const { stores } = memoryPersistence()
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      runs: stores.runs,
      intervalMs: 0,
    })
    const waiting = {
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: 'child',
      outcome: { type: 'suspended', interruptIds: ['approval'] },
      timestamp: t,
    } satisfies StreamChunk
    const old = [{ role: 'assistant', content: 'Old notes' }]
    await feed(recorder, 'run-1', [
      childStarted('child', { parentToolCallId: 'call_1' }),
      ...textMessage('m1', 'Old notes', { subagentRunId: 'child' }),
      {
        type: EventType.SUBAGENT_FINISHED,
        subagentRunId: 'child',
        timestamp: t,
      },
    ])

    // run-2 continues the child. It writes, then waits for an approval. The
    // resume brings those newer messages itself.
    await feed(recorder, 'run-2', [
      childStarted('child', { parentToolCallId: 'call_2' }),
      ...textMessage('m2', 'Delete a?', { subagentRunId: 'child' }),
      waiting,
    ])
    const desk = { threadId: 'desk' }
    expect((await recorder.loadChild('child', desk))?.messages).toMatchObject(
      old,
    )

    // run-3 resumes that call, and the child waits again.
    await feed(recorder, 'run-3', [
      childStarted('child', { parentToolCallId: 'call_2' }),
      ...textMessage('m3', 'Delete b?', { subagentRunId: 'child' }),
      waiting,
    ])
    expect((await recorder.loadChild('child', desk))?.messages).toMatchObject(
      old,
    )
  })

  it('starts a loaded child with the task of its first call, and names its agent', async () => {
    const { stores } = memoryPersistence()
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      intervalMs: 0,
    })
    await feed(recorder, 'run-1', [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call_1',
        toolCallName: 'writer',
        timestamp: t,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call_1',
        delta: '{"topic":"tides"}',
        timestamp: t,
      },
      // Core puts the checked input of an agent with inputSchema on the card.
      {
        ...childStarted('child', { parentToolCallId: 'call_1' }),
        metadata: { tanstack: { subagentInput: { topic: 'tides' } } },
      },
      ...textMessage('m1', 'Tide notes', { subagentRunId: 'child' }),
    ])

    const loaded = await recorder.loadChild('child', { threadId: 'desk' })
    expect(loaded?.messages).toMatchObject([
      { role: 'user', content: '{"topic":"tides"}' },
      { role: 'assistant', content: 'Tide notes' },
    ])
    // Only this agent can continue the child.
    expect(loaded?.agent).toBe('writer')
  })

  it('stores the input of an agent whose schema has a prompt field as JSON', async () => {
    const { stores } = memoryPersistence()
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      intervalMs: 0,
    })
    await feed(recorder, 'run-1', [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call_1',
        toolCallName: 'writer',
        timestamp: t,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call_1',
        delta: '{"prompt":"a cat"}',
        timestamp: t,
      },
      {
        ...childStarted('child', { parentToolCallId: 'call_1' }),
        metadata: { tanstack: { subagentInput: { prompt: 'a cat' } } },
      },
      ...textMessage('m1', 'Cat image', { subagentRunId: 'child' }),
    ])

    const loaded = await recorder.loadChild('child', { threadId: 'desk' })
    // The child got `ctx.input`, not a user message with the text.
    expect(loaded?.messages[0]).toMatchObject({
      role: 'user',
      content: '{"prompt":"a cat"}',
    })
  })

  it('keeps stored messages when a suspended child has no base', async () => {
    const { stores } = memoryPersistence()
    await stores.messages.saveThread('subagent:child', [
      {
        id: 'm1',
        role: 'assistant',
        content: 'Old notes',
        metadata: {
          tanstack: { subagent: { name: 'writer', status: 'suspended' } },
          'tanstack:subagentChild': {
            parentThreadId: 'desk',
            prompt: 'Take notes',
          },
        },
      },
    ])
    const recorder = createSubagentRunRecorder({
      messages: stores.messages,
      intervalMs: 0,
    })
    await feed(recorder, 'run-2', [
      childStarted('child', { parentToolCallId: 'call_2' }),
      ...textMessage('m2', 'More notes', { subagentRunId: 'child' }),
      {
        type: EventType.SUBAGENT_FINISHED,
        subagentRunId: 'child',
        outcome: { type: 'suspended', interruptIds: ['approval'] },
        timestamp: t,
      },
    ])

    const loaded = await recorder.loadChild('child', { threadId: 'desk' })
    expect(loaded?.messages.map((message) => message.content)).toContain(
      'Old notes',
    )
  })

  it('loads nothing for an unknown child', async () => {
    const { stores } = memoryPersistence()
    const recorder = createSubagentRunRecorder({ messages: stores.messages })

    expect(
      await recorder.loadChild('missing', { threadId: 'desk' }),
    ).toBeUndefined()
  })
})

describe('agent tools with persistence', () => {
  it('writes one index entry per child and keeps fields others wrote', async () => {
    const persistence = memoryPersistence()
    const middleware = withPersistence(persistence)
    const sessions = persistence.stores.sessions
    const { agent } = noteTaker()
    const first = await subagentTurn(middleware, agent, {
      runId: 'run-1',
      toolCallId: 'call_1',
      args: { prompt: 'Take notes' },
    })
    const threadId = `subagent:${startedId(first)}`
    const entry = await sessions.get({ threadId })
    expect(entry).toEqual({
      threadId,
      members: [],
      parentThreadId: 'desk',
      parentToolCallId: 'call_1',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    if (!entry) throw new Error('no index entry')

    // Another writer names the session. A continue keeps the name.
    await sessions.upsert({ ...entry, title: 'Tide notes' })
    await subagentTurn(middleware, agent, {
      runId: 'run-2',
      toolCallId: 'call_2',
      args: { sessionId: startedId(first), prompt: 'More' },
    })
    expect(await sessions.get({ threadId })).toEqual({
      threadId,
      members: [],
      title: 'Tide notes',
      parentThreadId: 'desk',
      parentToolCallId: 'call_2',
      createdAt: entry.createdAt,
      updatedAt: expect.any(Number),
    })
  })

  it('gives a child entry the tenant and harness of its parent entry', async () => {
    const persistence = memoryPersistence()
    const sessions = persistence.stores.sessions
    await sessions.upsert({
      tenantId: 'org-1',
      threadId: 'desk',
      harness: 'notes/desk',
      members: [{ userId: 'alice', role: 'owner' }],
      createdAt: 1,
      updatedAt: 1,
    })
    const { agent } = noteTaker()
    const middleware = withPersistence(persistence, { tenantId: 'org-1' })
    const chunks = await subagentTurn(middleware, agent, {
      runId: 'run-1',
      toolCallId: 'call_1',
      args: { prompt: 'Take notes' },
    })

    const threadId = `subagent:${startedId(chunks)}`
    expect(await sessions.get({ tenantId: 'org-1', threadId })).toMatchObject({
      tenantId: 'org-1',
      harness: 'notes/desk',
      members: [],
    })
  })

  it('continues a stored child by sessionId', async () => {
    const middleware = withPersistence(memoryPersistence())
    const { agent, seen } = noteTaker()
    const first = await subagentTurn(middleware, agent, {
      runId: 'run-1',
      toolCallId: 'call_1',
      args: { prompt: 'Take notes' },
    })
    expect(toolResult(first, 'call_1')).toMatchObject({
      subagentRunId: startedId(first),
    })
    const second = await subagentTurn(middleware, agent, {
      runId: 'run-2',
      toolCallId: 'call_2',
      args: { sessionId: startedId(first), prompt: 'More' },
    })

    expect(startedId(second)).toBe(startedId(first))
    // The child starts from its first task and its stored transcript, then
    // the new prompt. The first message is a user message.
    expect(seen[1]).toMatchObject([
      { role: 'user', content: 'Take notes' },
      { role: 'assistant', content: 'Note 1' },
      { role: 'user', content: 'More' },
    ])

    // A third call also sees the prompt of the second call.
    await subagentTurn(middleware, agent, {
      runId: 'run-3',
      toolCallId: 'call_3',
      args: { sessionId: startedId(first), prompt: 'Again' },
    })
    expect(seen[2]).toMatchObject([
      { role: 'user', content: 'Take notes' },
      { role: 'assistant', content: 'Note 1' },
      { role: 'user', content: 'More' },
      { role: 'assistant', content: 'Note 2' },
      { role: 'user', content: 'Again' },
    ])
  })

  it('does not continue a child of another thread', async () => {
    const middleware = withPersistence(memoryPersistence())
    const { agent, seen } = noteTaker()
    const first = await subagentTurn(middleware, agent, {
      runId: 'run-1',
      toolCallId: 'call_1',
      args: { prompt: 'Take notes' },
    })
    const id = startedId(first)
    const other = await subagentTurn(middleware, agent, {
      threadId: 'other',
      runId: 'run-2',
      toolCallId: 'call_2',
      args: { sessionId: id, prompt: 'Show me' },
    })

    expect(toolResult(other, 'call_2')).toEqual({
      error: `Unknown sessionId "${id}".`,
    })
    expect(seen).toHaveLength(1)
  })
})
