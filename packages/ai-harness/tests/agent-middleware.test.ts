import { describe, expect, it } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { AnyChatMiddleware, StreamChunk } from '@tanstack/ai'
import type { AnyHarness, PluginLifetime } from '../src'

/** `chunks` with `totalTokens` of usage on RUN_FINISHED, as real models report. */
function withUsage(chunks: Array<StreamChunk>, totalTokens: number) {
  return chunks.map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: [{ inputTokens: totalTokens, outputTokens: 0, totalTokens }],
        }
      : chunk,
  )
}

/** An agent that answers `answer` through `ctx.chat`. */
function textAgent(name: string, answer = `${name} done`, tokens = 0) {
  const { adapter } = mockAdapter([() => withUsage(text(answer), tokens)])
  return defineAgent({
    name,
    description: `The ${name} agent`,
    run: (ctx) => ctx.chat({ adapter }),
  })
}

/** Chat middleware that records the name of every run it sees. */
function recordRuns() {
  const runs: Array<string> = []
  const middleware: AnyChatMiddleware = {
    name: 'test/record',
    onStart: (ctx) => {
      runs.push(ctx.subagentName ?? 'lead')
    },
  }
  return { runs, middleware }
}

function agentPlugin(
  middleware: AnyChatMiddleware,
  lifetime: PluginLifetime = 'session',
) {
  return definePlugin({
    name: 'test/agent-middleware',
    lifetime,
    setup: () => ({ agentMiddleware: [middleware] }),
  })
}

async function open(harness: AnyHarness) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(harness, { threadId: 't' })
  return { host, session }
}

/**
 * A model that calls `agent` once, then answers. `tokens` is the usage of the
 * two calls.
 */
function leadCalling(agent: string, tokens: [number, number] = [0, 0]) {
  return mockAdapter([
    () => withUsage(toolCall(agent, {}), tokens[0]),
    () => withUsage(text('lead done'), tokens[1]),
  ]).adapter
}

/** An agent whose model calls `child` as a tool through `ctx.chat`. */
function parentAgent(
  name: string,
  child: ReturnType<typeof textAgent>,
  tokens: [number, number] = [0, 0],
) {
  const adapter = leadCalling(child.name, tokens)
  return defineAgent({
    name,
    description: `Starts ${child.name}`,
    run: (ctx) => ctx.chat({ adapter, subagents: { agents: [child] } }),
  })
}

describe('plugin agentMiddleware', () => {
  it('runs for a subagent the lead model calls and for its nested child, not for the lead turn', async () => {
    const { runs, middleware } = recordRuns()
    const researcher = parentAgent('researcher', textAgent('fetcher'))
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-middleware',
        adapter: leadCalling('researcher'),
        subagents: { agents: [researcher] },
        plugins: () => [agentPlugin(middleware)],
      }),
    )

    const turn = await session.prompt('research')

    expect(turn.text).toBe('lead done')
    expect(runs).toEqual(['researcher', 'fetcher'])
    await host.close()
  })

  it('runs for a background agent started from the session', async () => {
    const { runs, middleware } = recordRuns()
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-middleware',
        adapter: mockAdapter([]).adapter,
        agents: [textAgent('worker', 'worked')],
        plugins: () => [agentPlugin(middleware)],
      }),
    )

    const result = await session.agent('worker')?.start()

    expect(result).toBe('worked')
    expect(runs).toEqual(['worker'])
    await host.close()
  })

  it('runs for a run-lifetime plugin too', async () => {
    const { runs, middleware } = recordRuns()
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-middleware',
        adapter: leadCalling('helper'),
        subagents: { agents: [textAgent('helper')] },
        plugins: () => [agentPlugin(middleware, 'run')],
      }),
    )

    await session.prompt('help')

    expect(runs).toEqual(['helper'])
    await host.close()
  })

  it('counts each model call once per agent when one tracker is in middleware and agentMiddleware', async () => {
    const calls: Array<{ agent: string; totalTokens: number }> = []
    const tracker: AnyChatMiddleware = {
      name: 'test/usage',
      onUsage: (ctx, usage) => {
        calls.push({
          agent: ctx.subagentName ?? 'lead',
          totalTokens: usage.totalTokens,
        })
      },
    }
    const usagePlugin = definePlugin({
      name: 'test/usage',
      setup: () => ({ middleware: [tracker], agentMiddleware: [tracker] }),
    })
    const researcher = parentAgent(
      'researcher',
      textAgent('fetcher', 'fetched', 100),
      [10, 20],
    )
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-middleware',
        adapter: leadCalling('researcher', [1, 2]),
        subagents: { agents: [researcher] },
        plugins: () => [usagePlugin],
      }),
    )

    await session.prompt('research')

    expect(calls).toEqual([
      { agent: 'lead', totalTokens: 1 },
      { agent: 'researcher', totalTokens: 10 },
      { agent: 'fetcher', totalTokens: 100 },
      { agent: 'researcher', totalTokens: 20 },
      { agent: 'lead', totalTokens: 2 },
    ])
    await host.close()
  })
})
