import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import { fromSpecTokenUsage } from '../src/utilities/ag-ui-usage'
import { tanstackMetadata } from '../src/utilities/merge-metadata'
import { INTERRUPT_BINDING_METADATA_KEY } from '../src/interrupt-resume'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { SubagentRunContext } from '../src/activities/chat/agents/define-agent'
import type {
  ModelMessage,
  StreamChunk,
  SubagentPart,
  UIMessage,
} from '../src/types'

const user: UIMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', content: 'Clean up' }],
}

/** A child that asks approval to delete a file, then reports. */
function cleanerAgent({ needsApproval = true } = {}) {
  const execute = vi.fn().mockReturnValue({ deleted: true })
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted('c1'),
        ev.toolStart('call_c', 'deleteFile'),
        ev.toolArgs('call_c', '{"path":"a"}'),
        ev.runFinished('tool_calls', 'c1', {
          promptTokens: 3,
          completionTokens: 2,
          totalTokens: 5,
          cost: 0.25,
        }),
      ],
      [
        ev.runStarted('c2'),
        ev.textStart('child-done'),
        ev.textContent('Deleted a', 'child-done'),
        ev.textEnd('child-done'),
        ev.runFinished('stop', 'c2', {
          promptTokens: 4,
          completionTokens: 1,
          totalTokens: 5,
        }),
      ],
    ],
  })
  const contexts: Array<SubagentRunContext> = []
  const agent = defineAgent({
    name: 'cleaner',
    description: 'Deletes files',
    run: (ctx) => {
      contexts.push(ctx)
      return chat({
        adapter,
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        subagentRunId: ctx.subagentRunId,
        resume: ctx.resume,
        tools: [{ ...serverTool('deleteFile', execute), needsApproval }],
      })
    },
  })
  return { agent, execute, contexts }
}

function cardOf(messages: ReadonlyArray<UIMessage>): SubagentPart {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'subagent') return part
    }
  }
  throw new Error('no subagent card')
}

function replay(processor: StreamProcessor, chunks: Array<StreamChunk>) {
  for (const chunk of chunks) processor.processChunk(chunk)
}

/** What a browser sends back: the wire messages as parsed JSON. */
function requestMessages(messages: Array<UIMessage>): Array<ModelMessage> {
  return JSON.parse(JSON.stringify(uiMessagesToWire(messages)))
}

