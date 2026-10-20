import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, createCapability, toolDefinition } from '@tanstack/ai'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  configOption,
  createHarnessHost,
  defineHarness,
  definePlugin,
  logIdOf,
} from '../src'
import { canOtherHostTake, mockAdapter, text } from './helpers'
import type { AnyTool, ModelMessage } from '@tanstack/ai'
import type { HarnessConfig, HarnessPersistence } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

function durablePersistence() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

const toolNames = (call: { tools?: ReadonlyArray<AnyTool> }) =>
  (call.tools ?? []).map((tool) => tool.name)

const echo = (name: string) =>
  toolDefinition({
    name,
    description: `The ${name} tool`,
    inputSchema: z.object({}),
  }).server(async () => name)

/** A base adapter and two named models, each with its own calls. */
function models(replies: Array<Reply> = [() => text('ok')]) {
  const base = mockAdapter(() => text('base'))
  const fast = mockAdapter(() => text('fast'))
  const strong = mockAdapter(replies)
  return { base, fast, strong }
}

async function open(
  extras: Omit<HarnessConfig, 'name'> = {},
  persistence: HarnessPersistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const harness = defineHarness({ name: 'test/settings', ...extras })
  const session = await host.open(harness, { threadId: THREAD })
  return { host, harness, session }
}

