import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { HarnessPlugin, HarnessRunContext } from '../src'
import type { Reply } from './helpers'

/** Calls `who` once, then answers after the tool result. */
const callWho: Reply = (options) =>
  options.messages.at(-1)?.role === 'tool' ? text('done') : toolCall('who', {})

/** A host plugin that counts its setups and its cleanups. */
function countedPlugin() {
  const counts = { setups: 0, disposed: 0 }
  const seen: Array<string | undefined> = []
  const plugin = definePlugin({
    name: 'test/shared',
    lifetime: 'host',
    setup: async (ctx) => {
      counts.setups += 1
      await ctx.resources.acquire(
        () => 'pool',
        () => {
          counts.disposed += 1
        },
      )
      return {
        tools: [
          toolDefinition({
            name: 'who',
            description: 'Name the caller',
          }).server<HarnessRunContext>((_input, { context }) => {
            seen.push(context.run.user?.id)
            return 'ok'
          }),
        ],
      }
    },
  })
  return { plugin, counts, seen }
}

function setup(
  plugins: () => ReadonlyArray<HarnessPlugin>,
  closeIdleSessionsAfterMs = 0,
  name = 'test/host-plugins',
) {
  const host = createHarnessHost({
    persistence: memoryPersistence(),
    lifecycle: { closeIdleSessionsAfterMs },
  })
  const harness = defineHarness({
    name,
    adapter: mockAdapter(callWho).adapter,
    plugins,
  })
  return { host, harness }
}

describe('lifetime host', () => {
  it('gives a new harness definition with the same name its own setup', async () => {
    const first = countedPlugin()
    const second = countedPlugin()
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    // Two definitions under one name, with other plugin options, as an app
    // that builds its harness for each request does.
    const define = (plugin: HarnessPlugin) =>
      defineHarness({
        name: 'test/same-name',
        adapter: mockAdapter(callWho).adapter,
        plugins: () => [plugin],
      })

    const a = await host.open(define(first.plugin), { threadId: 'a' })
    const b = await host.open(define(second.plugin), { threadId: 'b' })

    expect(first.counts.setups).toBe(1)
    expect(second.counts.setups).toBe(1)
    await a.close()
    await b.close()
    await host.close()
  })

  it('sets up once for two sessions, and disposes after the last session closes', async () => {
    const { plugin, counts } = countedPlugin()
    const { host, harness } = setup(() => [plugin])

    const first = await host.open(harness, { threadId: 'a' })
    const second = await host.open(harness, { threadId: 'b' })
    expect(counts).toEqual({ setups: 1, disposed: 0 })

    await first.close()
    expect(counts).toEqual({ setups: 1, disposed: 0 })
    await second.close()
    expect(counts).toEqual({ setups: 1, disposed: 1 })

    // The next session sets it up again.
    const third = await host.open(harness, { threadId: 'c' })
    expect(counts).toEqual({ setups: 2, disposed: 1 })
    await third.close()
    await host.close()
  })

  it('gives each plugin object that the factory builds its own setup', async () => {
    const setups: Array<string> = []
    let built = 0
    // A new plugin for each session, as `() => [mcp({...})]` builds one.
    const { host, harness } = setup(() => {
      built += 1
      const own = `plugin-${built}`
      return [
        definePlugin({
          name: 'test/per-session',
          lifetime: 'host',
          setup: () => {
            setups.push(own)
          },
        }),
      ]
    })

    const first = await host.open(harness, { threadId: 'a' })
    const second = await host.open(harness, { threadId: 'b' })

    expect(setups).toHaveLength(2)
    expect(new Set(setups).size).toBe(2)
    await first.close()
    await second.close()
    await host.close()
  })

  it('disposes at host.close() while sessions are open', async () => {
    const { plugin, counts } = countedPlugin()
    const { host, harness } = setup(() => [plugin], 60_000)
    await host.open(harness, { threadId: 'a' })

    await host.close()

    expect(counts).toEqual({ setups: 1, disposed: 1 })
  })

  it('sets up once for each harness name', async () => {
    const { plugin, counts } = countedPlugin()
    const one = setup(() => [plugin], 60_000, 'test/one')
    const other = defineHarness({
      name: 'test/other',
      adapter: mockAdapter(callWho).adapter,
      plugins: () => [plugin],
    })

    await one.host.open(one.harness, { threadId: 'a' })
    // One thread has one harness: the log of a thread is its own.
    await one.host.open(other, { threadId: 'b' })

    expect(counts.setups).toBe(2)
    await one.host.close()
    expect(counts.disposed).toBe(2)
  })

  it('gives its tool the user of the calling run', async () => {
    const { plugin, seen } = countedPlugin()
    const { host, harness } = setup(() => [plugin], 60_000)
    const alice = await host.open(harness, {
      threadId: 'a',
      user: { id: 'alice' },
    })
    const bob = await host.open(harness, {
      threadId: 'b',
      user: { id: 'bob' },
    })

    await alice.send('who am I?')
    await bob.send('who am I?')

    expect(seen).toEqual(['alice', 'bob'])
    await host.close()
  })

  it('still sets up a turn plugin for each turn, and a session plugin for each session', async () => {
    const counts = { host: 0, session: 0, turn: 0 }
    const shared = definePlugin({
      name: 'test/host',
      lifetime: 'host',
      setup: () => {
        counts.host += 1
      },
    })
    const perSession = definePlugin({
      name: 'test/session',
      setup: () => {
        counts.session += 1
      },
    })
    const perTurn = definePlugin({
      name: 'test/turn',
      lifetime: 'turn',
      setup: () => {
        counts.turn += 1
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/lifetimes',
      adapter: mockAdapter(() => text('hi')).adapter,
      plugins: () => [shared, perSession, perTurn],
    })

    for (const threadId of ['a', 'b']) {
      const session = await host.open(harness, { threadId })
      await session.send('one')
      await session.send('two')
    }

    expect(counts).toEqual({ host: 1, session: 2, turn: 4 })
    await host.close()
  })

  it('runs its session part for each session, with that session', async () => {
    const closed: Array<string> = []
    const plugin = definePlugin({
      name: 'test/layered',
      lifetime: 'host',
      setup: () => ({
        session: async (ctx) => {
          await ctx.resources.acquire(
            () => ctx.session.threadId,
            (threadId) => closed.push(threadId),
          )
          return {
            commands: {
              thread: defineCommand({
                description: 'Name the thread',
                run: () => ctx.session.threadId,
              }),
            },
          }
        },
      }),
    })
    const { host, harness } = setup(() => [plugin])
    const first = await host.open(harness, { threadId: 'a' })
    const second = await host.open(harness, { threadId: 'b' })

    await expect(first.runCommand({ name: 'thread' })).resolves.toBe('a')
    await expect(second.runCommand({ name: 'thread' })).resolves.toBe('b')
    await first.close()

    expect(closed).toEqual(['a'])
    await host.close()
  })

  it('sets up again after a setup that failed', async () => {
    let attempts = 0
    const plugin = definePlugin({
      name: 'test/flaky',
      lifetime: 'host',
      setup: () => {
        attempts += 1
        if (attempts === 1) throw new Error('no pool')
      },
    })
    const { host, harness } = setup(() => [plugin])

    await expect(host.open(harness, { threadId: 'a' })).rejects.toThrow(
      'no pool',
    )
    const session = await host.open(harness, { threadId: 'a' })

    expect(attempts).toBe(2)
    await session.close()
    await host.close()
  })
})
