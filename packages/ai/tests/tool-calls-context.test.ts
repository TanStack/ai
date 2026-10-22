import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat, toolDefinition } from '../src'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { ToolCall } from '../src/types'

async function drain(generator: ReturnType<typeof executeToolCalls>) {
  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }
  return result.value
}

function threadIdTool(seen: Array<string | undefined>) {
  return toolDefinition({
    name: 'read_thread',
    description: 'Read the thread id',
    inputSchema: z.object({}),
  }).server((_input, ctx) => {
    seen.push(ctx?.threadId)
    return 'ok'
  })
}

describe('executeToolCalls runtime context', () => {
  it('passes runtime context to server tools', async () => {
    type AppContext = { userId: string; requestId: string }
    const inputSchema = z.object({})
    const outputSchema = z.object({
      userId: z.string(),
      requestId: z.string(),
      toolCallId: z.string().optional(),
    })

    const tool = toolDefinition({
      name: 'read_context',
      description: 'Read context',
      inputSchema,
      outputSchema,
    }).server<AppContext>((_input, ctx) => ({
      userId: ctx.context.userId,
      requestId: ctx.context.requestId,
      toolCallId: ctx.toolCallId,
    }))

    const toolCalls: Array<ToolCall> = [
      {
        id: 'tc-context',
        type: 'function',
        function: { name: tool.name, arguments: '{}' },
      },
    ]

    const result = await drain(
      executeToolCalls(
        toolCalls,
        [tool],
        new Map(),
        new Map(),
        undefined,
        undefined,
        { userId: 'u-1', requestId: 'req-1' },
      ),
    )

    expect(result.results[0]?.result).toEqual({
      userId: 'u-1',
      requestId: 'req-1',
      toolCallId: 'tc-context',
    })
  })

  it('passes the thread id to server tools', async () => {
    const seen: Array<string | undefined> = []
    const tool = threadIdTool(seen)
    const toolCalls: Array<ToolCall> = [
      {
        id: 'tc-thread',
        type: 'function',
        function: { name: tool.name, arguments: '{}' },
      },
    ]

    await drain(
      executeToolCalls(
        toolCalls,
        [tool],
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'thread-a',
      ),
    )

    expect(seen).toEqual(['thread-a'])
  })

  it('chat() gives tools its threadId', async () => {
    const seen: Array<string | undefined> = []
    const tool = threadIdTool(seen)
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('tc-thread', tool.name),
          ev.toolArgs('tc-thread', '{}'),
          ev.runFinished('tool_calls'),
        ],
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('done'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'read the thread' }],
        tools: [tool],
        threadId: 'thread-a',
      }),
    )

    expect(seen).toEqual(['thread-a'])
  })
})
