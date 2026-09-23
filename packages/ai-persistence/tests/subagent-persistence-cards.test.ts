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
function cleaner(execute: (input: unknown) => unknown) {
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
  ] as Array<StreamChunk>)
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
        resume: ctx.resume,
        tools: [
          {
            name: 'deleteFile',
            description: 'Delete a file',
            needsApproval: true,
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
          subagents: { agents: [agent], router: () => 'cleaner' },
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
})