describe('thread settings', () => {
  it('runs the next turn on the model the settings name', async () => {
    const { base, fast, strong } = models()
    const { host, session } = await open({
      adapter: base.adapter,
      models: { fast: fast.adapter, strong: strong.adapter },
    })

    expect(
      await session.updateThreadSettings({ settings: { model: 'strong' } }),
    ).toMatchObject({
      status: 'accepted',
    })
    expect(session.threadSettings()).toEqual({ model: 'strong' })
    expect((await session.send('Hi.')).text).toBe('ok')
    expect(strong.calls).toHaveLength(1)
    expect(base.calls).toHaveLength(0)

    // `null` clears the field: the harness adapter answers again.
    await session.updateThreadSettings({ settings: { model: null } })
    expect(session.threadSettings()).toEqual({})
    expect((await session.send('Again.')).text).toBe('base')
    await host.close()
  })

  it('puts the settings model after the turn override and before a plugin pick', async () => {
    const { base, fast, strong } = models()
    const override = mockAdapter(() => text('override'))
    const picked = mockAdapter(() => text('picked'))
    const { host, session } = await open({
      adapter: base.adapter,
      models: { fast: fast.adapter, strong: strong.adapter },
      plugins: () => [
        definePlugin({
          name: 'test/picker',
          setup: () => ({ adapter: () => picked.adapter }),
        }),
      ],
    })
    await session.updateThreadSettings({ settings: { model: 'fast' } })

    const overridden = await session.send('One.', {
      overrides: { adapter: override.adapter },
    })
    expect(overridden.text).toBe('override')
    expect((await session.send('Two.')).text).toBe('fast')
    await session.updateThreadSettings({ settings: { model: null } })
    expect((await session.send('Three.')).text).toBe('picked')
    // A removed plugin's pick is left out too.
    await session.updateThreadSettings({
      settings: { plugins: { remove: ['test/picker'] } },
    })
    expect((await session.send('Four.')).text).toBe('base')
    await host.close()
  })

  it('publishes the change, and treats a repeated inputId as the same input', async () => {
    const { adapter } = mockAdapter(() => text('ok'))
    const { host, session } = await open({ adapter })
    const from = session.snapshot().cursor
    const reader = new AbortController()

    const first = await session.updateThreadSettings({
      settings: { instructions: 'Be short.' },
      inputId: 'set-1',
    })
    expect(
      await session.updateThreadSettings({
        settings: { instructions: 'Be short.' },
        inputId: 'set-1',
      }),
    ).toEqual(first)
    expect(
      await session.updateThreadSettings({
        settings: { instructions: 'Be long.' },
        inputId: 'set-1',
      }),
    ).toMatchObject({ status: 'rejected', reason: 'conflict' })
    expect(session.threadSettings()).toEqual({ instructions: 'Be short.' })

    for await (const entry of session.events({ from, signal: reader.signal })) {
      const { event } = entry
      if (
        event.type === EventType.CUSTOM &&
        event.name === HARNESS_EVENTS.settingsChanged
      ) {
        expect(event.value).toEqual({ settings: { instructions: 'Be short.' } })
        reader.abort()
      }
    }
    await host.close()
  })

  it('sends the settings reasoning unless the turn overrides it', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const { host, session } = await open({ adapter })
    await session.updateThreadSettings({ settings: { reasoning: 'high' } })

    await session.send('One.')
    await session.send('Two.', { overrides: { reasoning: 'low' } })
    expect(calls.map((call) => call.reasoning?.level)).toEqual(['high', 'low'])
    await host.close()
  })

  it('adds the instructions as the last system prompt', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const { host, session } = await open({
      adapter,
      systemPrompts: ['You help with code.'],
      plugins: () => [
        definePlugin({
          name: 'test/prompt',
          setup: () => ({ prompts: ['Use tabs.'] }),
        }),
      ],
    })
    await session.updateThreadSettings({
      settings: { instructions: 'Answer in French.' },
    })

    await session.send('Hi.')
    const prompts: Array<unknown> = calls[0].systemPrompts
    expect(JSON.stringify(prompts.at(-1))).toContain('Answer in French.')
    expect(JSON.stringify(prompts)).toContain('Use tabs.')
    await host.close()
  })

  it('keeps an exact tool list, or leaves out named tools', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const { host, session } = await open({
      adapter,
      tools: [echo('alpha'), echo('beta'), echo('gamma')],
    })

    await session.updateThreadSettings({ settings: { tools: ['alpha'] } })
    await session.send('One.')
    await session.updateThreadSettings({
      settings: { tools: { remove: ['alpha'] } },
    })
    await session.send('Two.')
    // A tool of the turn override is kept.
    await session.send('Three.', { overrides: { tools: [echo('delta')] } })

    expect(calls.map(toolNames)).toEqual([
      ['alpha'],
      ['beta', 'gamma'],
      ['beta', 'gamma', 'delta'],
    ])
    await host.close()
  })

  it('leaves out the tools, prompts, and middleware of a removed plugin', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const seen: Array<string> = []
    const { host, session } = await open({
      adapter,
      plugins: () => [
        definePlugin({
          name: 'acme/notes',
          setup: () => ({
            tools: [echo('note')],
            prompts: ['Keep notes.'],
            middleware: [
              { name: 'notes', onStart: () => void seen.push('notes') },
            ],
          }),
        }),
        definePlugin({
          name: 'acme/search',
          lifetime: 'turn',
          setup: () => ({ tools: [echo('search')], prompts: ['Search.'] }),
        }),
      ],
    })

    await session.send('One.')
    await session.updateThreadSettings({
      settings: { plugins: { remove: ['acme/notes'] } },
    })
    await session.send('Two.')

    expect(calls.map(toolNames)).toEqual([['note', 'search'], ['search']])
    expect(JSON.stringify(calls[1].systemPrompts)).not.toContain('Keep notes.')
    expect(JSON.stringify(calls[1].systemPrompts)).toContain('Search.')
    expect(seen).toEqual(['notes'])
    await host.close()
  })

  it('refuses an unknown model or plugin', async () => {
    const { adapter } = mockAdapter(() => text('ok'))
    const { host, session } = await open({
      adapter,
      models: { fast: adapter },
    })

    expect(
      await session.updateThreadSettings({ settings: { model: 'huge' } }),
    ).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('huge'),
    })
    expect(
      await session.updateThreadSettings({
        settings: { plugins: { remove: ['acme/none'] } },
      }),
    ).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('acme/none'),
    })
    expect(session.threadSettings()).toEqual({})
    await host.close()
  })

  it('refuses to remove a plugin whose capability a turn plugin or a harness middleware requires', async () => {
    const Notes = createCapability<string>()('acme/notes-capability')
    const { adapter } = mockAdapter(() => text('ok'))
    const { host, session } = await open({
      adapter,
      middleware: [{ name: 'audit', requires: [Notes] }],
      plugins: () => [
        definePlugin({
          name: 'acme/notes',
          provides: [Notes],
          setup: (ctx) => void ctx.provide(Notes, 'notes'),
        }),
        definePlugin({
          name: 'acme/search',
          lifetime: 'turn',
          requires: [Notes],
        }),
      ],
    })
    const remove = (names: Array<string>) =>
      session.updateThreadSettings({ settings: { plugins: { remove: names } } })

    expect(await remove(['acme/notes'])).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('plugin acme/search requires'),
    })
    expect(await remove(['acme/notes', 'acme/search'])).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('harness middleware audit requires'),
    })
    expect(session.threadSettings()).toEqual({})
    await host.close()
  })

  it('keeps the settings after a restart', async () => {
    const persistence = durablePersistence()
    const { base, strong } = models([() => text('strong')])
    const harness = defineHarness({
      name: 'test/settings',
      adapter: base.adapter,
      models: { strong: strong.adapter },
    })
    const first = createHarnessHost({ persistence })
    await (
      await first.open(harness, { threadId: THREAD })
    ).updateThreadSettings({
      settings: { model: 'strong', instructions: 'Be short.' },
    })
    await first.close()

    const second = createHarnessHost({ persistence })
    const session = await second.open(harness, { threadId: THREAD })
    expect(session.threadSettings()).toEqual({
      model: 'strong',
      instructions: 'Be short.',
    })
    expect((await session.send('Hi.')).text).toBe('strong')
    await second.close()
  })
})

