import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { createSessionView } from '../src/view'
import { mockAdapter } from './helpers'
import type {
  HarnessHost,
  HarnessPlugin,
  PluginCommands,
  SessionEvent,
} from '../src'

const hosts: Array<HarnessHost> = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()))
})

/** A command that answers `text`. */
const say = (text: string) =>
  defineCommand({ description: `Says ${text}`, run: () => text })

/**
 * A plugin that keeps its `ctx.commands` for the test, with one command from
 * its setup result when `fixed` is set.
 */
function capture(name: string, fixed?: string) {
  let commands: PluginCommands | undefined
  const plugin = definePlugin({
    name,
    setup: (ctx) => {
      commands = ctx.commands
      return fixed ? { commands: { [fixed]: say(`${name} ran`) } } : {}
    },
  })
  const live = () => {
    if (!commands) throw new Error(`${name} is not set up`)
    return commands
  }
  return { plugin, live }
}

async function open(...plugins: Array<HarnessPlugin>) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  hosts.push(host)
  const session = await host.open(
    defineHarness({
      name: 'test/live-commands',
      adapter: mockAdapter([]).adapter,
      plugins: () => plugins,
    }),
    { threadId: 't' },
  )
  const names = () => session.commands().map((command) => command.name)
  return { session, names }
}

describe('ctx.commands', () => {
  it('adds a command that the session lists and runs, then removes it', async () => {
    const live = capture('test/live')
    const { session, names } = await open(live.plugin)

    live.live().set('hello', say('hi'))
    expect(names()).toContain('hello')
    expect(
      session.describe().commands.find((command) => command.name === 'hello'),
    ).toMatchObject({ owner: 'test/live', description: 'Says hi' })
    expect(await session.command('hello')).toBe('hi')

    live.live().delete('hello')
    expect(names()).not.toContain('hello')
    await expect(session.command('hello')).rejects.toThrow(
      'Unknown command: hello',
    )
  })

  it('keeps the commands of other plugins', async () => {
    const other = capture('test/other', 'model')
    const live = capture('test/live')
    const { session } = await open(other.plugin, live.plugin)

    expect(live.live().has('model')).toBe(true)
    expect(() => live.live().set('model', say('taken'))).toThrow(
      'Command "model" belongs to test/other. test/live cannot replace it.',
    )
    live.live().delete('model')
    expect(await session.command('model')).toBe('test/other ran')
  })

  it('is ready after the plugins that come later are set up', async () => {
    const seen: { atSetup?: boolean; atReady?: boolean } = {}
    const early = definePlugin({
      name: 'test/early',
      setup: (ctx) => {
        seen.atSetup = ctx.commands.has('later')
        void ctx.commands.ready.then(() => {
          seen.atReady = ctx.commands.has('later')
        })
      },
    })
    await open(early, capture('test/later', 'later').plugin)

    await vi.waitFor(() => expect(seen.atReady).toBe(true))
    expect(seen.atSetup).toBe(false)
  })

  it('tells the session feed when the commands change', async () => {
    const live = capture('test/live')
    const { session } = await open(live.plugin)
    const seen: Array<SessionEvent> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({
        from: '0',
        signal: controller.signal,
      }))
        seen.push(entry)
    })()

    live.live().set('hello', say('hi'))
    await vi.waitFor(() =>
      expect(
        seen.some(
          (entry) =>
            entry.event.type === EventType.CUSTOM &&
            entry.event.name === HARNESS_EVENTS.commandsChanged,
        ),
      ).toBe(true),
    )
    controller.abort()
    await reading
  })

  it('updates a session view when a command comes and goes', async () => {
    const live = capture('test/live')
    const { session } = await open(live.plugin)
    const view = createSessionView(session)
    await view.ready
    const viewNames = () =>
      view.store.get().commands.map((command) => command.name)

    live.live().set('hello', say('hi'))
    await vi.waitFor(() => expect(viewNames()).toContain('hello'))
    live.live().delete('hello')
    await vi.waitFor(() => expect(viewNames()).not.toContain('hello'))
    view.dispose()
  })
})
