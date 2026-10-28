import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  checkConfigValue,
  configOption,
  createHarnessHost,
  createPluginEvent,
  defineCommand,
  durableTool,
  defineHarness,
  definePlugin,
} from '../src'
import { compact, modelPicker, todos, usage } from '../src/first-party'
import { fileCommands, projectInstructions } from '../src/first-party/node'
import { loadLogState, logIdOf, sessionOf } from '../src/log'
import {
  after,
  appendToLog,
  gate,
  mockAdapter,
  questionsOf,
  text,
  toolCall,
} from './helpers'
import type { PluginSessionApi, PluginState, SessionEvent } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

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
    await appendToLog(persistence.stores.log, { threadId: 't' }, [
      { type: 'harness.config', key: 'verbose', value: 'not a boolean' },
      { type: 'harness.config', key: 'gone', value: 'old key' },
      { type: 'harness.config', key: 'retries', value: 3 },
    ])
    const { adapter } = mockAdapter([])
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/config',
      adapter,
      plugins: () => [settings],
    })
    const session = await host.open(harness, { threadId: 't' })
    // An invalid or unknown saved value falls back to the default.
    expect(session.pluginSettings().verbose?.value).toBe(false)
    expect(session.pluginSettings().retries?.value).toBe(3)
    expect(session.pluginSettings()).not.toHaveProperty('gone')
    expect(
      await session.setPluginSetting({ key: 'missing', value: 1 }),
    ).toMatchObject({
      status: 'rejected',
      reason: 'unknown_config',
    })
    expect(
      await session.setPluginSetting({ key: 'retries', value: 9 }),
    ).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('<= 5'),
    })
    expect(
      (await session.setPluginSetting({ key: 'level', value: 'high' })).status,
    ).toBe('accepted')
    expect(
      (await session.setPluginSetting({ key: 'label', value: 'mine' })).status,
    ).toBe('accepted')
    await host.close()

    const again = createHarnessHost({ persistence })
    const reopened = await again.open(harness, { threadId: 't' })
    expect(reopened.pluginSettings()).toMatchObject({
      level: { value: 'high', owner: 'test/settings' },
      label: { value: 'mine' },
      retries: { value: 3 },
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
      {
        threadId: 't',
      },
    )
    const listed = session.commands()
    expect(listed.find((command) => command.name === 'greet')).toMatchObject({
      owner: 'test/commands',
      input: { type: 'object' },
    })
    expect(
      listed.find((command) => command.name === 'boom')?.input,
    ).toBeUndefined()

    expect(
      await session.runCommand({ name: 'greet', input: { name: 'Ada' } }),
    ).toBe('hello Ada')
    await expect(
      session.runCommand({ name: 'greet', input: { name: 1 } }),
    ).rejects.toThrow('Input validation failed for command greet')
    await expect(session.runCommand({ name: 'nope' })).rejects.toThrow(
      'Unknown command: nope',
    )
    await expect(session.runCommand({ name: 'boom' })).rejects.toThrow(
      'command broke',
    )

    const waiting = session.runCommand({ name: 'wait' })
    await release.opened
    await waiting.cancel()
    await waiting.then(
      () => undefined,
      () => undefined,
    )
    expect(waiting.status()).toBe('cancelled')
    await host.close()
  })

  it('gives a command without a schema the input as sent, typed unknown', async () => {
    // Defined on their own, with no contextual type from a plugin's `setup`.
    const peek = defineCommand({
      description: 'Reads a field without a check',
      // @ts-expect-error Without a schema, narrow the input before use.
      run: (input) => input.foo,
    })
    const shout = defineCommand({
      description: 'Shouts the text it gets',
      run: (input) =>
        typeof input === 'string' ? input.toUpperCase() : 'no text',
    })
    const raw = definePlugin({
      name: 'test/raw-commands',
      setup: () => ({ commands: { peek, shout } }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/raw-cmds',
        adapter: mockAdapter([]).adapter,
        plugins: () => [raw],
      }),
      {
        threadId: 't',
      },
    )

    expect(
      await session.runCommand({ name: 'peek', input: { foo: 'bar' } }),
    ).toBe('bar')
    expect(await session.runCommand({ name: 'shout', input: 'hi' })).toBe('HI')
    expect(
      await session.runCommand({ name: 'shout', input: { text: 'hi' } }),
    ).toBe('no text')
    await host.close()
  })
})

