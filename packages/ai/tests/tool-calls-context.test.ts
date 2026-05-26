import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import type { ToolCall } from '../src/types'

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

    const generator = executeToolCalls(
      toolCalls,
      [tool],
      new Map(),
      new Map(),
      undefined,
      undefined,
      { userId: 'u-1', requestId: 'req-1' },
    )

    let result = await generator.next()
    while (!result.done) {
      result = await generator.next()
    }

    expect(result.value.results[0]?.result).toEqual({
      userId: 'u-1',
      requestId: 'req-1',
      toolCallId: 'tc-context',
    })
  })
})
