import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  configOption,
  createExtensionPoint,
  createHarnessHost,
  createPluginEvent,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'

describe('extension points', () => {
  it('lets one plugin read what others contribute, in any order', async () => {
    const Rules = createExtensionPoint<{ tool: string }>('test/rules')
    let read: ReadonlyArray<{ tool: string }> = []
    const reader = definePlugin({
      name: 'test/reader',
      setup: (ctx) => {
        const rules = ctx.collect(Rules)
        return {
          commands: {
            rules: defineCommand({
              description: 'List rules',
              run: () => (read = [...rules]),
            }),
          },
        }
      },
    })
    const writerA = definePlugin({
      name: 'test/a',
      setup: () => ({ contribute: [Rules.item({ tool: 'write_file' })] }),
    })
    const writerB = definePlugin({
      name: 'test/b',
      setup: () => ({ contribute: [Rules.item({ tool: 'bash' })] }),
    })
    const { adapter } = mockAdapter([])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/ext',
        adapter,
        plugins: () => [reader, writerA, writerB],
      }),
      { threadId: 't' },
    )
    await session.command('rules')
    expect(read).toEqual([{ tool: 'write_file' }, { tool: 'bash' }])
    expect(session.inspect().extensionPoints['test/rules']).toEqual([
      'test/a',
      'test/b',
    ])
    await host.close()
  })
})

describe('events and state', () => {
  it('delivers typed events and keeps plugin state', async () => {
    const added = createPluginEvent<{ id: string }>('todo.added')
    const heard: Array<string> = []
    const todos = definePlugin({
      name: 'test/todos',
      setup: (ctx) => {
        const state = ctx.state<{ items: Array<string> }>({ items: [] })
        return {
          commands: {
            add: defineCommand({
              description: 'Add a todo',
              input: z.object({ text: z.string() }),
              run: async ({ text: item }) => {
                const next = await state.update((current) => ({
                  items: [...current.items, item],
                }))
                ctx.emit(added, { id: item })
                return next.items.length
              },
            }),
          },
        }
      },
    })
    const listener = definePlugin({
      name: 'test/listener',
      setup: (ctx) => {
        ctx.on(added, (value) => heard.push(value.id))
      },
    })
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/state',
        adapter,
        plugins: () => [todos, listener],
      }),
      { threadId: 't' },
    )

    const seen: Array<StreamChunk> = []
    const reader = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: reader.signal }))
        seen.push(entry.event)
    })()

    expect(await session.command('add', { text: 'milk' })).toBe(1)
    expect(await session.command('add', { text: 'eggs' })).toBe(2)
    await expect(session.command('add', { text: 3 })).rejects.toThrow(
      'Input validation failed',
    )
    expect(heard).toEqual(['milk', 'eggs'])
    expect(
      await persistence.stores.metadata.get('plugin:test/todos', 't'),
    ).toEqual({
      items: ['milk', 'eggs'],
    })

    await vi.waitFor(() =>
      expect(
        seen.some((event) => event.type === EventType.STATE_SNAPSHOT),
      ).toBe(true),
    )
    reader.abort()
    await reading
    expect(
      seen.some(
        (event) =>
          event.type === EventType.CUSTOM &&
          event.name === HARNESS_EVENTS.pluginEvent,
      ),
    ).toBe(true)
    await host.close()
  })
})

