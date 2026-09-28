import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { mockAdapter, text, toolCall } from './helpers'

const agentNamed = (name: string, reply: string) =>
  defineAgent({
    name,
    description: `The ${name} agent`,
    inputSchema: z.object({ task: z.string() }),
    run: async (ctx) => `${reply}: ${ctx.input.task}`,
  })

const toolNames = (call: any): Array<string> =>
  (call.tools ?? []).map((tool: { name: string }) => tool.name)

describe('plugin subagents', () => {
  it('lets the model call agents that session and run plugins give, after the harness ones', async () => {
    const lead = agentNamed('lead_helper', 'lead')
    const fromSession = definePlugin({
      name: 'test/session-agents',
      setup: () => ({ subagents: [agentNamed('painter', 'painted')] }),
    })
    const fromRun = definePlugin({
      name: 'test/run-agents',
      lifetime: 'run',
      setup: () => ({ subagents: [agentNamed('writer', 'wrote')] }),
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('painter', { task: 'a fox' }),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/plugin-subagents',
        adapter,
        subagents: { agents: [lead] },
        plugins: () => [fromSession, fromRun],
      }),
      { threadId: 't' },
    )

    const turn = await session.prompt('paint a fox')
    expect(turn.text).toBe('done')
    expect(toolNames(calls[0])).toEqual(['lead_helper', 'painter', 'writer'])
    expect(JSON.stringify(calls[1].messages)).toContain('painted: a fox')
    // Plugin subagents are session agents too, so commands and clients can run them.
    expect(await session.agent('painter')?.run({ task: 'a cat' })).toBe(
      'painted: a cat',
    )
    await host.close()
  })

  it('gives no agent tools when neither the harness nor a plugin has any', async () => {
    const { adapter, calls } = mockAdapter([() => text('hi')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/no-subagents',
        adapter,
        plugins: () => [
          definePlugin({ name: 'test/empty', setup: () => ({}) }),
        ],
      }),
      { threadId: 't' },
    )
    await session.prompt('hello')
    expect(toolNames(calls[0])).toEqual([])
    await host.close()
  })
})
