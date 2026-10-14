import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  checkConfigValue,
  configOption,
  createHarnessHost,
  createPluginEvent,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { gate, mockAdapter, text } from './helpers'
import type { SessionEvent } from '../src'

const settings = definePlugin({
  name: 'test/settings',
  setup: () => ({
    config: {
      level: configOption.select({ options: ['low', 'high'], default: 'low' }),
      verbose: configOption.boolean({ default: false }),
      label: configOption.text({ default: 'none' }),
      retries: configOption.number({ default: 1, min: 0, max: 5 }),
    },
  }),
})

describe('config values', () => {
  it('checks every option type and its limits', () => {
    const number = configOption.number({ default: 1, min: 0, max: 5 })
    expect(() => checkConfigValue('n', number, 'x')).toThrow('a number')
    expect(() => checkConfigValue('n', number, Number.NaN)).toThrow('a number')
    expect(() => checkConfigValue('n', number, -1)).toThrow('>= 0')
    expect(() => checkConfigValue('n', number, 6)).toThrow('<= 5')
    expect(checkConfigValue('n', configOption.number({ default: 1 }), 99)).toBe(
      99,
    )
    expect(() =>
      checkConfigValue('b', configOption.boolean({ default: false }), 'yes'),
    ).toThrow('true or false')
    expect(() =>
      checkConfigValue('t', configOption.text({ default: '' }), 1),
    ).toThrow('expects text')
    expect(() => configOption.select({ options: ['a'], default: 'b' })).toThrow(
      'is not an option',
    )
  })

  it('rejects unknown keys and bad values, and loads saved values in a new session', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.metadata.set('harness:config', 't', {
      verbose: 'not a boolean',
      gone: 'old key',
    })
    const { adapter } = mockAdapter([])
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/config',
      adapter,
      plugins: () => [settings],
    })
    const session = await host.open(harness, { threadId: 't' })
    // The saved values were invalid or unknown, so the defaults apply.
    expect(session.config().verbose?.value).toBe(false)
    expect(await session.setConfig({ key: 'missing', value: 1 })).toMatchObject(
      {
        status: 'rejected',
        reason: 'unknown_config',
      },
    )
    expect(await session.setConfig({ key: 'retries', value: 9 })).toMatchObject(
      {
        status: 'rejected',
        reason: expect.stringContaining('<= 5'),
      },
    )
    expect(
      (await session.setConfig({ key: 'level', value: 'high' })).status,
    ).toBe('accepted')
    expect(
      (await session.setConfig({ key: 'label', value: 'mine' })).status,
    ).toBe('accepted')
    await host.close()

    const again = createHarnessHost({ persistence })
    const reopened = await again.open(harness, { threadId: 't' })
    expect(reopened.config()).toMatchObject({
      level: { value: 'high', owner: 'test/settings' },
      label: { value: 'mine' },
      retries: { value: 1 },
    })
    await again.close()
  })
})