describe('subagent interrupts', () => {
  it('suspends a routed child, then resumes the same child', async () => {
    const { agent, execute, contexts } = cleanerAgent()
    const parent = createMockAdapter({ iterations: [] }).adapter
    const router = vi.fn(() => 'cleaner')
    const subagents = { agents: [agent], router }

    const first = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-1',
        messages: [user],
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )

    const suspended = first.find(
      (chunk) => chunk.type === EventType.SUBAGENT_FINISHED,
    )
    expect(suspended).toMatchObject({
      outcome: { type: 'suspended', interruptIds: ['approval_call_c'] },
    })
    const subagentRunId =
      suspended?.type === EventType.SUBAGENT_FINISHED
        ? suspended.subagentRunId
        : ''
    const terminal = first.at(-1)
    expect(terminal?.type).toBe(EventType.RUN_FINISHED)
    const interrupt =
      terminal?.type === EventType.RUN_FINISHED &&
      terminal.outcome?.type === 'interrupt'
        ? terminal.outcome.interrupts[0]
        : undefined
    expect(interrupt).toMatchObject({
      id: 'approval_call_c',
      toolCallId: 'call_c',
      subagentRunId,
    })
    // The client resumes the parent run, so the binding names that run.
    expect(interrupt?.metadata?.[INTERRUPT_BINDING_METADATA_KEY]).toMatchObject(
      { interruptedRunId: 'run-1' },
    )
    // Child usage reaches the parent run, cost included.
    expect(
      fromSpecTokenUsage(
        terminal?.type === EventType.RUN_FINISHED &&
          Array.isArray(terminal.usage)
          ? terminal.usage
          : undefined,
        terminal ? tanstackMetadata(terminal)?.usage : undefined,
      ),
    ).toMatchObject({
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5,
      cost: 0.25,
    })
    // The router plan rides on the child's start event.
    expect(
      first.find((chunk) => chunk.type === EventType.SUBAGENT_STARTED),
    ).toMatchObject({
      metadata: {
        tanstack: { subagentPlan: { steps: [{ names: ['cleaner'] }] } },
      },
    })
    expect(execute).not.toHaveBeenCalled()

    const processor = new StreamProcessor({ initialMessages: [user] })
    replay(processor, first)
    const card = cardOf(processor.getMessages())
    expect(card.subagent).toMatchObject({
      id: subagentRunId,
      status: 'suspended',
      interruptIds: ['approval_call_c'],
    })
    // The child's tool call is on the card, not on the parent message.
    expect(card.subagent.messages[0]?.parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-call',
        id: 'call_c',
        state: 'approval-requested',
      }),
    )
    expect(
      processor
        .getMessages()
        .flatMap((message) => message.parts)
        .some((part) => part.type === 'tool-call'),
    ).toBe(false)

    processor.addToolApprovalResponse('approval_call_c', true)
    const second = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-2',
        parentRunId: 'run-1',
        messages: requestMessages(processor.getMessages()),
        resume: [
          { interruptId: 'approval_call_c', status: 'resolved', payload: true },
        ],
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )

    expect(second.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(contexts[1]).toMatchObject({
      subagentRunId,
      parentRunId: 'run-1',
      resume: [{ interruptId: 'approval_call_c' }],
    })
    expect(execute).toHaveBeenCalledWith({ path: 'a' }, expect.anything())
    expect(router).toHaveBeenCalledTimes(1)
    expect(second.at(-1)).toMatchObject({ type: EventType.RUN_FINISHED })
    expect(second.at(-1)).not.toHaveProperty('outcome.type', 'interrupt')

    replay(processor, second)
    const resumed = cardOf(processor.getMessages())
    expect(resumed.subagent.status).toBe('finished')
    const childParts = resumed.subagent.messages.flatMap(
      (message) => message.parts,
    )
    expect(childParts).toContainEqual(
      expect.objectContaining({ type: 'tool-result', toolCallId: 'call_c' }),
    )
    expect(childParts).toContainEqual({ type: 'text', content: 'Deleted a' })
  })

  it('rejects a child resume that has no parentRunId', async () => {
    const { agent, execute } = cleanerAgent()
    const parent = createMockAdapter({ iterations: [] }).adapter
    const subagents = { agents: [agent], router: () => 'cleaner' }
    const first = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-1',
        messages: [user],
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )
    const processor = new StreamProcessor({ initialMessages: [user] })
    replay(processor, first)
    processor.addToolApprovalResponse('approval_call_c', true)

    // Without the interrupted run id the child would start over and drop
    // the answer. Fail instead.
    await expect(
      collectChunks(
        chat({
          adapter: parent,
          threadId: 't',
          runId: 'run-2',
          messages: requestMessages(processor.getMessages()),
          resume: [
            {
              interruptId: 'approval_call_c',
              status: 'resolved',
              payload: true,
            },
          ],
          subagents,
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/parentRunId/)
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects a resume whose saved plan names an unknown agent', async () => {
    const { agent, execute } = cleanerAgent()
    const parent = createMockAdapter({ iterations: [] }).adapter
    const router = vi.fn(() => 'cleaner')
    const subagents = { agents: [agent], router }
    const first = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-1',
        messages: [user],
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )
    const processor = new StreamProcessor({ initialMessages: [user] })
    replay(processor, first)
    processor.addToolApprovalResponse('approval_call_c', true)
    // A client sends back a plan for an agent this chat no longer has.
    cardOf(processor.getMessages()).subagent.metadata = {
      tanstack: { subagentPlan: { steps: [{ names: ['gone'] }] } },
    }

    await expect(
      collectChunks(
        chat({
          adapter: parent,
          threadId: 't',
          runId: 'run-2',
          parentRunId: 'run-1',
          messages: requestMessages(processor.getMessages()),
          resume: [
            {
              interruptId: 'approval_call_c',
              status: 'resolved',
              payload: true,
            },
          ],
          subagents,
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(/saved subagent plan/)
    // The router did not silently run again, and the child did not restart.
    expect(router).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it('puts subagentRunId on the child middleware context', async () => {
    const seen: Array<string | undefined> = []
    const child = defineAgent({
      name: 'noter',
      description: 'Notes its own id',
      run: (ctx) =>
        chat({
          adapter: createMockAdapter({
            iterations: [[ev.runStarted('n1'), ev.runFinished('stop', 'n1')]],
          }).adapter,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
          parentRunId: ctx.parentRunId,
          subagentRunId: ctx.subagentRunId,
          middleware: [
            {
              name: 'note',
              onStart: (mctx) => {
                seen.push(mctx.subagentRunId)
              },
            },
          ],
        }),
    })
    const parent = createMockAdapter({ iterations: [] }).adapter
    const chunks = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-1',
        messages: [user],
        subagents: { agents: [child], router: () => 'noter' },
      }) as AsyncIterable<StreamChunk>,
    )
    const started = chunks.find(
      (chunk) => chunk.type === EventType.SUBAGENT_STARTED,
    )
    const id =
      started?.type === EventType.SUBAGENT_STARTED
        ? started.subagentRunId
        : undefined
    expect(id).toBeDefined()
    expect(seen).toEqual([id])
  })

  it('adds every model call of a child to the parent usage', async () => {
    const { agent } = cleanerAgent({ needsApproval: false })
    const parent = createMockAdapter({ iterations: [] }).adapter
    const chunks = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-1',
        messages: [user],
        subagents: { agents: [agent], router: () => 'cleaner' },
      }) as AsyncIterable<StreamChunk>,
    )
    const terminal = chunks.at(-1)
    expect(terminal).toMatchObject({ type: EventType.RUN_FINISHED })
    // The child made two model calls: the tool call and the reply.
    expect(
      fromSpecTokenUsage(
        terminal?.type === EventType.RUN_FINISHED &&
          Array.isArray(terminal.usage)
          ? terminal.usage
          : undefined,
        terminal ? tanstackMetadata(terminal)?.usage : undefined,
      ),
    ).toMatchObject({
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10,
      cost: 0.25,
    })
  })

  it('suspends a child that a tool call started, then resumes it', async () => {
    const { agent, execute, contexts } = cleanerAgent()
    const { adapter: parent } = createMockAdapter({
      iterations: [
        [
          ev.runStarted('p1'),
          ev.textStart('parent-note'),
          ev.textContent('Checking the disk first', 'parent-note'),
          ev.textEnd('parent-note'),
          ev.toolStart('call_p', 'cleaner'),
          ev.toolArgs('call_p', '{}'),
          ev.runFinished('tool_calls', 'p1'),
        ],
        [
          ev.runStarted('p2'),
          ev.textStart('parent-done'),
          ev.textContent('All clean', 'parent-done'),
          ev.textEnd('parent-done'),
          ev.runFinished('stop', 'p2'),
        ],
      ],
    })
    const subagents = { agents: [agent] }

    const first = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-1',
        messages: [user],
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )
    const terminal = first.at(-1)
    expect(terminal).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: {
        type: 'interrupt',
        interrupts: [expect.objectContaining({ id: 'approval_call_c' })],
      },
    })
    // The child reads the conversation as it is at the call, without the
    // open tool call that started it.
    const childMessages = contexts[0]?.messages ?? []
    expect(childMessages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Checking the disk first',
    })
    expect(childMessages.at(-1)).not.toHaveProperty('toolCalls')

    // The child's chunks stream before the parent run ends.
    const started = first.findIndex(
      (chunk) => chunk.type === EventType.SUBAGENT_STARTED,
    )
    expect(first[started]).toMatchObject({ parentToolCallId: 'call_p' })
    expect(started).toBeLessThan(first.length - 1)

    const processor = new StreamProcessor({ initialMessages: [user] })
    replay(processor, first)
    expect(cardOf(processor.getMessages()).subagent).toMatchObject({
      status: 'suspended',
      parentToolCallId: 'call_p',
    })

    processor.addToolApprovalResponse('approval_call_c', true)
    const second = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-2',
        parentRunId: 'run-1',
        messages: requestMessages(processor.getMessages()),
        resume: [
          { interruptId: 'approval_call_c', status: 'resolved', payload: true },
        ],
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )

    expect(second.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(contexts[1]).toMatchObject({ parentRunId: 'run-1' })
    expect(execute).toHaveBeenCalledTimes(1)
    const toolResult = second.find(
      (chunk) =>
        chunk.type === EventType.TOOL_CALL_RESULT &&
        chunk.toolCallId === 'call_p',
    )
    expect(toolResult).toBeDefined()
    expect(second.at(-1)).toMatchObject({ type: EventType.RUN_FINISHED })
    expect(second.at(-1)).not.toHaveProperty('outcome.type', 'interrupt')
  })
})

