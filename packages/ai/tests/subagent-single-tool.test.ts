import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { chat } from '../src/activities/chat'
import { provideLoadChild } from '../src/activities/chat/middleware/load-child'
import {
  createSubagentSink,
  createSyntheticSubagentTools,
} from '../src/activities/chat/agents/spawn'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { DefinedAgent } from '../src/activities/chat/agents/define-agent'
import type { SubagentToolInput } from '../src/activities/chat/agents/spawn'
import type { SubagentTurn } from '../src/activities/chat/agents/turn'
import type { SubagentBinding } from '../src/activities/chat/agents/bound'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { ModelMessage, StreamChunk, Tool, UIMessage } from '../src/types'

/** What one child run saw. */
interface ChildRun {
  agent: string
  input: unknown
  messages: Array<UIMessage | ModelMessage>
}

const runs: Array<ChildRun> = []

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts',
  inputSchema: z.object({ topic: z.string() }),
  run: async (ctx) => {
    runs.push({ agent: 'researcher', input: ctx.input, messages: ctx.messages })
    return `facts about ${ctx.input.topic}`
  },
})

const writer = defineAgent({
  name: 'writer',
  description: 'Writes text',
  run: async (ctx) => {
    runs.push({ agent: 'writer', input: ctx.input, messages: ctx.messages })
    return 'draft'
  },
})

const agents = [researcher, writer]

type Call = SubagentToolInput<typeof agents>

beforeEach(() => {
  runs.length = 0
})

/**
 * A parent model that writes a line of text, calls the `subagent` tool once
 * with `args`, then stops.
 */
function parentCalling(args: object) {
  return createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.textStart(),
        ev.textContent('Asking a subagent.'),
        ev.textEnd(),
        ev.toolStart('call_1', 'subagent'),
        ev.toolArgs('call_1', JSON.stringify(args)),
        ev.runFinished('tool_calls'),
      ],
      [ev.runStarted(), ev.runFinished('stop')],
    ],
  })
}

/** The parsed result of tool call `call_1`. */
function toolResult(chunks: Array<StreamChunk>) {
  for (const chunk of chunks) {
    if (
      chunk.type === EventType.TOOL_CALL_RESULT &&
      chunk.toolCallId === 'call_1' &&
      typeof chunk.content === 'string'
    ) {
      return JSON.parse(chunk.content)
    }
  }
  throw new Error('No result for call_1')
}

/** Run a parent chat with the single tool. The model calls it with `args`. */
async function callSubagent(
  args: object,
  options: {
    middleware?: Array<ChatMiddleware>
    binding?: SubagentBinding
    runId?: string
  } = {},
) {
  const { adapter, calls } = parentCalling(args)
  const chunks = await collectChunks(
    chat({
      adapter,
      ...(options.runId !== undefined && { runId: options.runId }),
      messages: [{ role: 'user', content: 'Go' }],
      subagents: {
        agents,
        tool: 'single',
        ...(options.binding && { binding: options.binding }),
      },
      ...(options.middleware && { middleware: options.middleware }),
    }) as AsyncIterable<StreamChunk>,
  )
  return { chunks, calls, result: toolResult(chunks) }
}

/** A fake persistence middleware that provides the `loadChild` service. */
function storedChildren(
  stored: Map<string, Array<ModelMessage>>,
): ChatMiddleware {
  return {
    name: 'stored-children',
    setup(ctx) {
      provideLoadChild(ctx, async (subagentRunId) => {
        const messages = stored.get(subagentRunId)
        return messages === undefined ? undefined : { messages }
      })
    },
  }
}

const oldChild = new Map<string, Array<ModelMessage>>([
  [
    'subagent-old',
    [
      { role: 'user', content: 'Draft a tide report' },
      { role: 'assistant', content: 'Tides rise twice a day.' },
    ],
  ],
])

