import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { chat } from '../src/activities/chat'
import {
  LoadChildCapability,
  provideLoadChild,
} from '../src/activities/chat/middleware/load-child'
import {
  createSubagentSink,
  createSyntheticSubagentTools,
} from '../src/activities/chat/agents/spawn'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { SubagentTurn } from '../src/activities/chat/agents/turn'
import type { SubagentBinding } from '../src/activities/chat/agents/bound'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { ModelMessage, StreamChunk, UIMessage } from '../src/types'

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

beforeEach(() => {
  runs.length = 0
})

/**
 * A parent model that writes a line of text, calls the tool of `agent` once
 * with `args`, then stops.
 */
function parentCalling(agent: string, args: object) {
  return createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.textStart(),
        ev.textContent('Asking a subagent.'),
        ev.textEnd(),
        ev.toolStart('call_1', agent),
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

/** Run a parent chat. The model calls the tool of `agent` with `args`. */
async function callSubagent(
  agent: string,
  args: object,
  options: {
    middleware?: Array<ChatMiddleware>
    binding?: SubagentBinding
    runId?: string
  } = {},
) {
  const { adapter, calls } = parentCalling(agent, args)
  const chunks = await collectChunks(
    chat({
      adapter,
      ...(options.runId !== undefined && { runId: options.runId }),
      messages: [{ role: 'user', content: 'Go' }],
      subagents: {
        agents,
        ...(options.binding && { binding: options.binding }),
      },
      ...(options.middleware && { middleware: options.middleware }),
    }) as AsyncIterable<StreamChunk>,
  )
  return { chunks, calls, result: toolResult(chunks) }
}

/**
 * A fake persistence middleware that provides the `loadChild` service. Each
 * stored child ran under the `writer` agent.
 */
function storedChildren(
  stored: Map<string, Array<ModelMessage>>,
): ChatMiddleware {
  return {
    name: 'stored-children',
    provides: [LoadChildCapability],
    setup(ctx) {
      provideLoadChild(ctx, async (subagentRunId) => {
        const messages = stored.get(subagentRunId)
        return messages === undefined
          ? undefined
          : { messages, agent: 'writer' }
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

/** The wire schema of each agent tool, by name. */
function toolSchemas(
  calls: Array<{ tools?: Array<{ name: string; inputSchema?: unknown }> }>,
) {
  return Object.fromEntries(
    (calls[0]?.tools ?? []).map((tool) => [tool.name, tool.inputSchema]),
  )
}

describe('agent tool input', () => {
  it('puts the agent schema under input, and gives an agent without one a prompt', async () => {
    const { calls, result } = await callSubagent('researcher', {
      input: { topic: 'tides' },
    })

    const schemas = toolSchemas(calls)
    expect(Object.keys(schemas)).toEqual(['researcher', 'writer'])
    expect(schemas.researcher).toMatchObject({
      type: 'object',
      properties: { input: { properties: { topic: { type: 'string' } } } },
      required: ['input'],
    })
    expect(schemas.writer).toMatchObject({
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: [],
    })
    expect(runs).toMatchObject([
      { agent: 'researcher', input: { topic: 'tides' } },
    ])
    expect(result.result).toBe('facts about tides')
  })

  it('points the refs of a recursive input schema at input', async () => {
    const node: z.ZodType<{ name: string; children?: Array<unknown> }> =
      z.object({
        name: z.string(),
        get children() {
          return z.array(node).optional()
        },
      })
    const tree = defineAgent({
      name: 'tree',
      description: 'Reads a tree',
      inputSchema: node,
      run: async (ctx) => {
        runs.push({ agent: 'tree', input: ctx.input, messages: ctx.messages })
        return 'ok'
      },
    })
    const { adapter, calls } = parentCalling('tree', {
      input: { name: 'root', children: [{ name: 'leaf' }] },
    })
    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: { agents: [tree] },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(JSON.stringify(toolSchemas(calls).tree)).toContain(
      '"$ref":"#/properties/input"',
    )
    expect(runs[0]?.input).toEqual({
      name: 'root',
      children: [{ name: 'leaf' }],
    })
  })

  it('has sessionId and background only when the run can use them', async () => {
    const plain = await callSubagent('writer', {})
    const able = await callSubagent(
      'writer',
      {},
      {
        middleware: [storedChildren(oldChild)],
        binding: { start: async () => ({ subagentRunId: 'unused' }) },
      },
    )

    expect(toolSchemas(plain.calls).writer).not.toHaveProperty(
      'properties.sessionId',
    )
    expect(toolSchemas(plain.calls).writer).not.toHaveProperty(
      'properties.background',
    )
    expect(toolSchemas(able.calls).writer).toMatchObject({
      properties: {
        sessionId: { type: 'string' },
        background: { type: 'boolean' },
      },
    })
  })

  it('reads the conversation when an agent without inputSchema gets no prompt', async () => {
    const { result } = await callSubagent('writer', {})

    expect(runs[0]?.input).toBeUndefined()
    expect(runs[0]?.messages).toMatchObject([
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: 'Asking a subagent.' },
    ])
    // No persistence store, so the model gets no subagentRunId.
    expect(result).toEqual({ result: 'draft' })
  })

  it('adds the prompt as the last user message of a child without inputSchema', async () => {
    await callSubagent('writer', { prompt: 'Write a haiku' })

    expect(runs).toHaveLength(1)
    expect(runs[0]?.input).toBeUndefined()
    expect(runs[0]?.messages).toMatchObject([
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: 'Asking a subagent.' },
      { role: 'user', content: 'Write a haiku' },
    ])
  })

  it('continues a stored child by sessionId', async () => {
    const { result } = await callSubagent(
      'writer',
      { sessionId: 'subagent-old', prompt: 'Make it shorter' },
      { middleware: [storedChildren(oldChild)] },
    )

    expect(runs[0]?.messages).toEqual([
      { role: 'user', content: 'Draft a tide report' },
      { role: 'assistant', content: 'Tides rise twice a day.' },
      { role: 'user', content: 'Make it shorter' },
    ])
    expect(result).toEqual({ subagentRunId: 'subagent-old', result: 'draft' })
  })

  it('gives the text of each continue its own message', async () => {
    const ids: Array<string> = []
    for (const runId of ['run-1', 'run-2']) {
      const { chunks } = await callSubagent(
        'writer',
        { sessionId: 'subagent-old' },
        { middleware: [storedChildren(oldChild)], runId },
      )
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
    const [, tool] = createSyntheticSubagentTools(
      { agents },
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
      { sessionId: 'subagent-old', prompt: 'Make it shorter' },
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
    const { result } = await callSubagent(
      'writer',
      { prompt: 'Draft', background: true },
      { binding: { start } },
    )

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

  const toolErrors: Array<
    [string, string, object, Array<ChatMiddleware>, string]
  > = [
    [
      'a prompt for an agent with inputSchema',
      'researcher',
      { prompt: 'tides' },
      [],
      'Agent "researcher" takes input, not prompt.',
    ],
    [
      'no input for an agent with inputSchema',
      'researcher',
      {},
      [],
      'Agent "researcher" needs input.',
    ],
    [
      'an input that fails the agent schema',
      'researcher',
      { input: { topic: 3 } },
      [],
      'Input validation failed for tool researcher: Invalid input: expected string, received number',
    ],
    [
      'an input for an agent without inputSchema',
      'writer',
      { input: { topic: 'tides' } },
      [],
      'Agent "writer" takes prompt, not input.',
    ],
    [
      'a sessionId without a persistence store',
      'writer',
      { sessionId: 'subagent-old' },
      [],
      'sessionId needs a persistence store.',
    ],
    [
      'an unknown sessionId',
      'writer',
      { sessionId: 'subagent-missing' },
      [storedChildren(oldChild)],
      'Unknown sessionId "subagent-missing".',
    ],
    [
      'a sessionId of a child of another agent',
      'researcher',
      { sessionId: 'subagent-old', input: { topic: 'x' } },
      [storedChildren(oldChild)],
      'Session "subagent-old" belongs to agent "writer", not "researcher".',
    ],
    [
      'background without a host',
      'writer',
      { background: true },
      [],
      'background needs a host that runs children in the background.',
    ],
    [
      'a background that is not a boolean',
      'writer',
      { background: 'true' },
      [],
      'prompt and sessionId must be strings, and background a boolean.',
    ],
    [
      'background with a sessionId',
      'writer',
      { background: true, sessionId: 'subagent-old' },
      [],
      'background cannot continue a sessionId.',
    ],
  ]
  it.each(toolErrors)(
    'returns a tool error for %s',
    async (_label, agent, args, middleware, error) => {
      const { chunks, result } = await callSubagent(agent, args, {
        middleware,
      })

      expect(result).toEqual({ error })
      expect(runs).toEqual([])
      // The parent run goes on after the tool error.
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
    },
  )
})
