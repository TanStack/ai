import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  createPluginEvent,
  defineHarness,
  definePlugin,
} from '../src'
import { after, gate, mockAdapter, text, untilAborted } from './helpers'
import type {
  HarnessHost,
  HarnessPlugin,
  HarnessSession,
  PluginSetupContext,
} from '../src'

const Pinged = createPluginEvent<{}>('test/pinged')

const hosts: Array<HarnessHost> = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()))
})

const helper = defineAgent({
  name: 'helper',
  description: 'Helps',
  run: async () => 'helped',
})

const extra = definePlugin({
  name: 'test/extra',
  setup: () => ({
    tools: [
      toolDefinition({ name: 'extra', description: 'An extra tool' }).server(
        () => 'ok',
      ),
    ],
    agents: [helper],
  }),
})

const toolNames = (call: { tools?: Array<{ name: string }> }) =>
  (call.tools ?? []).map((tool) => tool.name)

/** The values of the `harness.reloaded` events of `session`, as they come. */
function reloadedEvents(session: HarnessSession) {
  const values: Array<unknown> = []
  void (async () => {
    for await (const entry of session.events({ from: '0' })) {
      if (
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === HARNESS_EVENTS.reloaded
      )
        values.push(entry.event.value)
    }
  })()
  return values
}