describe('subagents tool: single', () => {
  it('gives the model one subagent tool and runs an agent with its input', async () => {
    const call: Call = { agent: 'researcher', input: { topic: 'tides' } }
    const { calls, result } = await callSubagent(call)

    const tools = calls[0]?.tools ?? []
    expect(tools.map((tool) => tool.name)).toEqual(['subagent'])
    expect(tools[0]?.inputSchema).toMatchObject({
      type: 'object',
      properties: { agent: { enum: ['researcher', 'writer'] } },
      required: ['agent'],
    })
    expect(runs).toMatchObject([
      { agent: 'researcher', input: { topic: 'tides' } },
    ])
    expect(result.result).toBe('facts about tides')
  })

  it('adds the prompt as the last user message of a child without inputSchema', async () => {
    const call: Call = { agent: 'writer', prompt: 'Write a haiku' }
    await callSubagent(call)

    expect(runs).toHaveLength(1)
    expect(runs[0]?.input).toBeUndefined()
    expect(runs[0]?.messages).toMatchObject([
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: 'Asking a subagent.' },
      { role: 'user', content: 'Write a haiku' },
    ])
  })

  it('continues a stored child by sessionId', async () => {
    const call: Call = {
      agent: 'writer',
      sessionId: 'subagent-old',
      prompt: 'Make it shorter',
    }
    const { result } = await callSubagent(call, {
      middleware: [storedChildren(oldChild)],
    })

    expect(runs[0]?.messages).toEqual([
      { role: 'user', content: 'Draft a tide report' },
      { role: 'assistant', content: 'Tides rise twice a day.' },
      { role: 'user', content: 'Make it shorter' },
    ])
    expect(result).toEqual({ subagentRunId: 'subagent-old', result: 'draft' })
  })

  it('gives the text of each continue its own message', async () => {
    const call: Call = { agent: 'writer', sessionId: 'subagent-old' }
    const ids: Array<string> = []
    for (const runId of ['run-1', 'run-2']) {
      const { chunks } = await callSubagent(call, {
        middleware: [storedChildren(oldChild)],
        runId,
      })
      for (const chunk of chunks) {
        const isChildText =
          chunk.type === EventType.TEXT_MESSAGE_START &&
          'subagentRunId' in chunk &&
          chunk.subagentRunId === 'subagent-old'
        if (isChildText) ids.push(chunk.messageId)
      }
    }

    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('gives a resumed continued child each stored message once', async () => {
    const stored: Array<ModelMessage> = [
      { id: 'old-user', role: 'user', content: 'Draft a tide report' },
      { id: 'old-reply', role: 'assistant', content: 'Tides rise twice.' },
    ]
    const waiting: ModelMessage = {
      id: 'new-reply',
      role: 'assistant',
      content: 'Shorter like this?',
    }
    const turn: SubagentTurn = {
      before: [],
      children: [
        {
          subagentRunId: 'subagent-old',
          name: 'writer',
          status: 'suspended',
          parentToolCallId: 'call_1',
          // The card holds the whole child: the stored messages, then the
          // call that waits.
          messages: [...stored, waiting],
          text: '',
          resume: [
            { interruptId: 'approval_1', status: 'resolved', payload: true },
          ],
        },
      ],
      rest: [],
    }
    const [tool] = createSyntheticSubagentTools(
      { agents, tool: 'single' },
      {
        messages: [],
        threadId: 'thread-1',
        runId: 'run-2',
        interruptedRunId: 'run-1',
        turn,
        sink: createSubagentSink(),
        childLoader: () => async () => ({ messages: stored }),
      },
    )
    await tool?.execute?.(
      { agent: 'writer', sessionId: 'subagent-old', prompt: 'Make it shorter' },
      { toolCallId: 'call_1', emitCustomEvent: () => {} },
    )

    expect(runs[0]?.messages).toEqual([
      ...stored,
      { role: 'user', content: 'Make it shorter' },
      waiting,
    ])
  })

  it('starts a background child through the start hook', async () => {
    const start = vi.fn(async () => ({ subagentRunId: 'subagent-bg' }))
    const call: Call = { agent: 'writer', prompt: 'Draft', background: true }
    const { result } = await callSubagent(call, { binding: { start } })

    expect(result).toEqual({
      subagentRunId: 'subagent-bg',
      result: { status: 'started' },
    })
    expect(start).toHaveBeenCalledWith(
      { agent: 'writer', prompt: 'Draft', parentToolCallId: 'call_1' },
      { wake: true },
    )
    expect(runs).toEqual([])
  })

  const toolErrors: Array<[string, object, Array<ChatMiddleware>, string]> = [
    [
      'a prompt for an agent with inputSchema',
      { agent: 'researcher', prompt: 'tides' },
      [],
      'Agent "researcher" takes input, not prompt.',
    ],
    [
      'no input for an agent with inputSchema',
      { agent: 'researcher' },
      [],
      'Agent "researcher" needs input.',
    ],
    [
      'an input for an agent without inputSchema',
      { agent: 'writer', input: { topic: 'tides' } },
      [],
      'Agent "writer" takes prompt, not input.',
    ],
    [
      'a sessionId without a persistence store',
      { agent: 'writer', sessionId: 'subagent-old' },
      [],
      'sessionId needs a persistence store.',
    ],
    [
      'an unknown sessionId',
      { agent: 'writer', sessionId: 'subagent-missing' },
      [storedChildren(oldChild)],
      'Unknown sessionId "subagent-missing".',
    ],
    [
      'background without a harness host',
      { agent: 'writer', background: true },
      [],
      'background needs a harness host.',
    ],
    [
      'background with a sessionId',
      { agent: 'writer', background: true, sessionId: 'subagent-old' },
      [],
      'background cannot continue a sessionId.',
    ],
  ]
  it.each(toolErrors)(
    'returns a tool error for %s',
    async (_label, args, middleware, error) => {
      const { chunks, result } = await callSubagent(args, { middleware })

      expect(result).toEqual({ error })
      expect(runs).toEqual([])
      // The parent run goes on after the tool error.
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
    },
  )

  const namedSubagent = defineAgent({ ...writer, name: 'subagent' })
  const takenNames: Array<[string, Array<DefinedAgent>, Array<Tool>]> = [
    ['an agent', [researcher, namedSubagent], []],
    ['a tool', agents, [serverTool('subagent', () => 'ok')]],
  ]
  it.each(takenNames)(
    'throws when %s is named subagent',
    (_label, named, tools) => {
      const { adapter } = parentCalling({})
      expect(() =>
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Go' }],
          tools,
          subagents: { agents: named, tool: 'single' },
        }),
      ).toThrow(`subagents.tool 'single' adds a tool named "subagent"`)
    },
  )

  it('types the input as a union on agent', () => {
    expectTypeOf<
      Extract<Call, { agent: 'researcher' }>['input']
    >().toEqualTypeOf<{ topic: string }>()
    expectTypeOf<Extract<Call, { agent: 'writer' }>>().not.toHaveProperty(
      'input',
    )
  })
})
