import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  createPluginEvent,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { AgentRegistry } from '../src/agents'
import { mountPlugins } from '../src/plugins'
import { mockAdapter, text, toolCall } from './helpers'
import type { AgentActions, HarnessRunContext } from '../src'

const painter = defineAgent({
  name: 'painter',
  description: 'Paints',
  produces: 'image',
  inputSchema: z.object({ subject: z.string() }),
  run: async (ctx) => `a painting of ${ctx.input.subject}`,
})

describe('ctx.agents inside a session', () => {
  it('lists, gets, finds, and starts agents', async () => {
    const director = definePlugin({
      name: 'test/director',
      setup: (ctx) => ({
        commands: {
          survey: defineCommand({
            description: 'Look at the agents',
            run: () => ({
              names: ctx.agents.list().map((agent) => agent.name),
              byName: ctx.agents.get('painter')?.description,
              byOutput: ctx.agents.find({ produces: 'image' })?.name,
              none: ctx.agents.find({ produces: 'video' }),
            }),
          }),
          paint: defineCommand({
            description: 'Start the painter by name, then by value',
            run: async () => [
              await ctx.agents.start('painter', { subject: 'rain' }),
              await ctx.agents.start(
                painter,
                { subject: 'sun' },
                { startTurnWhenDone: false },
              ),
            ],
          }),
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agents',
        adapter: mockAdapter([]).adapter,
        agents: [painter],
        plugins: () => [director],
      }),
      {
        threadId: 't',
      },
    )
    expect(await session.runCommand({ name: 'survey' })).toEqual({
      names: ['painter'],
      byName: 'Paints',
      byOutput: 'painter',
      none: undefined,
    })
    expect(await session.runCommand({ name: 'paint' })).toEqual([
      'a painting of rain',
      'a painting of sun',
    ])
    await host.close()
  })

  it('throws for a parent that names no running agent run of this session', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/agents',
      adapter: mockAdapter([]).adapter,
      agents: [painter],
    })
    const session = await host.open(harness, { threadId: 't' })
    const other = await host.open(harness, { threadId: 't2' })
    const ended = session.agents.painter.start(
      { subject: 'rain' },
      { addResultNote: false },
    )
    await ended
    const foreign = other.agents.painter.start(
      { subject: 'sun' },
      { addResultNote: false },
    )
    await foreign

    for (const runId of ['unknown-run', ended.id, foreign.id]) {
      expect(() =>
        session.agents.painter.start(
          { subject: 'snow' },
          { addResultNote: false, parent: { runId } },
        ),
      ).toThrow(
        `parent names no running agent run of this session (${runId}). Pass parent: null for a root run.`,
      )
    }
    await host.close()
  })

  it('starts a top-level run for a parent that is a running turn', async () => {
    let agents: AgentActions | undefined
    const director = definePlugin({
      name: 'test/director',
      setup: (ctx) => {
        agents = ctx.agents
      },
    })
    const paint = toolDefinition({
      name: 'paint',
      description: 'Paints from a tool of the main model',
      inputSchema: z.object({}),
    }).server<HarnessRunContext>(async (_args, ctx) =>
      agents?.run(painter, { subject: 'fog' }, { parent: ctx.context.run }),
    )
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agents',
        adapter: mockAdapter([
          () => toolCall('paint', {}),
          () => text('Painted.'),
        ]).adapter,
        agents: [painter],
        tools: [paint],
        plugins: () => [director],
      }),
      { threadId: 't' },
    )

    expect((await session.send('paint fog')).text).toBe('Painted.')
    const [run] = session.agentRuns()
    expect(run).toMatchObject({ status: 'completed' })
    expect(run?.parentRunId).toBeUndefined()
    await host.close()
  })
})

describe('plugin services outside a session', () => {
  it('ignores events and config, and refuses session-only services', async () => {
    const ping = createPluginEvent<number>('test/ping')
    let checks: Record<string, unknown> = {}
    const probe = definePlugin({
      name: 'test/probe',
      setup: (ctx) => {
        const stop = ctx.on(ping, () => {})
        stop()
        ctx.emit(ping, 1)
        const refused = (call: () => unknown) => {
          try {
            call()
            return 'ran'
          } catch (error) {
            return error instanceof Error ? error.message : String(error)
          }
        }
        checks = {
          config: ctx.config.get('anything'),
          state: refused(() => ctx.state({})),
          credentials: refused(() => ctx.credentials.get('x')),
          session: refused(() => ctx.session.snapshot()),
          run: refused(() => ctx.agents.run('painter')),
          start: refused(() => ctx.agents.start('painter')),
          group: refused(() => ctx.agents.group({}, () => [])),
        }
        return {}
      },
    })
    await mountPlugins([probe], {
      threadId: 't',
      registry: new AgentRegistry(),
      harnessTools: [],
      harnessProvides: [],
    })
    expect(checks.config).toBeUndefined()
    for (const key of [
      'state',
      'credentials',
      'session',
      'run',
      'start',
      'group',
    ]) {
      expect(checks[key]).toContain('only available inside a harness session')
    }
  })
})
