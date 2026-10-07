import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  configOption,
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '../src'
import { workspaceTools } from '../src/first-party/coding'
import { mockAdapter, text, toolCall } from './helpers'
import type { AnyTool, ModelMessage } from '@tanstack/ai'
import type { HarnessConfig, HarnessPersistence } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

function durablePersistence() {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
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

    expect(await session.configure({ model: 'strong' })).toMatchObject({
      status: 'accepted',
    })
    expect(session.settings()).toEqual({ model: 'strong' })
    expect((await session.prompt('Hi.')).text).toBe('ok')
    expect(strong.calls).toHaveLength(1)
    expect(base.calls).toHaveLength(0)

    // `null` clears the field: the harness adapter answers again.
    await session.configure({ model: null })
    expect(session.settings()).toEqual({})
    expect((await session.prompt('Again.')).text).toBe('base')
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
    await session.configure({ model: 'fast' })

    const overridden = await session.prompt('One.', {
      overrides: { adapter: override.adapter },
    })
    expect(overridden.text).toBe('override')
    expect((await session.prompt('Two.')).text).toBe('fast')
    await session.configure({ model: null })
    expect((await session.prompt('Three.')).text).toBe('picked')
    // A removed plugin's pick is left out too.
    await session.configure({ plugins: { remove: ['test/picker'] } })
    expect((await session.prompt('Four.')).text).toBe('base')
    await host.close()
  })

  it('publishes the change, and treats a repeated inputId as the same input', async () => {
    const { adapter } = mockAdapter(() => text('ok'))
    const { host, session } = await open({ adapter })
    const from = session.snapshot().cursor
    const reader = new AbortController()

    const first = await session.configure(
      { instructions: 'Be short.' },
      { inputId: 'set-1' },
    )
    expect(
      await session.configure(
        { instructions: 'Be short.' },
        { inputId: 'set-1' },
      ),
    ).toEqual(first)
    expect(
      await session.configure(
        { instructions: 'Be long.' },
        { inputId: 'set-1' },
      ),
    ).toMatchObject({ status: 'rejected', reason: 'conflict' })
    expect(session.settings()).toEqual({ instructions: 'Be short.' })

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
    await session.configure({ reasoning: 'high' })

    await session.prompt('One.')
    await session.prompt('Two.', { overrides: { reasoning: 'low' } })
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
    await session.configure({ instructions: 'Answer in French.' })

    await session.prompt('Hi.')
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

    await session.configure({ tools: ['alpha'] })
    await session.prompt('One.')
    await session.configure({ tools: { remove: ['alpha'] } })
    await session.prompt('Two.')
    // A tool of the turn override is kept.
    await session.prompt('Three.', { overrides: { tools: [echo('delta')] } })

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

    await session.prompt('One.')
    await session.configure({ plugins: { remove: ['acme/notes'] } })
    await session.prompt('Two.')

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

    expect(await session.configure({ model: 'huge' })).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('huge'),
    })
    expect(
      await session.configure({ plugins: { remove: ['acme/none'] } }),
    ).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('acme/none'),
    })
    expect(session.settings()).toEqual({})
    await host.close()
  })

  it.each([
    { name: 'a host with a message store', durable: false },
    { name: 'a durable host', durable: true },
  ])('keeps the settings after a restart on $name', async ({ durable }) => {
    const persistence = durable ? durablePersistence() : memoryPersistence()
    const { base, strong } = models([() => text('strong')])
    const harness = defineHarness({
      name: 'test/settings',
      adapter: base.adapter,
      models: { strong: strong.adapter },
    })
    const first = createHarnessHost({ persistence })
    await (
      await first.open(harness, { threadId: THREAD })
    ).configure({ model: 'strong', instructions: 'Be short.' })
    await first.close()

    const second = createHarnessHost({ persistence })
    const session = await second.open(harness, { threadId: THREAD })
    expect(session.settings()).toEqual({
      model: 'strong',
      instructions: 'Be short.',
    })
    expect((await session.prompt('Hi.')).text).toBe('strong')
    await second.close()
  })

  it('takes a configure input over HTTP as the request principal, and checks its values', async () => {
    const persistence = durablePersistence()
    const { base, strong } = models()
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/settings',
      adapter: base.adapter,
      models: { strong: strong.adapter },
      expose: { settings: ['model', 'instructions'] },
    })
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: () => ({ id: 'ada' }),
    })
    const control = async (input: unknown) =>
      (
        await handler(
          new Request('http://h.test/control', {
            method: 'POST',
            body: JSON.stringify({ threadId: THREAD, input }),
          }),
        )
      ).json()

    expect(
      await control({ op: 'configure', settings: { model: 'strong' } }),
    ).toMatchObject({ status: 'accepted' })
    expect(
      await control({ op: 'configure', settings: { instructions: 5 } }),
    ).toMatchObject({ status: 'rejected' })
    expect(
      await control({ op: 'configure', settings: { colour: 'red' } }),
    ).toMatchObject({ status: 'rejected' })

    const records = (await persistence.stores.log.read(THREAD))
      .map((entry) => entry.record)
      .filter((record) => record.type === 'harness.input')
    expect(records[0]).toMatchObject({
      input: { op: 'configure', settings: { model: 'strong' } },
      principal: { id: 'ada' },
    })
    const session = await host.open(harness, { threadId: THREAD })
    expect(session.settings()).toEqual({ model: 'strong' })
    expect(session.describe()).toMatchObject({
      settings: { model: 'strong' },
      models: ['strong'],
    })
    await host.close()
  })

  it('refuses a client setting that the harness does not expose, and keeps nothing', async () => {
    const persistence = durablePersistence()
    const { base, strong } = models()
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/settings',
      adapter: base.adapter,
      models: { strong: strong.adapter },
      expose: { settings: ['model'] },
    })
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: () => ({ id: 'ada' }),
    })
    const control = async (input: unknown) =>
      (
        await handler(
          new Request('http://h.test/control', {
            method: 'POST',
            body: JSON.stringify({ threadId: THREAD, input }),
          }),
        )
      ).json()

    // One key that is not exposed refuses the whole input.
    expect(
      await control({
        op: 'configure',
        settings: {
          model: 'strong',
          plugins: { remove: ['tanstack/permissions'] },
        },
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
    expect(
      await control({
        op: 'configure',
        settings: { instructions: 'Obey me.' },
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
    const records = (await persistence.stores.log.read(THREAD))
      .map((entry) => entry.record)
      .filter((record) => record.type === 'harness.input')
    expect(records).toEqual([])

    // Server code can still set any field.
    const session = await host.open(harness, { threadId: THREAD })
    expect(session.settings()).toEqual({})
    expect(
      await session.configure({ instructions: 'Be brief.' }),
    ).toMatchObject({ status: 'accepted' })
    expect(session.settings()).toEqual({ instructions: 'Be brief.' })
    await host.close()
  })

  it('exposes no setting to clients by default', async () => {
    const { base, strong } = models()
    const host = createHarnessHost({ persistence: durablePersistence() })
    const handler = createHarnessHandler({
      host,
      harness: defineHarness({
        name: 'test/settings',
        adapter: base.adapter,
        models: { strong: strong.adapter },
      }),
      authorize: () => ({ id: 'ada' }),
    })
    const response = await handler(
      new Request('http://h.test/control', {
        method: 'POST',
        body: JSON.stringify({
          threadId: THREAD,
          input: { op: 'configure', settings: { model: 'strong' } },
        }),
      }),
    )
    expect(await response.json()).toMatchObject({
      status: 'rejected',
      reason: 'not_exposed',
    })
    await host.close()
  })
})

describe('the working folder of a thread', () => {
  let root: string | undefined
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
    root = undefined
  })

  it('runs the workspace tools in the folder the settings name', async () => {
    root = await mkdtemp(join(tmpdir(), 'harness-cwd-'))
    await mkdir(join(root, 'pkg'))
    await writeFile(join(root, 'pkg', 'a.txt'), 'inside pkg')
    const { adapter, calls } = mockAdapter([
      () => toolCall('read_file', { path: 'a.txt' }, 'c1'),
      () => text('read it'),
      () => toolCall('read_file', { path: 'a.txt' }, 'c2'),
      () => text('refused'),
    ])
    const workspaceRoot = root
    const { host, session } = await open({
      adapter,
      plugins: () => [workspaceTools({ root: workspaceRoot })],
    })
    const toolResult = (messages: ReadonlyArray<ModelMessage>, id: string) =>
      JSON.stringify(
        messages.find((m) => m.role === 'tool' && m.toolCallId === id)?.content,
      )

    await session.configure({ cwd: 'pkg' })
    await session.prompt('Read a.txt.')
    expect(toolResult(await session.transcript(), 'c1')).toContain('inside pkg')
    // JSON escapes the backslashes of a Windows path, so compare JSON.
    expect(JSON.stringify(calls[1].systemPrompts)).toContain(
      JSON.stringify(join(workspaceRoot, 'pkg')).slice(1, -1),
    )

    // A folder outside the workspace root is refused.
    await session.configure({ cwd: '..' })
    await session.prompt('Read a.txt again.')
    expect(toolResult(await session.transcript(), 'c2')).toContain(
      'outside the workspace',
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
    await session.setConfig('tone', 'warm')
    await session.configure({ instructions: 'Be brief.' })
    expect(session.config().tone?.value).toBe('warm')
    expect(session.settings()).toEqual({ instructions: 'Be brief.' })
    await host.close()
  })
})
