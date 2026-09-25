import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import { fromSpecTokenUsage } from '../src/utilities/ag-ui-usage'
import { tanstackMetadata } from '../src/utilities/merge-metadata'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { SubagentRunContext } from '../src/activities/chat/agents/define-agent'
import type {
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
  SubagentPart,
  TokenUsage,
  UIMessage,
} from '../src/types'

const user: UIMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', content: 'Clean up' }],
}

/** A child that asks approval to delete a file, then reports. Two model
 *  calls with distinct token counts, so a double count shows in the sum. */
function approvalAgent(name: string, usage: [TokenUsage, TokenUsage]) {
  const execute = vi.fn().mockReturnValue({ deleted: true })
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted('c1'),
        ev.toolStart('call_c', 'deleteFile'),
        ev.toolArgs('call_c', '{"path":"a"}'),
        ev.runFinished('tool_calls', 'c1', usage[0]),
      ],
      [
        ev.runStarted('c2'),
        ev.textStart('child-done'),
        ev.textContent('Deleted a', 'child-done'),
        ev.textEnd('child-done'),
        ev.runFinished('stop', 'c2', usage[1]),
      ],
    ],
  })
  const contexts: Array<SubagentRunContext> = []
  const agent = defineAgent({
    name,
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
        tools: [{ ...serverTool('deleteFile', execute), needsApproval: true }],
      })
    },
  })
  return { agent, execute, contexts }
}

/** A child that answers with text in one model call. */
function textAgent(name: string, text: string, usage: TokenUsage) {
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted('r1'),
        ev.textStart('r-msg'),
        ev.textContent(text, 'r-msg'),
        ev.textEnd('r-msg'),
        ev.runFinished('stop', 'r1', usage),
      ],
    ],
  })
  const run = vi.fn((ctx: SubagentRunContext) =>
    chat({
      adapter,
      messages: ctx.messages,
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
    }),
  )
  return {
    agent: defineAgent({ name, description: 'Looks up facts', run }),
    run,
  }
}

