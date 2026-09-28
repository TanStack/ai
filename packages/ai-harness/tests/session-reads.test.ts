import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { mockAdapter, text } from './helpers'

const counter = definePlugin({
  name: 'test/counter',
  setup: (ctx) => {
    const state = ctx.state({ count: 0 })
    return {
      tools: [
        toolDefinition({ name: 'ping', description: 'Ping' }).server(
          async () => 'pong',
        ),
      ],
      config: {
        level: configOption.select({
          options: ['low', 'high'],
          default: 'low',
        }),
      },
      commands: {
        bump: defineCommand({
          description: 'Add to the count',
          input: z.object({ by: z.number() }),
          run: async (input) => {
            await state.update((saved) => ({ count: saved.count + input.by }))
            return 'bumped'
          },
        }),
      },
    }
  },
})

async function open(persistence = memoryPersistence()) {
  const { adapter } = mockAdapter([() => text('hello back')])
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({ name: 'test/reads', adapter, plugins: () => [counter] }),
    { threadId: 't' },
  )
  return { host, session }
}

describe('session reads for UIs', () => {
  it('returns the saved transcript', async () => {
    const { host, session } = await open()
    await session.prompt('hi')

    const messages = await session.transcript()

    expect(messages[0]).toMatchObject({ role: 'user', content: 'hi' })
    expect(JSON.stringify(messages)).toContain('hello back')
    await host.close()
  })

  it('describes commands, settings, and tools', async () => {
    const { host, session } = await open()

    const description = session.describe()

    expect(description.commands).toEqual([
      expect.objectContaining({
        name: 'bump',
        description: 'Add to the count',
        owner: 'test/counter',
      }),
    ])
    expect(description.commands[0]?.input).toMatchObject({ type: 'object' })
    expect(description.config).toEqual([
      {
        key: 'level',
        owner: 'test/counter',
        value: 'low',
        option: expect.objectContaining({ type: 'select' }),
      },
    ])
    expect(description.tools).toContainEqual({
      name: 'ping',
      owner: 'test/counter',
    })
    await host.close()
  })

  it('puts saved plugin state in the first snapshot', async () => {
    const persistence = memoryPersistence()
    const first = await open(persistence)
    expect(first.session.snapshot().plugins).toEqual({
      'test/counter': { count: 0 },
    })
    await first.session.command('bump', { by: 2 })
    expect(first.session.snapshot().plugins).toEqual({
      'test/counter': { count: 2 },
    })
    await first.host.close()

    const second = await open(persistence)
    expect(second.session.snapshot().plugins).toEqual({
      'test/counter': { count: 2 },
    })
    await second.host.close()
  })
})
