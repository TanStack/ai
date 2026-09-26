import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  EventType,
  createCapability,
  defineAgent,
  toolDefinition,
} from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '../src'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '../src'

function setup() {
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence })
  return { persistence, host }
}

function customNames(events: Array<SessionEvent>): Array<string> {
  return events
    .map((entry) => entry.event)
    .filter(
      (event): event is Extract<StreamChunk, { type: 'CUSTOM' }> =>
        event.type === EventType.CUSTOM,
    )
    .map((event) => event.name)
}

async function collect(
  iterable: AsyncIterable<SessionEvent>,
): Promise<Array<SessionEvent>> {
  const out: Array<SessionEvent> = []
  for await (const entry of iterable) out.push(entry)
  return out
}

describe('chat turns', () => {
  it('runs a prompt, returns its text, and saves the transcript', async () => {
    const { host, persistence } = setup()
    const { adapter } = mockAdapter([() => text('Hello there')])
    const harness = defineHarness({ name: 'test/chat', adapter })
    const session = await host.open(harness, { threadId: 't1' })

    const turn = session.prompt('Hi')
    await expect(turn).resolves.toEqual({ text: 'Hello there' })
    expect(turn.status()).toBe('completed')

    const saved = await persistence.stores.messages.loadThread('t1')
    expect(saved.map((message) => message.role)).toEqual(['user', 'assistant'])
    const names = customNames(await collect(turn.events({ from: '0' })))
    expect(names).toContain(HARNESS_EVENTS.inputApplied)
    expect(names).toContain(HARNESS_EVENTS.operationStarted)
    expect(names.at(-1)).toBe(HARNESS_EVENTS.operationFinished)
    await host.close()
  })

  it('queues a second prompt and gives it the first turn as history', async () => {
    const { host } = setup()
    const first = gate()
    const { adapter, calls } = mockAdapter([
      after(first.opened, 'one'),
      () => text('two'),
    ])
    const session = await host.open(
      defineHarness({ name: 'test/queue', adapter }),
      {
        threadId: 't1',
      },
    )

    const a = session.prompt('first')
    const b = session.prompt('second')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(session.snapshot().queuedTurns).toBe(1)
    first.open()

    await expect(a).resolves.toEqual({ text: 'one' })
    await expect(b).resolves.toEqual({ text: 'two' })
    expect(messageTexts(calls[1])).toEqual(['first', 'one', 'second'])
    await host.close()
  })

  it('rejects a prompt with busy: reject while a turn runs', async () => {
    const { host } = setup()
    const first = gate()
    const { adapter, calls } = mockAdapter([after(first.opened, 'one')])
    const session = await host.open(
      defineHarness({ name: 'test/reject', adapter }),
      {
        threadId: 't1',
      },
    )

    const a = session.prompt('first')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await expect(session.prompt('second', { busy: 'reject' })).rejects.toThrow(
      'already running',
    )
    first.open()
    await a
    await host.close()
  })

  it('adds a steer message before the next model call of the running turn', async () => {
    const { host } = setup()
    const toolStarted = gate()
    const releaseTool = gate()
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look something up',
      inputSchema: z.object({ q: z.string() }),
    }).server(async () => {
      toolStarted.open()
      await releaseTool.opened
      return { found: true }
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('lookup', { q: 'x' }),
      () => text('done'),
    ])
    const session = await host.open(
      defineHarness({ name: 'test/steer', adapter, tools: [lookup] }),
      { threadId: 't1' },
    )

    const turn = session.prompt('find x')
    await toolStarted.opened
    const receipt = await session.steer('also check y')
    expect(receipt).toMatchObject({ status: 'accepted', operationId: turn.id })
    releaseTool.open()

    await expect(turn).resolves.toEqual({ text: 'done' })
    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1]).at(-1)).toBe('also check y')
    await host.close()
  })

  it('runs a steer that arrived too late as the next turn', async () => {
    const { host } = setup()
    const first = gate()
    const { adapter, calls } = mockAdapter([
      after(first.opened, 'one'),
      () => text('two'),
    ])
    const session = await host.open(
      defineHarness({ name: 'test/late', adapter }),
      {
        threadId: 't1',
      },
    )

    const a = session.prompt('first')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const joined = session.prompt('and this', { busy: 'steer' })
    first.open()

    await expect(a).resolves.toEqual({ text: 'one' })
    await expect(joined).resolves.toEqual({ text: 'two' })
    expect(messageTexts(calls[1]).at(-1)).toBe('and this')
    await host.close()
  })

  it('cancels the running turn', async () => {
    const { host } = setup()
    const { adapter, calls } = mockAdapter([untilAborted()])
    const session = await host.open(
      defineHarness({ name: 'test/cancel', adapter }),
      {
        threadId: 't1',
      },
    )

    const turn = session.prompt('go')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const receipt = await turn.cancel()
    expect(receipt.status).toBe('accepted')
    await expect(turn).rejects.toThrow('Cancelled')
    expect(turn.status()).toBe('cancelled')
    expect(session.snapshot().status).toBe('idle')
    await host.close()
  })

  it('stops for an approval and continues after resolve', async () => {
    const { host } = setup()
    const execute = vi.fn(async () => ({ ok: true }))
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(execute)
    const { adapter } = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'call_1'),
      () => text('removed'),
    ])
    const session = await host.open(
      defineHarness({ name: 'test/approve', adapter, tools: [remove] }),
      { threadId: 't1' },
    )

    const turn = await session.prompt('remove a.txt')
    expect(turn.interrupts).toHaveLength(1)
    expect(session.snapshot().status).toBe('requires_action')

    const receipt = await session.resolve([
      {
        interruptId: turn.interrupts![0]!.id,
        status: 'resolved',
        payload: true,
      },
    ])
    expect(receipt.status).toBe('accepted')
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect(execute).toHaveBeenCalledWith({ path: 'a.txt' }, expect.anything())
    await host.close()
  })

  it('rejects resolve when nothing is waiting', async () => {
    const { host } = setup()
    const { adapter } = mockAdapter([() => text('hi')])
    const session = await host.open(
      defineHarness({ name: 'test/noresolve', adapter }),
      {
        threadId: 't1',
      },
    )
    const receipt = await session.resolve([
      { interruptId: 'x', status: 'resolved', payload: true },
    ])
    expect(receipt).toMatchObject({
      status: 'rejected',
      reason: 'no_pending_interrupts',
    })
    await host.close()
  })
})