describe('commands', () => {
  it('lists commands with input schemas and reports failures', async () => {
    const release = gate()
    const tools = definePlugin({
      name: 'test/commands',
      setup: () => ({
        commands: {
          greet: defineCommand({
            description: 'Greet someone',
            input: z.object({ name: z.string() }),
            run: (input) => `hello ${input.name}`,
          }),
          boom: defineCommand({
            description: 'Throws',
            run: () => {
              throw new Error('command broke')
            },
          }),
          wait: defineCommand({
            description: 'Waits until stopped',
            run: (_input, ctx) =>
              new Promise((_resolve, reject) => {
                ctx.signal.addEventListener('abort', () =>
                  reject(new Error('stopped')),
                )
                release.open()
              }),
          }),
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/cmds',
        adapter: mockAdapter([]).adapter,
        plugins: () => [tools],
      }),
      { threadId: 't' },
    )
    const listed = session.commands()
    expect(listed.find((command) => command.name === 'greet')).toMatchObject({
      owner: 'test/commands',
      input: { type: 'object' },
    })
    expect(
      listed.find((command) => command.name === 'boom')?.input,
    ).toBeUndefined()

    expect(await session.command('greet', { name: 'Ada' })).toBe('hello Ada')
    await expect(session.command('greet', { name: 1 })).rejects.toThrow(
      'Input validation failed for command greet',
    )
    await expect(session.command('nope')).rejects.toThrow(
      'Unknown command: nope',
    )
    await expect(session.command('boom')).rejects.toThrow('command broke')

    const waiting = session.command('wait')
    await release.opened
    await waiting.cancel()
    await waiting.then(
      () => undefined,
      () => undefined,
    )
    expect(waiting.status()).toBe('cancelled')
    await host.close()
  })
})

describe('questions', () => {
  it('asks with a schema, checks answers, and rejects open questions on close', async () => {
    const asker = definePlugin({
      name: 'test/asker',
      setup: (ctx) => ({
        commands: {
          pick: defineCommand({
            description: 'Pick a number',
            run: async () => {
              const answer = await ctx.session.ask({
                message: 'How many?',
                schema: z.object({ count: z.number() }),
              })
              return answer.count * 2
            },
          }),
          open: defineCommand({
            description: 'Asks and never gets an answer',
            run: () => ctx.session.ask({ message: 'Still there?' }),
          }),
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/questions',
        adapter: mockAdapter([]).adapter,
        plugins: () => [asker],
      }),
      { threadId: 't' },
    )
    const picking = session.command('pick')
    await vi.waitFor(() =>
      expect(session.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = session.snapshot().pendingQuestions
    expect(question).toMatchObject({
      message: 'How many?',
      schema: { type: 'object' },
    })
    expect(
      await session.answer({ questionId: 'q-unknown', value: 1 }),
    ).toMatchObject({
      status: 'rejected',
      reason: 'unknown_question',
    })
    expect(
      await session.answer({
        questionId: question?.questionId ?? '',
        value: { count: 'two' },
      }),
    ).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('Invalid answer'),
    })
    expect(
      (
        await session.answer({
          questionId: question?.questionId ?? '',
          value: { count: 2 },
        })
      ).status,
    ).toBe('accepted')
    expect(await picking).toBe(4)

    const open = session.command('open')
    await vi.waitFor(() =>
      expect(session.snapshot().pendingQuestions).toHaveLength(1),
    )
    await session.close()
    await expect(open).rejects.toThrow('Session closed.')
    await host.close()
  })
})

describe('plugin state and events', () => {
  const counter = createPluginEvent<number>('test/count')

  function statePlugin(onValue: (value: number) => void) {
    return definePlugin({
      name: 'test/state',
      setup: (ctx) => {
        const state = ctx.state({ count: 0 })
        const stop = ctx.on(counter, () => {
          throw new Error('a listener that throws is ignored')
        })
        ctx.on(counter, onValue)
        return {
          commands: {
            bump: defineCommand({
              description: 'Add one',
              run: async () => {
                const next = await state.update((value) => ({
                  count: value.count + 1,
                }))
                ctx.emit(counter, next.count)
                stop()
                return (await state.get()).count
              },
            }),
          },
        }
      },
    })
  }

  it('keeps state with a plain metadata store and with none', async () => {
    const base = memoryPersistence()
    const plain = {
      ...base,
      stores: {
        ...base.stores,
        metadata: {
          get: (namespace: string, key: string) =>
            base.stores.metadata.get(namespace, key),
          set: (namespace: string, key: string, value: unknown) =>
            base.stores.metadata.set(namespace, key, value),
        },
      },
    }
    const none = { ...base, stores: { ...base.stores, metadata: undefined } }
    for (const persistence of [plain, none]) {
      const seen: Array<number> = []
      const host = createHarnessHost({ persistence: persistence as never })
      const session = await host.open(
        defineHarness({
          name: 'test/state-store',
          adapter: mockAdapter([]).adapter,
          plugins: () => [statePlugin((value) => seen.push(value))],
        }),
        { threadId: 't' },
      )
      expect(await session.command('bump')).toBe(1)
      expect(await session.command('bump')).toBe(2)
      expect(seen).toEqual([1, 2])
      await host.close()
    }
  })

  it('gives up after five conflicting updates', async () => {
    const base = memoryPersistence()
    const conflicting = {
      ...base,
      stores: {
        ...base.stores,
        metadata: {
          get: async () => null,
          set: async () => {},
          getVersioned: async () => ({ value: { count: 0 }, revision: 'r1' }),
          setIf: async () => ({ ok: false }),
        },
      },
    }
    const host = createHarnessHost({ persistence: conflicting as never })
    const session = await host.open(
      defineHarness({
        name: 'test/state-conflict',
        adapter: mockAdapter([]).adapter,
        plugins: () => [statePlugin(() => {})],
      }),
      { threadId: 't' },
    )
    await expect(session.command('bump')).rejects.toThrow(
      'state update conflicted 5 times',
    )
    await host.close()
  })
})

describe('the plugin session API and inspect', () => {
  it('reads and replaces the transcript, prompts, and describes the session', async () => {
    let api: any
    const probe = definePlugin({
      name: 'test/probe',
      setup: (ctx) => {
        api = ctx.session
        return {
          tools: [
            toolDefinition({ name: 'ping', description: 'Ping' }).server(
              async () => 'pong',
            ),
          ],
          prompts: ['Be brief.'],
        }
      },
    })
    const { adapter, calls } = mockAdapter([
      () => text('first'),
      () => text('from the plugin prompt'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/api',
        adapter,
        plugins: () => [probe, settings],
      }),
      { threadId: 't', principal: { id: 'u1' } },
    )
    expect(api.threadId).toBe('t')
    expect(api.principal).toEqual({ id: 'u1' })
    await session.prompt('hello')
    expect(
      (await api.transcript()).map((m: { content: string }) => m.content),
    ).toEqual(['hello', 'first'])
    await api.replaceTranscript([{ role: 'user', content: 'replaced' }])
    expect(await api.transcript()).toEqual([
      { role: 'user', content: 'replaced' },
    ])
    api.prompt('queued by a plugin')
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    await vi.waitFor(() => expect(api.snapshot().status).toBe('idle'))
    expect(JSON.stringify(calls[1].messages)).toContain('replaced')

    const inspected = session.inspect()
    expect(inspected.plugins.map((plugin) => plugin.name)).toEqual([
      'test/probe',
      'test/settings',
    ])
    expect(inspected.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'ping' })]),
    )
    expect(inspected.config.map((entry) => entry.key)).toContain('retries')
    await host.close()
  })
})

describe('session events', () => {
  it('publishes config changes', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/events',
        adapter: mockAdapter([]).adapter,
        plugins: () => [settings],
      }),
      { threadId: 't' },
    )
    const seen: Array<SessionEvent> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({
        from: '0',
        signal: controller.signal,
      }))
        seen.push(entry)
    })()
    await session.setConfig({ key: 'verbose', value: true })
    await vi.waitFor(() =>
      expect(
        seen.some(
          (entry) =>
            entry.event.type === EventType.CUSTOM &&
            entry.event.value !== null &&
            typeof entry.event.value === 'object' &&
            'key' in entry.event.value &&
            entry.event.value.key === 'verbose',
        ),
      ).toBe(true),
    )
    controller.abort()
    await reading
    await host.close()
  })
})