const fetcherUsage: [TokenUsage, TokenUsage] = [
  { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
  { promptTokens: 7, completionTokens: 4, totalTokens: 11 },
]
const cleanerUsage: [TokenUsage, TokenUsage] = [
  { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
  { promptTokens: 70, completionTokens: 40, totalTokens: 110 },
]
const researcherUsage: TokenUsage = {
  promptTokens: 100,
  completionTokens: 200,
  totalTokens: 300,
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

function started(chunks: Array<StreamChunk>, name: string) {
  return chunks.filter(
    (chunk) => chunk.type === EventType.SUBAGENT_STARTED && chunk.name === name,
  )
}

function idOf(chunks: Array<StreamChunk>, name: string): string {
  const chunk = started(chunks, name)[0]
  if (chunk?.type !== EventType.SUBAGENT_STARTED) throw new Error(name)
  return chunk.subagentRunId
}

function finished(chunks: Array<StreamChunk>, subagentRunId: string) {
  return chunks.find(
    (chunk) =>
      chunk.type === EventType.SUBAGENT_FINISHED &&
      chunk.subagentRunId === subagentRunId,
  )
}

/** Full usage of a terminal, and how many model calls it lists. */
function usageOf(terminal: StreamChunk | undefined) {
  if (terminal?.type !== EventType.RUN_FINISHED) throw new Error('no terminal')
  const entries = Array.isArray(terminal.usage) ? terminal.usage : []
  return {
    calls: entries.length,
    total: fromSpecTokenUsage(entries, tanstackMetadata(terminal)?.usage),
  }
}

function interruptsOf(terminal: StreamChunk | undefined) {
  return terminal?.type === EventType.RUN_FINISHED &&
    terminal.outcome?.type === 'interrupt'
    ? terminal.outcome.interrupts
    : undefined
}

const resumeArgs = {
  threadId: 't',
  runId: 'run-2',
  parentRunId: 'run-1',
  resume: [
    { interruptId: 'approval_call_c', status: 'resolved', payload: true },
  ] satisfies Array<RunAgentResumeItem>,
}

describe('nested and parallel subagents', () => {
  it('nested child suspends and resumes through two levels', async () => {
    const fetcher = approvalAgent('fetcher', fetcherUsage)
    const researcherModel = createMockAdapter({
      iterations: [
        [
          ev.runStarted('r1'),
          ev.textStart('r-msg'),
          ev.textContent('Fetched and cleaned', 'r-msg'),
          ev.textEnd('r-msg'),
          ev.runFinished('stop', 'r1', researcherUsage),
        ],
      ],
    }).adapter
    // Handoff: the researcher model speaks after the fetcher finishes, so
    // the researcher has usage of its own.
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Fetches, then reports',
      run: (ctx) =>
        chat({
          adapter: researcherModel,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
          parentRunId: ctx.parentRunId,
          subagentRunId: ctx.subagentRunId,
          resume: ctx.resume,
          subagents: {
            agents: [fetcher.agent],
            router: () => 'fetcher',
            strategy: 'handoff',
          },
        }),
    })
    const parent = createMockAdapter({ iterations: [] }).adapter
    const subagents = { agents: [researcher], router: () => 'researcher' }

    const first = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-1',
        messages: [user],
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )

    const researcherId = idOf(first, 'researcher')
    const fetcherId = idOf(first, 'fetcher')
    expect(started(first, 'fetcher')[0]).toMatchObject({
      parentSubagentRunId: researcherId,
    })
    expect(finished(first, fetcherId)).toMatchObject({
      outcome: { type: 'suspended', interruptIds: ['approval_call_c'] },
    })
    const terminal = first.at(-1)
    expect(terminal?.type).toBe(EventType.RUN_FINISHED)
    expect(interruptsOf(terminal)).toEqual([
      expect.objectContaining({
        id: 'approval_call_c',
        toolCallId: 'call_c',
        subagentRunId: fetcherId,
      }),
    ])
    expect(usageOf(terminal)).toEqual({
      calls: 1,
      total: expect.objectContaining(fetcherUsage[0]),
    })
    expect(fetcher.execute).not.toHaveBeenCalled()

    const processor = new StreamProcessor({ initialMessages: [user] })
    replay(processor, first)
    const card = cardOf(processor.getMessages())
    expect(card.subagent).toMatchObject({
      id: researcherId,
      name: 'researcher',
    })
    const researcherParts = card.subagent.messages.flatMap(
      (message) => message.parts,
    )
    const nested = researcherParts.find((part) => part.type === 'subagent')
    expect(nested).toMatchObject({
      subagent: { id: fetcherId, status: 'suspended' },
    })
    const nestedParts =
      nested?.type === 'subagent'
        ? nested.subagent.messages.flatMap((message) => message.parts)
        : []
    expect(nestedParts).toContainEqual(
      expect.objectContaining({
        type: 'tool-call',
        id: 'call_c',
        state: 'approval-requested',
      }),
    )
    // Not on the researcher card, not on the parent message.
    expect(researcherParts.some((part) => part.type === 'tool-call')).toBe(
      false,
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
        ...resumeArgs,
        messages: requestMessages(processor.getMessages()),
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )

    expect(second.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(fetcher.execute).toHaveBeenCalledTimes(1)
    expect(fetcher.contexts[1]).toMatchObject({
      subagentRunId: fetcherId,
      resume: [{ interruptId: 'approval_call_c' }],
    })
    // The same ids continue. No child starts over.
    expect(
      started(second, 'researcher').map(
        (c) => c.type === EventType.SUBAGENT_STARTED && c.subagentRunId,
      ),
    ).toEqual([researcherId])
    expect(
      started(second, 'fetcher').map(
        (c) => c.type === EventType.SUBAGENT_STARTED && c.subagentRunId,
      ),
    ).toEqual([fetcherId])
    const last = second.at(-1)
    expect(last).toMatchObject({ type: EventType.RUN_FINISHED })
    expect(last).not.toHaveProperty('outcome.type', 'interrupt')
    // Fetcher's second call plus the researcher's handoff call. Nothing twice.
    expect(usageOf(last)).toEqual({
      calls: 2,
      total: expect.objectContaining({
        promptTokens:
          fetcherUsage[1].promptTokens + researcherUsage.promptTokens,
        completionTokens:
          fetcherUsage[1].completionTokens + researcherUsage.completionTokens,
        totalTokens: fetcherUsage[1].totalTokens + researcherUsage.totalTokens,
      }),
    })

    replay(processor, second)
    const resumed = cardOf(processor.getMessages())
    expect(resumed.subagent.status).toBe('finished')
    expect(
      resumed.subagent.messages.flatMap((message) => message.parts),
    ).toContainEqual({ type: 'text', content: 'Fetched and cleaned' })
  })

  it('two tool-mode children in one turn, one suspends', async () => {
    const cleaner = approvalAgent('cleaner', cleanerUsage)
    const researcher = textAgent('researcher', 'Paris', researcherUsage)
    const { adapter: parent } = createMockAdapter({
      iterations: [
        [
          ev.runStarted('p1'),
          ev.toolStart('call_a', 'cleaner'),
          ev.toolArgs('call_a', '{}'),
          ev.toolStart('call_b', 'researcher'),
          ev.toolArgs('call_b', '{}'),
          ev.runFinished('tool_calls', 'p1'),
        ],
        [
          ev.runStarted('p2'),
          ev.textStart('parent-done'),
          ev.textContent('All done', 'parent-done'),
          ev.textEnd('parent-done'),
          ev.runFinished('stop', 'p2'),
        ],
      ],
    })
    const subagents = { agents: [cleaner.agent, researcher.agent] }

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
    expect(interruptsOf(terminal)).toEqual([
      expect.objectContaining({ id: 'approval_call_c' }),
    ])
    const cleanerId = idOf(first, 'cleaner')
    const researcherId = idOf(first, 'researcher')
    expect(cleanerId).not.toBe(researcherId)
    expect(started(first, 'cleaner')[0]).toMatchObject({
      parentToolCallId: 'call_a',
    })
    expect(started(first, 'researcher')[0]).toMatchObject({
      parentToolCallId: 'call_b',
    })
    expect(finished(first, cleanerId)).toMatchObject({
      outcome: { type: 'suspended' },
    })
    expect(finished(first, researcherId)).not.toHaveProperty('outcome')
    expect(researcher.run).toHaveBeenCalledTimes(1)
    // The researcher's call closed with its answer. The cleaner's stays open.
    expect(
      first.find(
        (chunk) =>
          chunk.type === EventType.TOOL_CALL_RESULT &&
          chunk.toolCallId === 'call_b',
      ),
    ).toBeDefined()
    expect(
      first.some(
        (chunk) =>
          chunk.type === EventType.TOOL_CALL_RESULT &&
          chunk.toolCallId === 'call_a',
      ),
    ).toBe(false)

    const processor = new StreamProcessor({ initialMessages: [user] })
    replay(processor, first)
    processor.addToolApprovalResponse('approval_call_c', true)
    const second = await collectChunks(
      chat({
        adapter: parent,
        ...resumeArgs,
        messages: requestMessages(processor.getMessages()),
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )

    expect(second.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(researcher.run).toHaveBeenCalledTimes(1)
    expect(started(second, 'researcher')).toEqual([])
    expect(
      started(second, 'cleaner').map(
        (c) => c.type === EventType.SUBAGENT_STARTED && c.subagentRunId,
      ),
    ).toEqual([cleanerId])
    expect(cleaner.execute).toHaveBeenCalledTimes(1)
    expect(cleaner.contexts[1]).toMatchObject({
      subagentRunId: cleanerId,
      resume: [{ interruptId: 'approval_call_c' }],
    })
    expect(
      second.find(
        (chunk) =>
          chunk.type === EventType.TOOL_CALL_RESULT &&
          chunk.toolCallId === 'call_a',
      ),
    ).toBeDefined()
    const last = second.at(-1)
    expect(last).toMatchObject({ type: EventType.RUN_FINISHED })
    expect(last).not.toHaveProperty('outcome.type', 'interrupt')
  })

  it('parallel routed children with different outcomes', async () => {
    const cleaner = approvalAgent('cleaner', cleanerUsage)
    const researcher = textAgent('researcher', 'Paris', researcherUsage)
    const parent = createMockAdapter({ iterations: [] }).adapter
    const router = vi.fn(() => ['cleaner', 'researcher'])
    const subagents = { agents: [cleaner.agent, researcher.agent], router }

    const first = await collectChunks(
      chat({
        adapter: parent,
        threadId: 't',
        runId: 'run-1',
        messages: [user],
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )

    const cleanerId = idOf(first, 'cleaner')
    const researcherId = idOf(first, 'researcher')
    const terminal = first.at(-1)
    expect(interruptsOf(terminal)).toEqual([
      expect.objectContaining({
        id: 'approval_call_c',
        subagentRunId: cleanerId,
      }),
    ])
    expect(
      first.filter((chunk) => chunk.type === EventType.SUBAGENT_FINISHED),
    ).toHaveLength(2)
    expect(finished(first, cleanerId)).toMatchObject({
      outcome: { type: 'suspended', interruptIds: ['approval_call_c'] },
    })
    expect(finished(first, researcherId)).not.toHaveProperty('outcome')
    expect(researcher.run).toHaveBeenCalledTimes(1)
    // Cleaner's first call plus the researcher.
    expect(usageOf(terminal)).toEqual({
      calls: 2,
      total: expect.objectContaining({
        promptTokens:
          cleanerUsage[0].promptTokens + researcherUsage.promptTokens,
        completionTokens:
          cleanerUsage[0].completionTokens + researcherUsage.completionTokens,
        totalTokens: cleanerUsage[0].totalTokens + researcherUsage.totalTokens,
      }),
    })

    const processor = new StreamProcessor({ initialMessages: [user] })
    replay(processor, first)
    processor.addToolApprovalResponse('approval_call_c', true)
    const second = await collectChunks(
      chat({
        adapter: parent,
        ...resumeArgs,
        messages: requestMessages(processor.getMessages()),
        subagents,
      }) as AsyncIterable<StreamChunk>,
    )

    expect(second.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(router).toHaveBeenCalledTimes(1)
    expect(researcher.run).toHaveBeenCalledTimes(1)
    expect(started(second, 'researcher')).toEqual([])
    expect(cleaner.contexts).toHaveLength(2)
    expect(cleaner.contexts[1]).toMatchObject({
      subagentRunId: cleanerId,
      parentRunId: 'run-1',
      resume: [{ interruptId: 'approval_call_c' }],
    })
    expect(cleaner.execute).toHaveBeenCalledTimes(1)
    const last = second.at(-1)
    expect(last).toMatchObject({ type: EventType.RUN_FINISHED })
    expect(last).not.toHaveProperty('outcome.type', 'interrupt')
    // Only the cleaner's second call. The researcher already reported.
    expect(usageOf(last)).toEqual({
      calls: 1,
      total: expect.objectContaining(cleanerUsage[1]),
    })
  })
})