describe('session config', () => {
  it('validates, persists, and applies settings at the next turn', async () => {
    const seenThinking: Array<unknown> = []
    const thinking = definePlugin({
      name: 'test/thinking',
      setup: (ctx) => ({
        config: {
          thinking: configOption.select({
            options: ['off', 'low', 'high'],
            default: 'low',
          }),
        },
        middleware: [
          {
            name: 'test/read-thinking',
            onStart: () => void seenThinking.push(ctx.config.get('thinking')),
          },
        ],
      }),
    })
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      () => text('a'),
      () => text('b'),
      () => text('c'),
    ])
    const harness = defineHarness({
      name: 'test/config',
      adapter,
      plugins: () => [thinking],
    })
    const host = createHarnessHost({ persistence })
    const session = await host.open(harness, { threadId: 't' })

    await session.prompt('one')
    expect(await session.setConfig('thinking', 'extreme')).toMatchObject({
      status: 'rejected',
    })
    expect(await session.setConfig('missing', 1)).toMatchObject({
      reason: 'unknown_config',
    })
    expect(await session.setConfig('thinking', 'high')).toMatchObject({
      status: 'accepted',
    })
    await session.prompt('two')
    expect(seenThinking).toEqual(['low', 'high'])
    expect(session.config().thinking).toMatchObject({
      value: 'high',
      owner: 'test/thinking',
    })
    await host.close()

    // A new host reads the saved setting.
    const again = await createHarnessHost({ persistence }).open(harness, {
      threadId: 't',
    })
    expect(again.config().thinking?.value).toBe('high')
    await again.close()
  })
})

describe('commands and questions', () => {
  it('asks the user inside a command and continues with the answer', async () => {
    const deploy = definePlugin({
      name: 'test/deploy',
      setup: () => ({
        commands: {
          deploy: defineCommand({
            description: 'Deploy after a confirmation',
            run: async (_input, ctx) => {
              const sure = await ctx.session.ask({
                message: 'Deploy to production?',
                schema: z.boolean(),
              })
              return sure ? 'deployed' : 'skipped'
            },
          }),
        },
      }),
    })
    const { adapter } = mockAdapter([])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({ name: 'test/ask', adapter, plugins: () => [deploy] }),
      { threadId: 't' },
    )

    const running = session.command('deploy')
    await vi.waitFor(() =>
      expect(session.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = session.snapshot().pendingQuestions
    expect(question?.message).toBe('Deploy to production?')
    expect(
      await session.answer(question!.questionId, 'yes please'),
    ).toMatchObject({
      status: 'rejected',
    })
    expect(await session.answer(question!.questionId, true)).toMatchObject({
      status: 'accepted',
    })
    await expect(running).resolves.toBe('deployed')
    expect(session.commands().map((command) => command.name)).toEqual([
      'deploy',
    ])
    await host.close()
  })

  it('rejects two plugins with the same command or config key', async () => {
    const make = (name: string) =>
      definePlugin({
        name,
        setup: () => ({
          commands: { same: defineCommand({ description: 'x', run: () => 1 }) },
        }),
      })
    const { adapter } = mockAdapter([])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    await expect(
      host.open(
        defineHarness({
          name: 'test/dup-cmd',
          adapter,
          plugins: () => [make('test/one'), make('test/two')],
        }),
        {
          threadId: 't',
        },
      ),
    ).rejects.toThrow(
      'Duplicate command "same": first owner test/one, second owner test/two',
    )
  })
})

describe('adapter override and credentials', () => {
  it('lets a plugin pick the main adapter and read credentials', async () => {
    const main = mockAdapter([() => text('from main')])
    const other = mockAdapter([() => text('from other')])
    let token: string | undefined
    const picker = definePlugin({
      name: 'test/picker',
      setup: (ctx) => ({
        adapter: () =>
          ctx.config.get('model') === 'other' ? other.adapter : undefined,
        config: {
          model: configOption.select({
            options: ['main', 'other'],
            default: 'main',
          }),
        },
        commands: {
          token: defineCommand({
            description: 'Read the GitHub token',
            run: async () => {
              const credential = await ctx.credentials.require('github')
              token =
                credential.type === 'oauth'
                  ? credential.accessToken
                  : credential.value
              return 'ok'
            },
          }),
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/pick',
        adapter: main.adapter,
        plugins: () => [picker],
      }),
      { threadId: 't', principal: { id: 'user-1' } },
    )

    await session.setConfig('model', 'other')
    expect(await session.prompt('hi')).toEqual({ text: 'from other' })
    expect(main.calls).toHaveLength(0)

    await expect(session.command('token')).rejects.toThrow(
      'Sign in to github first',
    )
    expect(token).toBeUndefined()
    await host.close()
  })
})