describe('events', () => {
  it('replays events after a cursor', async () => {
    const { host } = setup()
    const { adapter } = mockAdapter([() => text('one'), () => text('two')])
    const session = await host.open(
      defineHarness({ name: 'test/events', adapter }),
      {
        threadId: 't1',
      },
    )
    await session.prompt('a')
    const cursor = session.snapshot().cursor
    const second = session.prompt('b')
    await second

    const controller = new AbortController()
    const seen: Array<SessionEvent> = []
    for await (const entry of session.events({
      from: cursor,
      signal: controller.signal,
    })) {
      seen.push(entry)
      if (
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === HARNESS_EVENTS.operationFinished
      ) {
        controller.abort()
      }
    }
    expect(seen.every((entry) => Number(entry.cursor) > Number(cursor))).toBe(
      true,
    )
    expect(seen.some((entry) => entry.operationId === second.id)).toBe(true)
    await host.close()
  })
})

describe('agents', () => {
  const pricer = defineAgent({
    name: 'pricer',
    description: 'Prices a vendor',
    inputSchema: z.object({ vendor: z.string() }),
    run: async (ctx) => ({ vendor: ctx.input.vendor, cents: 1200 }),
  })

  it('runs a typed agent from code and notes the result in the transcript', async () => {
    const { host, persistence } = setup()
    const { adapter, calls } = mockAdapter([() => text('noted')])
    const session = await host.open(
      defineHarness({ name: 'test/agents', adapter, agents: [pricer] }),
      { threadId: 't1' },
    )

    const run = session.agents.pricer.run({ vendor: 'acme' })
    const result = await run
    expect(result).toEqual({ vendor: 'acme', cents: 1200 })
    expect(run.kind).toBe('agent')

    const record = await persistence.stores.runs.get(run.id)
    expect(record).toMatchObject({
      kind: 'agent',
      agent: 'pricer',
      status: 'completed',
    })

    await session.prompt('what did it cost?')
    expect(
      messageTexts(calls[0]).some((line) => line.includes('[pricer finished]')),
    ).toBe(true)
    await host.close()
  })

  it('rejects input that fails the schema', async () => {
    const { host } = setup()
    const { adapter } = mockAdapter([])
    const session = await host.open(
      defineHarness({ name: 'test/agents-bad', adapter, agents: [pricer] }),
      { threadId: 't1' },
    )
    await expect(
      session.agents.pricer.run({ vendor: 1 } as never),
    ).rejects.toThrow('Input validation failed for agent pricer')
    await host.close()
  })

  it('starts a background agent that wakes the session when done', async () => {
    const { host } = setup()
    const { adapter, calls } = mockAdapter([() => text('thanks')])
    const session = await host.open(
      defineHarness({ name: 'test/wake', adapter, agents: [pricer] }),
      { threadId: 't1' },
    )

    await session.agents.pricer.start({ vendor: 'acme' }, { wake: true })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(messageTexts(calls[0]).at(-1)).toContain(
      'Background agent pricer finished',
    )
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
    await host.close()
  })
})

