import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { after, gate, mockAdapter, text, toolCall } from './helpers'

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
    defineHarness({
      name: 'test/reads',
      adapter,
      plugins: () => [counter],
    }),
    {
      threadId: 't',
    },
  )
  return { host, session }
}

describe('session reads for UIs', () => {
  it('returns the saved transcript', async () => {
    const { host, session } = await open()
    await session.send('hi')

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
    await first.session.runCommand({ name: 'bump', input: { by: 2 } })
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

describe('session.jobs', () => {
  it('lists a moved call with who moved it, on the session and on a view, until it ends', async () => {
    const finish = gate()
    const woke = gate()
    const child = mockAdapter(after(finish.opened, 'Found it'))
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('writer', { prompt: 'Look around' }, 'call-1'),
      () => text('Moved.'),
      () => {
        woke.open()
        return text('Got it.')
      },
    ])
    const harness = defineHarness({
      name: 'test/jobs',
      adapter,
      subagents: { agents: [writer] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, {
      threadId: 't',
      user: { id: 'ada' },
    })
    expect(session.jobs()).toEqual([])

    const turn = session.send('Look around for me')
    await vi.waitFor(() => expect(child.calls).toHaveLength(1))
    await session.moveToolCallToBackground()
    await turn

    const job = {
      jobId: 'call-1',
      threadId: 't',
      user: { id: 'ada' },
      startedAt: expect.any(Number),
      label: 'writer',
      running: true,
    }
    expect(session.jobs()).toEqual([job])
    const view = await host.observe(harness, { threadId: 't' })
    expect(await view.jobs()).toEqual([job])

    finish.open()
    await woke.opened
    await vi.waitFor(() => expect(session.jobs()).toEqual([]))
    await host.close()
  })
})