describe('the working folder note', () => {
  const sent = (call: { messages: ReadonlyArray<ModelMessage> }) =>
    JSON.stringify(call.messages)

  it('adds no note to a new thread, so the user message comes first', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const { host, session } = await open({ adapter })

    await session.updateThreadSettings({ settings: { cwd: '/repo/app' } })
    await session.send('Hi.')
    const roles = calls[0]?.messages.map(
      (message: ModelMessage) => message.role,
    )
    expect(roles).toEqual(['user'])
    expect(sent(calls[0])).not.toContain('working folder')
    await host.close()
  })

  it('tells the next model call when the working folder changes', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const { host, session } = await open({ adapter })

    await session.send('First.')
    await session.updateThreadSettings({ settings: { cwd: '/repo/app' } })
    await session.send('Hi.')
    expect(sent(calls[1])).toContain(
      'The working folder is now /repo/app. Paths are relative to it.',
    )
    // The note is in the saved transcript, so it survives a restart.
    expect(JSON.stringify(await session.transcript())).toContain(
      'The working folder is now /repo/app.',
    )
    await host.close()
  })

  it('adds no note when the working folder stays the same', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const { host, session } = await open({ adapter })

    await session.send('First.')
    await session.updateThreadSettings({ settings: { cwd: '/repo/app' } })
    await session.updateThreadSettings({ settings: { cwd: '/repo/app' } })
    await session.updateThreadSettings({
      settings: { instructions: 'Be short.' },
    })
    await session.send('Hi.')
    expect(sent(calls[1]).split('The working folder is now')).toHaveLength(2)
    await host.close()
  })

  it('tells the model when the working folder is cleared', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const { host, session } = await open({ adapter })

    await session.updateThreadSettings({ settings: { cwd: null } })
    await session.send('Hi.')
    expect(sent(calls[0])).not.toContain('working folder')

    await session.updateThreadSettings({ settings: { cwd: '/repo/app' } })
    await session.updateThreadSettings({ settings: { cwd: null } })
    await session.send('Again.')
    expect(sent(calls[1])).toContain(
      'The working folder is the default folder again.',
    )
    await host.close()
  })
})

describe('plugin config next to the settings', () => {
  it('keeps plugin config and the settings apart', async () => {
    const { adapter } = mockAdapter(() => text('ok'))
    const { host, session } = await open({
      adapter,
      plugins: () => [
        definePlugin({
          name: 'test/tone',
          setup: () => ({
            config: {
              tone: configOption.select({
                options: ['plain', 'warm'],
                default: 'plain',
              }),
            },
          }),
        }),
      ],
    })
    await session.setPluginSetting({ key: 'tone', value: 'warm' })
    await session.updateThreadSettings({
      settings: { instructions: 'Be brief.' },
    })
    expect(session.pluginSettings().tone?.value).toBe('warm')
    expect(session.threadSettings()).toEqual({ instructions: 'Be brief.' })
    await host.close()
  })
})

describe('thread settings on two hosts', () => {
  it('keeps the change of the other host, and a turn uses it', async () => {
    const logState = memoryLogState()
    const model = mockAdapter(() => text('ok'))
    const harness = defineHarness({
      name: 'test/settings',
      adapter: model.adapter,
    })
    const hostOn = () =>
      createHarnessHost({
        persistence: { stores: { log: memoryLogStore({ state: logState }) } },
      })
    const hostA = hostOn()
    const hostB = hostOn()
    const a = await hostA.open(harness, { threadId: THREAD })
    const b = await hostB.open(harness, { threadId: THREAD })

    await a.updateThreadSettings({ settings: { reasoning: 'high' } })
    // A gives the log back, so B owns it for its change.
    const store = memoryLogStore({ state: logState })
    await vi.waitFor(
      async () =>
        expect(await canOtherHostTake(store, logIdOf({ logId: THREAD }))).toBe(
          true,
        ),
      { timeout: 5_000 },
    )
    expect(
      await b.updateThreadSettings({
        settings: { instructions: 'Answer in French.' },
      }),
    ).toMatchObject({ status: 'accepted' })

    // Each host reads the change of the other one from the log.
    const both = { reasoning: 'high', instructions: 'Answer in French.' }
    for (const session of [a, b]) {
      await vi.waitFor(() => expect(session.threadSettings()).toEqual(both), {
        timeout: 5_000,
      })
    }
    await b.send('Hello.')
    expect(model.calls.map((call) => call.reasoning?.level)).toEqual(['high'])
    await hostA.close()
    await hostB.close()
  })
})