describe('inbox', () => {
  it('runs a prompt that was accepted but never applied before a restart', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.inbox.append({
      inputId: 'in-1',
      threadId: 't1',
      input: { op: 'prompt', message: 'left over' },
      createdAt: Date.now(),
    })
    const { adapter, calls } = mockAdapter([() => text('recovered')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/recover', adapter }),
      {
        threadId: 't1',
      },
    )

    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect((await persistence.stores.inbox.get('in-1'))?.status).toBe('applied')
    expect(messageTexts(calls[0])).toEqual(['left over'])
    await host.close()
  })
})

describe('plugins', () => {
  it('keeps session plugins across turns and sets up run plugins per turn', async () => {
    const { host } = setup()
    const log: Array<string> = []
    const sessionPlugin = definePlugin({
      name: 'test/session',
      setup: async ({ resources }) => {
        await resources.acquire(
          () => log.push('session:open'),
          () => log.push('session:close'),
        )
        return { prompts: ['Session prompt.'] }
      },
    })
    const runPlugin = definePlugin({
      name: 'test/run',
      lifetime: 'run',
      setup: async ({ resources }) => {
        await resources.acquire(
          () => log.push('run:open'),
          () => log.push('run:close'),
        )
      },
    })
    const { adapter, calls } = mockAdapter([() => text('a'), () => text('b')])
    const session = await host.open(
      defineHarness({
        name: 'test/plugins',
        adapter,
        plugins: () => [sessionPlugin, runPlugin],
      }),
      { threadId: 't1' },
    )

    await session.prompt('one')
    await session.prompt('two')
    await session.close()

    expect(log).toEqual([
      'session:open',
      'run:open',
      'run:close',
      'run:open',
      'run:close',
      'session:close',
    ])
    expect(JSON.stringify(calls[0].systemPrompts)).toContain('Session prompt.')
  })

  it('gives plugin tools to the model and plugin capabilities to middleware', async () => {
    const { host } = setup()
    const clockCapability = createCapability<{ now: () => string }>()(
      'test.clock',
    )
    const [getClock] = clockCapability
    const seen: Array<string> = []
    const clockPlugin = definePlugin({
      name: 'test/clock',
      provides: [clockCapability],
      setup: ({ provide }) => {
        provide(clockCapability, { now: () => 'noon' })
        return {
          tools: [
            toolDefinition({
              name: 'clock',
              description: 'Tell the time',
            }).server(async () => 'noon'),
          ],
          middleware: [
            {
              name: 'test/read-clock',
              requires: [clockCapability],
              onStart: (ctx) => {
                seen.push(getClock(ctx).now())
              },
            },
          ],
        }
      },
    })
    const { adapter, calls } = mockAdapter([() => text('ok')])
    const session = await host.open(
      defineHarness({
        name: 'test/tools',
        adapter,
        plugins: () => [clockPlugin],
      }),
      { threadId: 't1' },
    )

    await session.prompt('time?')
    expect(calls[0].tools.map((tool: { name: string }) => tool.name)).toContain(
      'clock',
    )
    expect(seen).toEqual(['noon'])
    await host.close()
  })

  it('fails open when two plugins add the same tool', async () => {
    const { host } = setup()
    const tool = toolDefinition({ name: 'dup', description: 'x' }).server(
      async () => 1,
    )
    const a = definePlugin({ name: 'test/a', setup: () => ({ tools: [tool] }) })
    const b = definePlugin({ name: 'test/b', setup: () => ({ tools: [tool] }) })
    const { adapter } = mockAdapter([])
    await expect(
      host.open(
        defineHarness({ name: 'test/dup', adapter, plugins: () => [a, b] }),
        {
          threadId: 't1',
        },
      ),
    ).rejects.toThrow(
      'Duplicate tool "dup": first owner test/a, second owner test/b',
    )
  })
})
