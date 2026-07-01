import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'
import { ToolCallManager } from '../src/activities/chat/tools/tool-calls'
import { ev } from './test-utils'

async function collectGeneratorOutput<TChunk, TResult>(
  generator: AsyncGenerator<TChunk, TResult, void>,
) {
  const chunks: Array<TChunk> = []
  let next = await generator.next()
  while (!next.done) {
    chunks.push(next.value)
    next = await generator.next()
  }
  return { chunks, result: next.value }
}

describe('ToolCallManager runtime context', () => {
  it('passes runtime context to managed tool execution when provided', async () => {
    type AppContext = { userId: string }

    const tool = toolDefinition({
      name: 'read_context',
      description: 'Read context',
      inputSchema: z.object({}),
      outputSchema: z.object({
        userId: z.string(),
        toolCallId: z.string(),
      }),
    }).server<AppContext>((_input, ctx) => ({
      userId: ctx.context.userId,
      toolCallId: ctx.toolCallId ?? '',
    }))

    const manager = new ToolCallManager<AppContext>([tool])
    manager.addToolCallStartEvent(ev.toolStart('tc-manager-context', tool.name))
    manager.addToolCallArgsEvent(ev.toolArgs('tc-manager-context', '{}'))

    const { chunks, result } = await collectGeneratorOutput(
      manager.executeTools(ev.runFinished('tool_calls'), { userId: 'u-1' }),
    )

    expect(chunks[0]?.result).toBe(
      JSON.stringify({
        userId: 'u-1',
        toolCallId: 'tc-manager-context',
      }),
    )
    expect(result[0]?.content).toBe(
      JSON.stringify({
        userId: 'u-1',
        toolCallId: 'tc-manager-context',
      }),
    )
  })
})
