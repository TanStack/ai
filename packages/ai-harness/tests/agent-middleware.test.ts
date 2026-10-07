import { describe, expect, it } from 'vitest'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { permissions, usage } from '../src/first-party'
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

  it('runs for a turn-lifetime plugin too', async () => {
    const { runs, middleware } = recordRuns()
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-middleware',
        adapter: leadCalling('helper'),
        subagents: { agents: [textAgent('helper')] },
        plugins: () => [agentPlugin(middleware, 'turn')],
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

  it('lets the usage() plugin count the model calls of every agent', async () => {
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
        plugins: () => [usage()],
      }),
    )

    await session.prompt('research')

    // The lead (1 + 2), the researcher (10 + 20), and the fetcher (100).
    expect(await session.command('usage')).toBe(
      '5 model calls, 133 input tokens, 0 output tokens, 133 total.',
    )
    // The context size is the input of the lead's latest call, not an agent's.
    expect(session.snapshot().plugins['tanstack/usage']).toMatchObject({
      contextTokens: 2,
    })
    await host.close()
  })

  it('lets permissions() deny a write a subagent tries in plan mode', async () => {
    const writes: Array<unknown> = []
    const writeFile = toolDefinition({
      name: 'write_file',
      description: 'Write a file',
    }).server(async (args) => {
      writes.push(args)
      return 'written'
    })
    const writerModel = mockAdapter([
      () => toolCall('write_file', { path: 'x.txt' }),
      () => text('writer done'),
    ])
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes files',
      run: (ctx) =>
        ctx.chat({ adapter: writerModel.adapter, tools: [writeFile] }),
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-middleware',
        adapter: leadCalling('writer'),
        subagents: { agents: [writer] },
        plugins: () => [
          permissions({
            rules: [{ tool: 'write_file', decision: 'ask', kind: 'edit' }],
          }),
        ],
      }),
    )
    await session.command('mode', 'plan')

    await session.prompt('write it')

    expect(writes).toEqual([])
    expect(JSON.stringify(writerModel.calls[1].messages)).toContain(
      'This tool is not allowed in plan mode.',
    )
    await host.close()
  })
})
