import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHost,
  defineHarness,
  definePlugin,
  mediaIdOf,
  mediaPart,
} from '../src'
import { messageTexts, mockAdapter, text, toolCall } from './helpers'
import type { ModelMessage } from '@tanstack/ai'
import type { HarnessPersistence } from '../src'

const SOURCE = 'source'
const FORK = 'fork'

function durablePersistence() {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
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

describe.each([
  { name: 'a host with a message store', durable: false },
  { name: 'a durable host', durable: true },
])('host.fork on $name', ({ durable }) => {
  const setup = (persistence: HarnessPersistence) => {
    const { adapter, calls } = mockAdapter([
      () => text('A1'),
      () => text('A2'),
      () => text('A3'),
    ])
    const harness = defineHarness({ name: 'test/fork', adapter })
    const host = createHarnessHost({ persistence })
    return { harness, host, calls }
  }

  it('copies the transcript up to a message, and the fork goes on alone', async () => {
    const persistence = durable ? durablePersistence() : memoryPersistence()
    const { harness, host, calls } = setup(persistence)
    const source = await host.open(harness, { threadId: SOURCE })
    await source.prompt('one')
    await source.prompt('two')
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

    await fork.prompt('three')
    expect(messageTexts(calls[2])).toEqual(['one', 'A1', 'three'])
    // The source keeps its own transcript.
    expect(contents(await source.transcript())).toEqual(contents(before))
    await host.close()

    if (durable) {
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
    }
  })

  it('copies the whole transcript by default, and refuses an unknown message or a used thread', async () => {
    const persistence = durable ? durablePersistence() : memoryPersistence()
    const { harness, host } = setup(persistence)
    const source = await host.open(harness, { threadId: SOURCE })
    await source.prompt('one')

    const whole = await host.fork(harness, {
      threadId: SOURCE,
      newThreadId: FORK,
    })
    expect(contents(await whole.transcript())).toEqual(
      contents(await source.transcript()),
    )
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
    await source.configure({ model: 'main', instructions: 'Be brief.' })
    await source.setConfig('tone', 'warm')
    await source.prompt('Count.')
    await source.prompt('Deploy.')
    expect(source.snapshot().pendingInterrupts).toHaveLength(1)
    expect(source.snapshot().plugins['test/counter']).toEqual({ count: 1 })

    const fork = await host.fork(harness, {
      threadId: SOURCE,
      newThreadId: FORK,
    })
    expect(fork.settings()).toEqual({
      model: 'main',
      instructions: 'Be brief.',
    })
    expect(fork.config().tone?.value).toBe('warm')
    expect(fork.snapshot().plugins['test/counter']).toEqual({ count: 0 })
    expect(fork.snapshot().pendingInterrupts).toEqual([])
    await host.close()
  })

  it('copies the media of the copied messages, so the fork loads them', async () => {
    const { adapter } = mockAdapter(() => text('a cat'))
    const harness = defineHarness({ name: 'test/fork', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const source = await host.open(harness, { threadId: SOURCE })
    const bytes = new Uint8Array([1, 2, 3, 4])
    const record = await source.putMedia(bytes, {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    await source.prompt([
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
    expect(await fork.getMedia(id)).toMatchObject({
      threadId: FORK,
      name: 'cat.png',
    })
    expect(await fork.loadMedia(id)).toEqual(bytes)
    // Each thread sees only its own media.
    expect(await fork.getMedia(record.id)).toBeNull()
    expect(await source.getMedia(id)).toBeNull()
    await host.close()
  })
})