describe('subagent cards', () => {
  it('keeps reasoning, tool calls, results, and nested children on the card', () => {
    const processor = new StreamProcessor()
    const t = Date.now()
    const chunks: Array<StreamChunk> = [
      { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: t },
      {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 's1',
        name: 'researcher',
        timestamp: t,
      },
      {
        type: EventType.REASONING_START,
        messageId: 'think-1',
        subagentRunId: 's1',
        timestamp: t,
      },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'think-1',
        role: 'reasoning',
        subagentRunId: 's1',
        timestamp: t,
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'think-1',
        delta: 'Look it up',
        subagentRunId: 's1',
        timestamp: t,
      },
      {
        type: EventType.REASONING_MESSAGE_END,
        messageId: 'think-1',
        subagentRunId: 's1',
        timestamp: t,
      },
      {
        type: EventType.REASONING_END,
        messageId: 'think-1',
        subagentRunId: 's1',
        timestamp: t,
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'tc',
        toolCallName: 'search',
        toolName: 'search',
        subagentRunId: 's1',
        timestamp: t,
      },
      // A later tool event can omit subagentRunId. It follows its start.
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'tc',
        delta: '{}',
        timestamp: t,
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: 'tc',
        subagentRunId: 's1',
        timestamp: t,
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'tc',
        messageId: 'tr',
        content: '{"hits":1}',
        subagentRunId: 's1',
        timestamp: t,
      },
      {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 's2',
        name: 'fetcher',
        parentSubagentRunId: 's1',
        timestamp: t,
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'g1',
        role: 'assistant',
        subagentRunId: 's2',
        timestamp: t,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'g1',
        delta: 'page text',
        subagentRunId: 's2',
        timestamp: t,
      },
      { type: EventType.SUBAGENT_FINISHED, subagentRunId: 's2', timestamp: t },
      { type: EventType.SUBAGENT_FINISHED, subagentRunId: 's1', timestamp: t },
    ]
    replay(processor, chunks)

    const messages = processor.getMessages()
    expect(messages).toHaveLength(1)
    // Nothing from the child lands on the parent message.
    expect(messages[0]?.parts.map((part) => part.type)).toEqual(['subagent'])
    const card = cardOf(messages)
    const parts = card.subagent.messages.flatMap((message) => message.parts)
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'thinking', content: 'Look it up' }),
    )
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'tool-call', id: 'tc', name: 'search' }),
    )
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'tool-result', toolCallId: 'tc' }),
    )
    const nested = parts.find((part) => part.type === 'subagent')
    expect(nested).toMatchObject({
      subagent: { id: 's2', name: 'fetcher', status: 'finished' },
    })
    expect(
      nested?.type === 'subagent'
        ? nested.subagent.messages[0]?.parts
        : undefined,
    ).toEqual([{ type: 'text', content: 'page text' }])

    // The wire keeps the whole card, and a snapshot rebuilds it.
    const restored = new StreamProcessor()
    restored.processChunk({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: JSON.parse(JSON.stringify(uiMessagesToWire(messages))),
      timestamp: t,
    })
    const again = cardOf(restored.getMessages())
    expect(again.subagent).toMatchObject({ id: 's1', status: 'finished' })
    const againParts = again.subagent.messages.flatMap(
      (message) => message.parts,
    )
    expect(againParts).toContainEqual(
      expect.objectContaining({ type: 'thinking', content: 'Look it up' }),
    )
    expect(againParts).toContainEqual(
      expect.objectContaining({ type: 'tool-call', id: 'tc' }),
    )
    expect(againParts).toContainEqual(
      expect.objectContaining({
        type: 'subagent',
        subagent: expect.objectContaining({ id: 's2' }),
      }),
    )
  })
})
