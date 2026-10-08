import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  DEFAULT_SUBAGENT_LIMITS,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  harnessAgent,
} from '../src'
import { mockAdapter, text, toolCall } from './helpers'

describe('a harness as a child agent', () => {
  it('lets the main model call another harness as a tool', async () => {
    const inner = mockAdapter([() => text('Reviewed: looks good.')])
    const reviewer = defineHarness({
      name: 'acme/reviewer',
      description: 'Reviews code',
      adapter: inner.adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const child = harnessAgent(reviewer, { host })
    expect(child.name).toBe('acme_reviewer')
    expect(child.description).toBe('Reviews code')

    const outer = mockAdapter([
      () => toolCall('acme_reviewer', {}),
      () => text('The reviewer approved.'),
    ])
    const lead = defineHarness({
      name: 'acme/lead',
      adapter: outer.adapter,
      subagents: { agents: [child] },
    })
    const session = await host.open(lead, { threadId: 't' })
    const turn = await session.prompt('review my change')
    expect(turn.text).toBe('The reviewer approved.')
    expect(JSON.stringify(outer.calls[1].messages)).toContain(
      'Reviewed: looks good.',
    )
    await host.close()
  })
})

describe('ctx.agents in plugins', () => {
  const echo = defineAgent({
    name: 'echo',
    description: 'Echoes',
    inputSchema: z.object({ text: z.string() }),
    run: async (ctx) => ctx.input.text.toUpperCase(),
  })
  const failing = defineAgent({
    name: 'failing',
    description: 'Fails',
    run: async () => {
      throw new Error('boom')
    },
  })

  it('runs agents one by one and as a group from a command', async () => {
    let slowStopped = false
    const slow = defineAgent({
      name: 'slow',
      description: 'Waits until stopped',
      run: (ctx) =>
        new Promise<string>((resolve) => {
          ctx.abortSignal?.addEventListener('abort', () => {
            slowStopped = true
            resolve('stopped')
          })
        }),
    })
    const orchestrator = definePlugin({
      name: 'test/orchestrator',
      setup: (ctx) => ({
        commands: {
          one: defineCommand({
            description: 'Run echo',
            run: async () => ctx.agents.run(echo, { text: 'hi' }),
          }),
          both: defineCommand({
            description: 'Run two echoes',
            run: () =>
              ctx.agents.group({}, (group) =>
                Promise.all([
                  group.run(echo, { text: 'a' }),
                  group.run('echo', { text: 'b' }),
                ]),
              ),
          }),
          failFast: defineCommand({
            description: 'One fails, the other is cancelled',
            run: () =>
              ctx.agents.group({ onFailure: 'cancel-siblings' }, (group) =>
                Promise.all([group.run(slow), group.run(failing)]),
              ),
          }),
          collect: defineCommand({
            description: 'Collect every outcome',
            run: () =>
              ctx.agents.group({ onFailure: 'collect' }, (group) =>
                Promise.all([
                  group.runSettled(echo, { text: 'ok' }),
                  group.runSettled(failing),
                ]),
              ),
          }),
        },
      }),
    })
    const { adapter } = mockAdapter([])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/orchestrate',
        adapter,
        agents: [echo, failing, slow],
        plugins: () => [orchestrator],
      }),
      { threadId: 't' },
    )

    expect(await session.command('one')).toBe('HI')
    expect(await session.command('both')).toEqual(['A', 'B'])
    await expect(session.command('failFast')).rejects.toThrow('boom')
    expect(slowStopped).toBe(true)
    const collected = await session.command('collect')
    expect(collected).toMatchObject([{ ok: true, value: 'OK' }, { ok: false }])
    await host.close()
  })
})

describe('default limits', () => {
  it('applies depth, concurrency, and call limits to the main model', async () => {
    expect(DEFAULT_SUBAGENT_LIMITS).toEqual({
      maxDepth: 2,
      maxConcurrent: 3,
      maxCalls: 12,
    })
    const run = vi.fn(async () => 'done')
    const worker = defineAgent({ name: 'worker', description: 'Works', run })
    const outer = mockAdapter([
      () => toolCall('worker', {}, 'c1'),
      () => toolCall('worker', {}, 'c2'),
      () => text('stopped'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/limits',
        adapter: outer.adapter,
        subagents: { agents: [worker], limits: { maxCalls: 1 } },
      }),
      { threadId: 't' },
    )
    await session.prompt('work twice')
    expect(run).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(outer.calls[2].messages)).toContain(
      'subagent limit reached (maxCalls 1)',
    )
    await host.close()
  })
})
