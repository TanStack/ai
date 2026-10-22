import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '../src'
import { mediaIdOf, mediaPart } from '../src/media-entry'
import {
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  turnInterrupts,
} from './helpers'
import type { ModelMessage } from '@tanstack/ai'
import type { HarnessPersistence, HostLifecycleOptions } from '../src'

const SOURCE = 'source'
const FORK = 'fork'

function durablePersistence() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

/** A plugin with a config option and a counter in its saved state. */
const counter = definePlugin({
  name: 'test/counter',
  setup: (ctx) => {
    const state = ctx.state({ count: 0 })
    return {
      config: {
        tone: configOption.select({
          options: ['plain', 'warm'],
          default: 'plain',
        }),
      },
      tools: [
        toolDefinition({
          name: 'count',
          description: 'Count one up',
          inputSchema: z.object({}),
        }).server(async () => {
          await state.update((current) => ({ count: current.count + 1 }))
          return 'counted'
        }),
      ],
    }
  },
})

const contents = (messages: ReadonlyArray<ModelMessage>) =>
  messages.map(
    (message) => `${message.role}:${JSON.stringify(message.content)}`,
  )

describe('host.fork of the transcript', () => {
  const setup = (
    persistence: HarnessPersistence,
    lifecycle: HostLifecycleOptions = {},
  ) => {
    const { adapter, calls } = mockAdapter([
      () => text('A1'),
      () => text('A2'),
      () => text('A3'),
    ])
    const harness = defineHarness({ name: 'test/fork', adapter })
    const host = createHarnessHost({ persistence, lifecycle })
    return { harness, host, calls }
  }

  it('copies the transcript up to a message, and the fork goes on alone', async () => {
    const persistence = durablePersistence()
    const { harness, host, calls } = setup(persistence)
    const source = await host.open(harness, { threadId: SOURCE })
    await source.send('one')
    await source.send('two')
    const before = await source.transcript()
    const firstAnswer = before[1]
    if (!firstAnswer?.id) throw new Error('The answer has no id.')

    const fork = await host.fork(harness, {
      threadId: SOURCE,
      newThreadId: FORK,
      at: firstAnswer.id,
    })
    expect(contents(await fork.transcript())).toEqual(
      contents(before.slice(0, 2)),
    )

    await fork.send('three')
    expect(messageTexts(calls[2])).toEqual(['one', 'A1', 'three'])
    // The source keeps its own transcript.
    expect(contents(await source.transcript())).toEqual(contents(before))
    await host.close()

    // A later host folds the fork from its log.
    const later = createHarnessHost({ persistence })
    const reopened = await later.open(harness, { threadId: FORK })
    expect((await reopened.transcript()).map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ])
    await later.close()
  })

  it('closes a source that only the fork opened, and keeps one the app has open', async () => {
    const persistence = durablePersistence()
    // A session that no handle holds closes at once when it is idle.
    const { harness, host } = setup(persistence, {
      closeIdleSessionsAfterMs: 0,
    })
    const source = await host.open(harness, { threadId: SOURCE })
    await source.send('one')
    await host.fork(harness, { threadId: SOURCE, newThreadId: FORK })
    // The app opened the source: the fork left it open.
    expect(host.isOpen(harness, { threadId: SOURCE })).toBe(true)
    await source.close()
    expect(host.isOpen(harness, { threadId: SOURCE })).toBe(false)
    await host.fork(harness, { threadId: SOURCE, newThreadId: 'other' })
    // The fork opened the source itself, and released it at the end.
    expect(host.isOpen(harness, { threadId: SOURCE })).toBe(false)
    await host.close()
  })

  it('copies the whole transcript by default, no messages for a null at, and refuses an unknown message or a used thread', async () => {
    const persistence = durablePersistence()
    const { harness, host } = setup(persistence)
    const source = await host.open(harness, { threadId: SOURCE })
    await source.send('one')

    const whole = await host.fork(harness, {
      threadId: SOURCE,
      newThreadId: FORK,
    })
    expect(contents(await whole.transcript())).toEqual(
      contents(await source.transcript()),
    )
    const empty = await host.fork(harness, {
      threadId: SOURCE,
      newThreadId: 'empty',
      at: null,
    })
    expect(await empty.transcript()).toEqual([])
    await expect(
      host.fork(harness, { threadId: SOURCE, newThreadId: 'other', at: 'm-x' }),
    ).rejects.toThrow('m-x')
    // The fork thread has messages now.
    await expect(
      host.fork(harness, { threadId: SOURCE, newThreadId: FORK }),
    ).rejects.toThrow(FORK)
    await host.close()
  })
})

