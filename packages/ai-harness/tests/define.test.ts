import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  isHarnessDefinition,
} from '../src'
import { mockAdapter, text, toolCall } from './helpers'

const agent = (name: string) =>
  defineAgent({
    name,
    description: name,
    inputSchema: z.object({ q: z.string() }),
    run: async () => 'ok',
  })

describe('defineHarness', () => {
  const { adapter } = mockAdapter([])

  it('returns a frozen, branded definition', () => {
    const harness = defineHarness({ name: 'acme/test', adapter })
    expect(isHarnessDefinition(harness)).toBe(true)
    expect(Object.isFrozen(harness)).toBe(true)
    expect(isHarnessDefinition({ name: 'x' })).toBe(false)
  })

  it('rejects an empty name', () => {
    expect(() => defineHarness({ name: ' ', adapter })).toThrow(
      'non-empty name',
    )
  })

  it('rejects two different agents with one name', () => {
    expect(() =>
      defineHarness({
        name: 'acme/test',
        adapter,
        agents: [agent('same')],
        subagents: { agents: [agent('same')] },
      }),
    ).toThrow('two different agents are named "same"')
  })

  it('allows one agent in both agents and subagents', () => {
    const shared = agent('shared')
    expect(() =>
      defineHarness({
        name: 'acme/test',
        adapter,
        agents: [shared],
        subagents: { agents: [shared] },
      }),
    ).not.toThrow()
  })

  it('rejects expose names that are not agents', () => {
    expect(() =>
      defineHarness({
        name: 'acme/test',
        adapter,
        agents: [agent('real')],
        expose: { agents: ['missing' as 'real'] },
      }),
    ).toThrow('expose.agents names "missing"')
  })
})

describe('toolExecution', () => {
  it("runs the tools of one model call one at a time with 'sequential'", async () => {
    const log: Array<string> = []
    const tool = (name: string) =>
      toolDefinition({
        name,
        description: name,
        inputSchema: z.object({}),
      }).server(async () => {
        log.push(`start:${name}`)
        // Wait one macrotask. Parallel tools all start before it ends.
        await new Promise((resolve) => setTimeout(resolve, 0))
        log.push(`end:${name}`)
        return {}
      })
    // One model call with two tool calls: drop the RUN_FINISHED of the
    // first call and the RUN_STARTED of the second.
    const bothTools = () => [
      ...toolCall('first', {}, 'call-1').slice(0, -1),
      ...toolCall('second', {}, 'call-2').slice(1),
    ]
    const { adapter } = mockAdapter([bothTools, () => text('done')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/sequential',
        adapter,
        tools: [tool('first'), tool('second')],
        toolExecution: 'sequential',
      }),
      { threadId: 't1' },
    )

    await expect(session.prompt('go')).resolves.toEqual({ text: 'done' })
    expect(log).toEqual([
      'start:first',
      'end:first',
      'start:second',
      'end:second',
    ])
    await host.close()
  })
})
