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
      threadId: 'thread-1',
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
  it('takes the agent schema fields, and gives an agent without one a prompt', async () => {
    const { calls, chunks, result } = await callSubagent('researcher', {
      topic: 'tides',
    })

    const schemas = toolSchemas(calls)
    expect(Object.keys(schemas)).toEqual(['researcher', 'writer'])
    expect(schemas.researcher).toMatchObject({
      type: 'object',
      properties: { topic: { type: 'string' } },
      required: ['topic'],
    })
    expect(schemas.writer).toEqual({
      type: 'object',
      properties: { prompt: { type: 'string' } },
    })
    expect(runs).toMatchObject([
      { agent: 'researcher', input: { topic: 'tides' } },
    ])
    expect(result.result).toBe('facts about tides')
    // The card keeps the checked input for the UI.
    expect(
      chunks.find((chunk) => chunk.type === EventType.SUBAGENT_STARTED),
    ).toMatchObject({
      metadata: { tanstack: { subagentInput: { topic: 'tides' } } },
    })
  })

  it('takes sessionId next to the fields of a strict schema', async () => {
    const strict = defineAgent({
      name: 'strict',
      description: 'Takes a strict input',
      inputSchema: z.object({ topic: z.string() }).strict(),
      run: async (ctx) => {
        runs.push({ agent: 'strict', input: ctx.input, messages: ctx.messages })
        return 'ok'
      },
    })
    const { adapter } = parentCalling('strict', {
      topic: 'tides',
      sessionId: 'subagent-missing',
    })
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        middleware: [storedChildren(oldChild)],
        subagents: { agents: [strict] },
      }) as AsyncIterable<StreamChunk>,
    )

    // The schema check passes. The unknown sessionId is the only error.
    expect(toolResult(chunks)).toEqual({
      error: 'Unknown sessionId "subagent-missing".',
    })
  })

  const taken = defineAgent({
    name: 'taken',
    description: 'Uses sessionId',
    inputSchema: z.object({ sessionId: z.string() }),
    run: async (ctx) => {
      runs.push({ agent: 'taken', input: ctx.input, messages: ctx.messages })
      return 'ok'
    },
  })

  it('checks the agent fields after middleware, with sessionId in the args', async () => {
    const deep = defineAgent({
      name: 'deep',
      description: 'Takes a depth',
      inputSchema: z.object({
        topic: z.string(),
        depth: z.number().default(2),
      }),
      run: async (ctx) => {
        runs.push({ agent: 'deep', input: ctx.input, messages: ctx.messages })
        return 'ok'
      },
    })
    const seen: Array<unknown> = []
    const spy: ChatMiddleware = {
      name: 'spy',
      onBeforeToolCall: (_ctx, hook) => {
        seen.push(hook.args)
      },
    }
    const { adapter } = parentCalling('deep', { topic: 'tides' })
    await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        middleware: [storedChildren(oldChild), spy],
        subagents: { agents: [deep] },
      }) as AsyncIterable<StreamChunk>,
    )

    // Middleware sees the model's input. The final check adds the default.
    expect(seen).toEqual([{ topic: 'tides' }])
    expect(runs[0]?.input).toEqual({ topic: 'tides', depth: 2 })
  })

  it('checks a middleware rewrite of the agent fields before the child starts', async () => {
    const rewrite: ChatMiddleware = {
      name: 'rewrite',
      onBeforeToolCall: () => ({
        type: 'transformArgs',
        args: { topic: { text: 'tides' } },
      }),
    }
    const { chunks, result } = await callSubagent(
      'researcher',
      { topic: 'tides' },
      { middleware: [rewrite] },
    )

    expect(result.error).toContain(
      'Input validation failed for tool researcher',
    )
    expect(runs).toEqual([])
    expect(
      chunks.some((chunk) => chunk.type === EventType.SUBAGENT_STARTED),
    ).toBe(false)
  })

  it('throws when an inputSchema uses a reserved field that the run uses', () => {
    const { adapter } = parentCalling('taken', {})

    expect(() =>
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        middleware: [storedChildren(oldChild)],
        subagents: { agents: [taken] },
      }),
    ).toThrow(
      'Agent "taken" uses the reserved input field "sessionId". Rename that field.',
    )
  })

  it('keeps a reserved name as an agent field when the run does not use it', async () => {
    const { adapter } = parentCalling('taken', { sessionId: 'mine' })
    await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: { agents: [taken] },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(runs[0]?.input).toEqual({ sessionId: 'mine' })
  })

  it('has sessionId and background only when the run can use them', async () => {
    const plain = await callSubagent('writer', {})
    const able = await callSubagent(
      'writer',
      {},
      {
        middleware: [storedChildren(oldChild)],
        binding: {
          start: async () => ({
            subagentRunId: 'unused',
            done: Promise.resolve(),
          }),
        },
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
        childLoader: () => async () => ({
          messages: stored,
          pending: [waiting],
        }),
        canContinue: true,
      },
    )
    await tool?.execute?.(
      { sessionId: 'subagent-old', prompt: 'Make it shorter' },
      { threadId: 'thread-1', toolCallId: 'call_1', emitCustomEvent: () => {} },
    )

    expect(runs[0]?.messages).toEqual([
      ...stored,
      { role: 'user', content: 'Make it shorter' },
      waiting,
    ])
  })

  it('starts a background child through the start hook', async () => {
    const start = vi.fn(async () => ({
      subagentRunId: 'subagent-bg',
      done: Promise.resolve(),
    }))
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

  it('rejects sessionId when the agent schema result is not an object', async () => {
    const flat = defineAgent({
      name: 'flat',
      description: 'Returns text',
      inputSchema: {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: () => ({ value: 'plain' }),
          jsonSchema: {
            input: () => ({ type: 'string' }),
            output: () => ({ type: 'string' }),
          },
        },
      },
      run: async (ctx) => {
        runs.push({ agent: 'flat', input: ctx.input, messages: ctx.messages })
        return 'ran'
      },
    })
    const { adapter } = parentCalling('flat', { sessionId: 'subagent-old' })
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        middleware: [storedChildren(oldChild)],
        subagents: { agents: [flat] },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(toolResult(chunks).error).toContain(
      'Agent input must be an object when the call uses sessionId or background.',
    )
    expect(runs).toEqual([])
  })

  it('advertises sessionId beside a top-level anyOf schema', async () => {
    const either = defineAgent({
      name: 'either',
      description: 'One of two shapes',
      inputSchema: z.union([
        z.object({ topic: z.string() }),
        z.object({ note: z.string() }),
      ]),
      run: async () => 'ok',
    })
    const { adapter, calls } = parentCalling('either', { topic: 'tides' })
    await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        middleware: [storedChildren(oldChild)],
        subagents: { agents: [either] },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(JSON.stringify(toolSchemas(calls).either)).toContain('sessionId')
  })

  it('holds maxConcurrent until a background child ends', async () => {
    let release!: () => void
    const done = new Promise<void>((resolve) => {
      release = resolve
    })
    const start = vi.fn(async () => ({ subagentRunId: 'subagent-bg', done }))
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('c1', 'writer'),
          ev.toolArgs('c1', JSON.stringify({ prompt: 'A', background: true })),
          ev.toolStart('c2', 'writer'),
          ev.toolArgs('c2', JSON.stringify({ prompt: 'B', background: true })),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.runFinished('stop')],
      ],
    })
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: {
          agents: [writer],
          limits: { maxConcurrent: 1 },
          binding: { start },
        },
      }) as AsyncIterable<StreamChunk>,
    )
    release()

    expect(start).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(chunks)).toContain(
      'subagent limit reached (maxConcurrent 1)',
    )
  })

  it('frees a maxCalls slot when a background start throws', async () => {
    let n = 0
    const start = vi.fn(async () => {
      n += 1
      if (n === 1) throw new Error('host down')
      return { subagentRunId: 'subagent-bg', done: Promise.resolve() }
    })
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('c1', 'writer'),
          ev.toolArgs('c1', JSON.stringify({ prompt: 'A', background: true })),
          ev.toolStart('c2', 'writer'),
          ev.toolArgs('c2', JSON.stringify({ prompt: 'B', background: true })),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.runFinished('stop')],
      ],
    })
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        toolExecution: 'sequential',
        subagents: {
          agents: [writer],
          limits: { maxCalls: 1 },
          binding: { start },
        },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(start).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(chunks)).toContain('host down')
    expect(JSON.stringify(chunks)).toContain('subagent-bg')
  })

  const host: SubagentBinding = {
    start: async () => ({ subagentRunId: 'unused', done: Promise.resolve() }),
  }
  const toolErrors: Array<
    [
      string,
      string,
      object,
      { middleware?: Array<ChatMiddleware>; binding?: SubagentBinding },
      string,
    ]
  > = [
    [
      'a missing field of the agent schema',
      'researcher',
      {},
      {},
      'Input validation failed for tool researcher: Validation failed: Invalid input: expected string, received undefined',
    ],
    [
      'a field that fails the agent schema',
      'researcher',
      // A number would be repaired into a string. A list cannot be.
      { topic: [] },
      {},
      'Input validation failed for tool researcher: Validation failed: Invalid input: expected string, received array',
    ],
    [
      'an unknown sessionId',
      'writer',
      { sessionId: 'subagent-missing' },
      { middleware: [storedChildren(oldChild)] },
      'Unknown sessionId "subagent-missing".',
    ],
    [
      'a sessionId of a child of another agent',
      'researcher',
      { sessionId: 'subagent-old', topic: 'x' },
      { middleware: [storedChildren(oldChild)] },
      'Session "subagent-old" belongs to agent "writer", not "researcher".',
    ],
    [
      'a background that is not a boolean',
      'writer',
      // 'true' would be repaired into true. 'yes' cannot be.
      { background: 'yes' },
      { binding: host },
      // The JSON Schema of the tool checks the reserved fields too.
      'Input validation failed for tool writer: #/background: Instance type "string" is invalid. Expected "boolean".',
    ],
    [
      'background with a sessionId',
      'writer',
      { background: true, sessionId: 'subagent-old' },
      { middleware: [storedChildren(oldChild)], binding: host },
      'background cannot continue a sessionId.',
    ],
  ]
  it.each(toolErrors)(
    'returns a tool error for %s',
    async (_label, agent, args, options, error) => {
      const { chunks, result } = await callSubagent(agent, args, options)

      // A schema error also shows the received arguments after the message.
      expect(Object.keys(result)).toEqual(['error'])
      expect(result.error.startsWith(error)).toBe(true)
      expect(runs).toEqual([])
      // The parent run goes on after the tool error.
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
    },
  )
})