/** A host with one harness whose plugin list the test can change. */
function setup(replies: Parameters<typeof mockAdapter>[0] = []) {
  const plugins: Array<HarnessPlugin> = []
  const { adapter, calls } = mockAdapter(replies)
  const harness = defineHarness({
    name: 'test/reload',
    adapter,
    plugins: () => [...plugins],
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  hosts.push(host)
  return { plugins, calls, harness, host }
}

describe('session.reload', () => {
  it('sets up the new plugin list: its tools and agents, and keeps the transcript', async () => {
    const { plugins, calls, harness, host } = setup([
      () => text('one'),
      () => text('two'),
    ])
    const session = await host.open(harness, { threadId: 't' })
    const reloaded = reloadedEvents(session)
    await session.send('first')
    expect(toolNames(calls[0])).not.toContain('extra')
    expect(session.agent('helper')).toBeUndefined()

    plugins.push(extra)
    await session.reloadPlugins()

    expect(session.agent('helper')).toBeDefined()
    expect(session.inspect().plugins.map((plugin) => plugin.name)).toEqual([
      'test/extra',
    ])
    await session.send('second')
    expect(toolNames(calls[1])).toContain('extra')
    const contents = (await session.transcript()).map(
      (message) => message.content,
    )
    expect(contents).toEqual(['first', 'one', 'second', 'two'])
    await expect.poll(() => reloaded).toEqual([{}])
  })

  it('tears down the old plugins and drops their agents', async () => {
    const { plugins, harness, host } = setup()
    let closed = 0
    plugins.push(
      definePlugin({
        name: 'test/closing',
        setup: async (ctx) => {
          await ctx.resources.acquire(
            () => 'open',
            () => (closed += 1),
          )
        },
      }),
      extra,
    )
    const session = await host.open(harness, { threadId: 't' })
    expect(session.agent('helper')).toBeDefined()

    plugins.splice(0)
    await session.reloadPlugins()

    expect(closed).toBe(1)
    expect(session.agent('helper')).toBeUndefined()
  })

  it('waits for the running turn to end', async () => {
    const turn = gate()
    const { plugins, calls, harness, host } = setup([
      after(turn.opened, 'slow'),
      () => text('next'),
    ])
    const session = await host.open(harness, { threadId: 't' })
    const running = session.send('first')
    // The model call has started, so the turn runs.
    await expect.poll(() => calls.length).toBe(1)

    plugins.push(extra)
    let reloaded = false
    const reload = session.reloadPlugins().then(() => (reloaded = true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(reloaded).toBe(false)
    expect(session.agent('helper')).toBeUndefined()

    turn.open()
    await running
    await reload
    expect(session.agent('helper')).toBeDefined()
  })

  it('mounts nothing when the session closes while the reload waits', async () => {
    const { plugins, harness, host } = setup([untilAborted()])
    let mounted = 0
    let disposed = 0
    plugins.push(
      definePlugin({
        name: 'test/counted',
        setup: async (ctx) => {
          await ctx.resources.acquire(
            () => (mounted += 1),
            () => (disposed += 1),
          )
        },
      }),
    )
    const session = await host.open(harness, { threadId: 't' })
    const running = session.send('first')
    await running.receipt

    const reload = session.reloadPlugins()
    // The reload waits for the running turn now.
    await new Promise((resolve) => setTimeout(resolve, 10))
    await host.close()
    await reload
    await running.then(
      () => undefined,
      () => undefined,
    )

    expect(mounted).toBe(1)
    expect(disposed).toBe(1)
  })

  it('disposes the session plugins when open fails', async () => {
    const persistence = memoryPersistence()
    let disposed = 0
    const harness = defineHarness({
      name: 'test/open-fails',
      adapter: mockAdapter([]).adapter,
      plugins: () => [
        definePlugin({
          name: 'test/counted',
          setup: async (ctx) => {
            await ctx.resources.acquire(
              () => 'open',
              () => (disposed += 1),
            )
          },
        }),
      ],
    })
    // The index entry is written after the plugins mount.
    vi.spyOn(persistence.stores.sessions, 'upsertIf').mockRejectedValue(
      new Error('index down'),
    )
    const host = createHarnessHost({ persistence })
    hosts.push(host)

    await expect(host.open(harness, { threadId: 't' })).rejects.toThrow(
      'index down',
    )
    expect(disposed).toBe(1)
  })

  it('keeps the session working with no plugins when the new setup throws', async () => {
    const { plugins, calls, harness, host } = setup([() => text('after')])
    plugins.push(extra)
    const session = await host.open(harness, { threadId: 't' })
    const failed = reloadedEvents(session)

    plugins.push(
      definePlugin({
        name: 'test/broken',
        setup: () => {
          throw new Error('broken setup')
        },
      }),
    )
    await expect(session.reloadPlugins()).rejects.toThrow('broken setup')

    expect(session.inspect().plugins).toEqual([])
    expect(session.agent('helper')).toBeUndefined()
    await session.send('still here')
    expect(toolNames(calls[0])).not.toContain('extra')
    await expect.poll(() => failed).toEqual([{ error: 'broken setup' }])
  })
})

describe('ctx.agents.set and ctx.agents.delete', () => {
  it('change the agents of a running session, and guard other owners', async () => {
    const { plugins, harness, host } = setup()
    let agents: PluginSetupContext['agents'] | undefined
    plugins.push(
      extra,
      definePlugin({
        name: 'test/live-agents',
        setup: (ctx) => {
          agents = ctx.agents
        },
      }),
    )
    const session = await host.open(harness, { threadId: 't' })
    if (!agents) throw new Error('not set up')

    const writer = defineAgent({
      name: 'writer',
      description: 'Writes',
      run: async () => 'written',
    })
    agents.set(writer)
    expect(session.agent('writer')).toBeDefined()
    expect(await session.agent('writer')?.run()).toBe('written')

    expect(() => agents?.set(helper)).toThrow(
      'Agent "helper" belongs to test/extra. test/live-agents cannot replace it.',
    )
    agents.delete('helper')
    expect(session.agent('helper')).toBeDefined()

    agents.delete('writer')
    expect(session.agent('writer')).toBeUndefined()
  })
})

describe('host.reload', () => {
  it('reloads every open session of one harness, and not of another', async () => {
    const { plugins, harness, host } = setup()
    const other = defineHarness({
      name: 'test/other',
      adapter: mockAdapter([]).adapter,
      plugins: () => [...plugins],
    })
    const first = await host.open(harness, { threadId: 'a' })
    const second = await host.open(harness, { threadId: 'b' })
    const third = await host.open(other, { threadId: 'c' })

    plugins.push(extra)
    await host.reload(harness)

    expect(first.agent('helper')).toBeDefined()
    expect(second.agent('helper')).toBeDefined()
    expect(third.agent('helper')).toBeUndefined()
  })
})

describe('reload keeps session work', () => {
  it('removes the ctx.on listeners of the old plugins', async () => {
    const { plugins, harness, host } = setup()
    let heard = 0
    let latest: PluginSetupContext | undefined
    plugins.push(
      definePlugin({
        name: 'test/listener',
        setup: (ctx) => {
          latest = ctx
          ctx.on(Pinged, () => (heard += 1))
        },
      }),
    )
    const session = await host.open(harness, { threadId: 't' })
    await session.reloadPlugins()
    await session.reloadPlugins()
    await session.reloadPlugins()

    latest?.emit(Pinged, {})
    expect(heard).toBe(1)
  })
})

describe('ctx.agents.set with subagent', () => {
  it('adds the agent to the subagent tools, and delete removes it', async () => {
    const { plugins, calls, harness, host } = setup([
      () => text('one'),
      () => text('two'),
    ])
    let agents: PluginSetupContext['agents'] | undefined
    plugins.push(
      definePlugin({
        name: 'test/live-subagents',
        setup: (ctx) => {
          agents = ctx.agents
        },
      }),
    )
    const session = await host.open(harness, { threadId: 't' })
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes',
      run: async () => 'written',
    })
    agents?.set(writer, { subagent: true })
    await session.send('first')
    expect(toolNames(calls[0])).toEqual(['writer'])

    agents?.delete('writer')
    await session.send('second')
    expect(toolNames(calls[1])).toEqual([])
    expect(session.agent('writer')).toBeUndefined()
  })
})