describe('host.fork', () => {
  it('copies the settings and plugin config, but not plugin state or interrupts', async () => {
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy',
      inputSchema: z.object({}),
      needsApproval: true,
    }).server(async () => 'deployed')
    const { adapter } = mockAdapter([
      () => toolCall('count', {}, 'c1'),
      () => text('counted once'),
      () => toolCall('deploy', {}, 'c2'),
    ])
    const harness = defineHarness({
      name: 'test/fork',
      adapter,
      tools: [deploy],
      models: { main: adapter },
      plugins: () => [counter],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const source = await host.open(harness, { threadId: SOURCE })
    await source.updateThreadSettings({
      settings: { model: 'main', instructions: 'Be brief.' },
    })
    await source.setPluginSetting({ key: 'tone', value: 'warm' })
    await source.send('Count.')
    await source.send('Deploy.')
    expect(turnInterrupts(source.snapshot())).toHaveLength(1)
    expect(source.snapshot().plugins['test/counter']).toEqual({ count: 1 })

    const fork = await host.fork(harness, {
      threadId: SOURCE,
      newThreadId: FORK,
    })
    expect(fork.threadSettings()).toEqual({
      model: 'main',
      instructions: 'Be brief.',
    })
    expect(fork.pluginSettings().tone?.value).toBe('warm')
    expect(fork.snapshot().plugins['test/counter']).toEqual({ count: 0 })
    expect(turnInterrupts(fork.snapshot())).toEqual([])
    await host.close()
  })

  it('copies the media of the copied messages, so the fork loads them', async () => {
    const { adapter } = mockAdapter(() => text('a cat'))
    const harness = defineHarness({ name: 'test/fork', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const source = await host.open(harness, { threadId: SOURCE })
    const bytes = new Uint8Array([1, 2, 3, 4])
    const record = await source.putMedia({
      body: bytes,
      mimeType: 'image/png',
      name: 'cat.png',
    })
    await source.send([
      { type: 'text', content: 'What is this?' },
      mediaPart(record),
    ])

    const fork = await host.fork(harness, {
      threadId: SOURCE,
      newThreadId: FORK,
    })
    const [question] = await fork.transcript()
    const parts = Array.isArray(question?.content) ? question.content : []
    const id = parts.map(mediaIdOf).find((value) => value !== undefined)
    if (!id) throw new Error('The fork lost the media part.')

    expect(id).not.toBe(record.id)
    expect(await fork.getMedia({ id })).toMatchObject({
      threadId: FORK,
      name: 'cat.png',
    })
    expect(await fork.loadMedia({ id })).toEqual(bytes)
    // Each thread sees only its own media.
    expect(await fork.getMedia({ id: record.id })).toBeNull()
    expect(await source.getMedia({ id })).toBeNull()
    await host.close()
  })
})

describe('a fork stays in its harness', () => {
  it('refuses host.fork and host.sessions.fork of a thread of another harness', async () => {
    const support = defineHarness({
      name: 'test/support',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const billing = defineHarness({
      name: 'test/billing',
      adapter: mockAdapter(() => text('billing here')).adapter,
      plugins: () => [counter],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const source = await host.open(support, { threadId: SOURCE })
    await source.send('one')

    await expect(
      host.fork(billing, { threadId: SOURCE, newThreadId: FORK }),
    ).rejects.toThrow(
      `Thread "${SOURCE}" belongs to harness "test/support", not "test/billing".`,
    )
    await expect(
      host.sessions.fork({
        harness: billing,
        threadId: SOURCE,
        at: { through: 'any' },
      }),
    ).rejects.toThrow('belongs to harness "test/support"')
    // Nothing opened the source under the other harness, and no fork exists.
    expect(host.isOpen(billing, { threadId: SOURCE })).toBe(false)
    expect(await host.sessions.get({ threadId: FORK })).toBeUndefined()
    await host.close()
  })
})