describe('questions', () => {
  it('asks with a schema, checks answers, and rejects open questions on close', async () => {
    const asker = definePlugin({
      name: 'test/asker',
      setup: () => ({
        commands: {
          pick: defineCommand({
            description: 'Pick a number',
            run: async (_input, { step }) => {
              const answer = await step.ask({
                name: 'count',
                message: 'How many?',
                schema: z.object({ count: z.number() }),
              })
              return answer.count * 2
            },
          }),
          open: defineCommand({
            description: 'Asks and never gets an answer',
            run: (_input, { step }) =>
              step.ask({ name: 'there', message: 'Still there?' }),
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
      {
        threadId: 't',
      },
    )
    const picking = session.runCommand({ name: 'pick' })
    await waitFor(() => expect(questionsOf(session.snapshot())).toHaveLength(1))
    const [question] = questionsOf(session.snapshot())
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

    const open = session.runCommand({ name: 'open' })
    await waitFor(() => expect(questionsOf(session.snapshot())).toHaveLength(1))
    await host.close()
    // The close cancels the command that waits for its answer.
    await expect(open).rejects.toBeDefined()
    expect(open.status()).toBe('cancelled')
    expect(questionsOf(session.snapshot())).toEqual([])
  })

  it('rejects the questions of a turn when the turn is cancelled', async () => {
    let asked: Promise<unknown> | undefined
    const asker = definePlugin({
      name: 'test/turn-asker',
      setup: () => ({
        tools: [
          durableTool(
            toolDefinition({ name: 'confirm', description: 'Ask' }),
            async (_args, { step }) => {
              asked = step.ask({ name: 'sure', message: 'Sure?' })
              return asked
            },
          ),
        ],
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/turn-questions',
        adapter: mockAdapter([() => toolCall('confirm', {})]).adapter,
        plugins: () => [asker],
      }),
      {
        threadId: 't',
      },
    )
    const turn = session.send('Go.')
    await waitFor(() => expect(questionsOf(session.snapshot())).toHaveLength(1))

    await session.cancel({ operationId: turn.id })

    await expect(asked).rejects.toThrow('Cancelled.')
    expect(questionsOf(session.snapshot())).toEqual([])
    await host.close()
  })

  it('rejects the question of a command when the command is cancelled', async () => {
    let asked: Promise<unknown> | undefined
    const asker = definePlugin({
      name: 'test/command-asker',
      setup: () => ({
        commands: {
          confirm: defineCommand({
            description: 'Ask',
            run: (_input, { step }) => {
              asked = step.ask({ name: 'sure', message: 'Sure?' })
              return asked
            },
          }),
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/command-questions',
        adapter: mockAdapter([]).adapter,
        plugins: () => [asker],
      }),
      {
        threadId: 't',
      },
    )
    const command = session.runCommand({ name: 'confirm' })
    await waitFor(() => expect(questionsOf(session.snapshot())).toHaveLength(1))

    await session.cancel({ operationId: command.id })

    await expect(asked).rejects.toThrow('Cancelled.')
    expect(questionsOf(session.snapshot())).toEqual([])
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

  it('keeps state in the log, with no metadata store', async () => {
    const base = memoryPersistence()
    const { metadata: _metadata, ...stores } = base.stores
    const harness = defineHarness({
      name: 'test/state-store',
      adapter: mockAdapter([]).adapter,
      plugins: () => [statePlugin(() => {})],
    })
    const host = createHarnessHost({ persistence: { stores } })
    const session = await host.open(harness, { threadId: 't' })
    expect(await session.runCommand({ name: 'bump' })).toBe(1)
    expect(await session.runCommand({ name: 'bump' })).toBe(2)
    await host.close()

    const again = createHarnessHost({ persistence: { stores } })
    const reopened = await again.open(harness, { threadId: 't' })
    expect(reopened.snapshot().plugins).toEqual({ 'test/state': { count: 2 } })
    expect(await reopened.runCommand({ name: 'bump' })).toBe(3)
    await again.close()
  })

  it('refuses a metadata store with no compare-and-set at the start', () => {
    const base = memoryPersistence()
    const plain = {
      get: (namespace: string, key: string) =>
        base.stores.metadata.get(namespace, key),
      set: (namespace: string, key: string, value: unknown) =>
        base.stores.metadata.set(namespace, key, value),
      delete: (namespace: string, key: string) =>
        base.stores.metadata.delete(namespace, key),
    }
    expect(() =>
      createHarnessHost({
        persistence: { stores: { ...base.stores, metadata: plain } },
      }),
    ).toThrow('stores.metadata needs getVersioned and setIf')
  })

  it('keeps both of two concurrent updates', async () => {
    let state: PluginState<{ count: number }> | undefined
    const host = createHarnessHost({ persistence: memoryPersistence() })
    await host.open(
      defineHarness({
        name: 'test/state-race',
        adapter: mockAdapter([]).adapter,
        plugins: () => [
          definePlugin({
            name: 'test/race',
            setup: (ctx) => {
              state = ctx.state({ count: 0 })
            },
          }),
        ],
      }),
      {
        threadId: 't',
      },
    )
    if (!state) throw new Error('The plugin did not set up.')
    const bump = (value: { count: number }) => ({ count: value.count + 1 })

    await Promise.all([state.update(bump), state.update(bump)])

    expect(await state.get()).toEqual({ count: 2 })
    await host.close()
  })

  it('warns when an async listener rejects', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/async-listener',
        adapter: mockAdapter([]).adapter,
        plugins: () => [
          definePlugin({
            name: 'test/async-listener',
            setup: (ctx) => {
              ctx.on(counter, async () => {
                throw new Error('listener broke')
              })
              return {
                commands: {
                  ping: defineCommand({
                    description: 'Emit',
                    run: () => ctx.emit(counter, 1),
                  }),
                },
              }
            },
          }),
        ],
      }),
      {
        threadId: 't',
      },
    )
    const warnings: Array<unknown> = []
    session.onEvent(EventType.CUSTOM, ({ event }) => {
      if (event.name === 'harness.plugin.warning') warnings.push(event.value)
    })

    await session.runCommand({ name: 'ping' })

    await waitFor(() =>
      expect(warnings).toEqual([
        { plugin: 'harness:events', message: 'listener broke' },
      ]),
    )
    await host.close()
  })

  it('loads the saved state of a plugin whose name is an Object key', async () => {
    const persistence = memoryPersistence()
    await appendToLog(persistence.stores.log, { threadId: 't' }, [
      {
        type: 'harness.plugin.state',
        plugin: 'constructor',
        delta: { path: [], value: { saved: true } },
      },
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/state-names',
        adapter: mockAdapter([]).adapter,
        plugins: () => [
          definePlugin({
            name: 'constructor',
            setup: (ctx) => {
              ctx.state({ saved: false })
            },
          }),
        ],
      }),
      {
        threadId: 't',
      },
    )

    expect(session.snapshot().plugins).toEqual({
      constructor: { saved: true },
    })
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
      {
        threadId: 't',
        user: { id: 'u1' },
      },
    )
    expect(api.threadId).toBe('t')
    expect(api.user).toEqual({ id: 'u1' })
    await session.send('hello')
    expect(
      (await api.transcript()).map((m: { content: string }) => m.content),
    ).toEqual(['hello', 'first'])
    await api.replaceTranscript([{ role: 'user', content: 'replaced' }])
    expect(await api.transcript()).toEqual([
      { role: 'user', content: 'replaced' },
    ])
    api.send('queued by a plugin')
    await waitFor(() => expect(calls).toHaveLength(2))
    await waitFor(() => expect(api.snapshot().status).toBe('idle'))
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

describe('first-party plugin edges', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'harness-files-'))
    await mkdir(join(dir, 'commands'))
    await writeFile(
      join(dir, 'commands', 'review.md'),
      '---\ndescription: Review a file\n---\nReview $ARGUMENTS carefully.',
    )
    await writeFile(join(dir, 'commands', 'plain.md'), 'Say hi to $ARGUMENTS.')
    await writeFile(join(dir, 'commands', 'skip.txt'), 'not a command')
    await writeFile(join(dir, 'RULES.md'), 'Use tabs.')
    await writeFile(join(dir, 'EMPTY.md'), '   ')
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('turns markdown files into commands and reads chosen instruction files', async () => {
    const { adapter, calls } = mockAdapter([
      () => text('a'),
      () => text('b'),
      () => text('c'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/files',
        adapter,
        plugins: () => [
          fileCommands({ dir: join(dir, 'commands') }),
          projectInstructions({
            root: dir,
            files: ['RULES.md', 'EMPTY.md', 'NONE.md'],
          }),
        ],
      }),
      {
        threadId: 't',
      },
    )
    const described = session.commands()
    expect(
      described.map((command) => [command.name, command.description]).sort(),
    ).toEqual([
      ['plain', 'Run plain.md'],
      ['review', 'Review a file'],
    ])
    expect(
      await session.runCommand({ name: 'review', input: 'src/a.ts' }),
    ).toBe('Sent /review.')
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    await session.runCommand({ name: 'plain', input: { who: 'Ada' } })
    await waitFor(() => expect(calls).toHaveLength(2))
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    await session.runCommand({ name: 'plain' })
    await waitFor(() => expect(calls).toHaveLength(3))

    // A missing folder gives no commands.
    const empty = await host.open(
      defineHarness({
        name: 'test/files-missing',
        adapter,
        plugins: () => [fileCommands({ dir: join(dir, 'missing') })],
      }),
      {
        threadId: 'empty',
      },
    )
    expect(empty.commands()).toEqual([])

    const said = calls.map((call) => JSON.stringify(call.messages.at(-1)))
    expect(said[0]).toContain('Review src/a.ts carefully.')
    expect(said[1]).toContain('Say hi to {\\"who\\":\\"Ada\\"}.')
    expect(said[2]).toContain('Say hi to .')
    const prompts = JSON.stringify(calls[0].systemPrompts)
    expect(prompts).toContain('Project instructions from RULES.md')
    expect(prompts).not.toContain('EMPTY.md')
    await host.close()
  })

  it('checks todo input and shows an empty list', async () => {
    const { adapter, calls } = mockAdapter([
      () => toolCall('todo_write', { todos: [{ text: 'x', status: 'later' }] }),
      () => text('bad input'),
      () => toolCall('todo_write', { todos: [] }, 'call-2'),
      () => text('cleared'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/todos',
        adapter,
        plugins: () => [todos()],
      }),
      {
        threadId: 't',
      },
    )
    const before = session.snapshot().plugins
    await session.send('plan')
    // chat() checks the tool's JSON Schema before it runs, so an invalid
    // status is a tool error the model sees, and the tool never runs.
    expect(JSON.stringify(calls[1].messages)).toContain(
      'Input validation failed for tool todo_write',
    )
    expect(session.snapshot().plugins).toEqual(before)
    expect(await session.runCommand({ name: 'todos' })).toBe(
      'The todo list is empty.',
    )
    await session.send('clear')
    expect(JSON.stringify(calls[3].messages)).toContain(
      'The todo list is empty.',
    )
    expect(await session.runCommand({ name: 'todos' })).toBe(
      'The todo list is empty.',
    )
    await host.close()
  })

  it('needs a model choice and answers every /model form', async () => {
    expect(() => modelPicker({ choices: {} })).toThrow('at least one choice')
    const fast = mockAdapter([]).adapter
    const smart = mockAdapter([]).adapter
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/models',
        adapter: smart,
        plugins: () => [modelPicker({ choices: { smart, fast } })],
      }),
      {
        threadId: 't',
      },
    )
    expect(await session.runCommand({ name: 'model' })).toBe(
      'Model: smart. Choices: smart, fast.',
    )
    expect(await session.runCommand({ name: 'model', input: 'slow' })).toBe(
      'Unknown model "slow". Choices: smart, fast.',
    )
    expect(
      await session.runCommand({ name: 'model', input: { name: 'fast' } }),
    ).toBe('Model: fast. It applies at the next turn.')
    await host.close()
  })

  it('keeps the conversation when the summary is empty', async () => {
    const summarizer = mockAdapter([() => text('  ')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/compact-empty',
        adapter: mockAdapter([() => text('one'), () => text('two')]).adapter,
        plugins: () => [compact({ adapter: summarizer.adapter })],
      }),
      {
        threadId: 't',
      },
    )
    await session.send('first')
    await session.send('second')
    await expect(session.runCommand({ name: 'compact' })).rejects.toThrow(
      'The summary model returned no text.',
    )
    expect(await session.transcript()).toHaveLength(4)
    await host.close()
  })

  it('keeps short conversations, keeps the last messages, and counts usage', async () => {
    const summarizer = mockAdapter([() => text('the summary')])
    const withUsage = (content: string) =>
      text(content).map((chunk) =>
        chunk.type === EventType.RUN_FINISHED
          ? {
              ...chunk,
              usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
            }
          : chunk,
      )
    const { adapter } = mockAdapter([
      () => withUsage('one'),
      () => withUsage('two'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/compact',
        adapter,
        plugins: () => [
          compact({ adapter: summarizer.adapter, keepLast: 1 }),
          usage(),
        ],
      }),
      {
        threadId: 't',
      },
    )
    expect(await session.runCommand({ name: 'compact' })).toBe(
      'The conversation is already short.',
    )
    await session.send([{ type: 'text', content: 'first question' }] as never)
    await session.send('second question')
    expect(await session.runCommand({ name: 'compact' })).toBe(
      'Compacted 3 messages into a summary.',
    )
    expect(JSON.stringify(summarizer.calls[0].messages)).toContain(
      'first question',
    )
    expect(await session.runCommand({ name: 'usage' })).toBe(
      '2 model calls, 6 input tokens, 4 output tokens, 10 total.',
    )
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
      {
        threadId: 't',
      },
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
    await session.setPluginSetting({ key: 'verbose', value: true })
    await waitFor(() =>
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

describe('the turns that a session plugin starts', () => {
  it('run as the owner, or as the user that the plugin passes, not as the sender of the running turn', async () => {
    let api: PluginSessionApi | undefined
    const notes = definePlugin({
      name: 'test/notes',
      setup: (ctx) => {
        api = ctx.session
      },
    })
    const release = gate()
    const { adapter, calls } = mockAdapter([
      after(release.opened, 'Bea is done.'),
      () => text('One.'),
      () => text('Two.'),
      () => text('Three.'),
    ])
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/notes',
      adapter,
      plugins: () => [notes],
    })
    // Olga opens the thread first, so she owns it.
    await host.open(harness, { threadId: 't', user: { id: 'olga' } })
    const bea = await host.open(harness, {
      threadId: 't',
      user: { id: 'bea' },
    })
    const turn = bea.send('Start a job.')
    await waitFor(() => expect(turn.status()).toBe('running'))
    if (!api) throw new Error('No plugin context.')

    // A job of olga ends while the turn of bea runs.
    await api.note('The job of olga ended.', { wake: true })
    await api.note('The job of carl ended.', {
      wake: true,
      user: { id: 'carl' },
    })
    api.send('Go on, carl.', { user: { id: 'carl' } })
    release.open()
    await turn
    await waitFor(() => expect(calls).toHaveLength(4))

    const state = await loadLogState({
      store: persistence.stores.log,
      logId: logIdOf({ logId: 't' }),
      rootThread: 't',
    })
    const senders = [...sessionOf(state, 't').inputs.values()].map((logged) => [
      logged.input.op,
      logged.user?.id,
    ])
    expect(senders).toEqual([
      ['prompt', 'bea'],
      ['followUp', 'olga'],
      ['followUp', 'carl'],
      ['prompt', 'carl'],
    ])
    await host.close()
  })
})
