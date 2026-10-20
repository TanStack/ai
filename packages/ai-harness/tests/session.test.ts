import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  EventType,
  createCapability,
  defineAgent,
  toolDefinition,
} from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import {
  after,
  appendToLog,
  gate,
  hideSecret,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  storedThreadState,
  untilAborted,
  wakeMessages,
  wrapLogStore,
} from './helpers'
import { isRecord } from '../src/utils'
import type { AnyChatMiddleware, ContentPart, StreamChunk } from '@tanstack/ai'
import type { LogRecord } from '@tanstack/ai-persistence'
import type {
  HarnessPersistence,
  HarnessTurnOptions,
  Receipt,
  SessionEvent,
} from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

/** A memory host. A session closes as soon as its last handle closes and it is idle. */
function setup() {
  const persistence = memoryPersistence()
  const host = createHarnessHost({
    persistence,
    lifecycle: { closeIdleSessionsAfterMs: 0 },
  })
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
    const { host } = setup()
    const { adapter } = mockAdapter([() => text('Hello there')])
    const harness = defineHarness({ name: 'test/chat', adapter })
    const session = await host.open(harness, { threadId: 't1' })

    const turn = session.send('Hi')
    await expect(turn).resolves.toEqual({ text: 'Hello there', media: [] })
    expect(turn.status()).toBe('completed')

    const saved = await session.transcript()
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

    const a = session.send('first')
    const b = session.send('second')
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(session.snapshot().queuedTurns).toBe(1)
    first.open()

    await expect(a).resolves.toEqual({ text: 'one', media: [] })
    await expect(b).resolves.toEqual({ text: 'two', media: [] })
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

    const a = session.send('first')
    await waitFor(() => expect(calls).toHaveLength(1))
    await expect(session.send('second', { busy: 'reject' })).rejects.toThrow(
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
      {
        threadId: 't1',
      },
    )

    const turn = session.send('find x')
    await toolStarted.opened
    const receipt = await session.send('also check y', { mode: 'steer' })
      .receipt
    expect(receipt).toMatchObject({ status: 'accepted', operationId: turn.id })
    releaseTool.open()

    await expect(turn).resolves.toEqual({ text: 'done', media: [] })
    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1]).at(-1)).toBe('also check y')
    await host.close()
  })

  it('answers a steer that arrived after the last model call in the same turn', async () => {
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

    const a = session.send('first')
    await waitFor(() => expect(calls).toHaveLength(1))
    const joined = session.send('and this', { busy: 'steer' })
    first.open()

    // One turn answers both messages: the joined prompt settles with it.
    await expect(a).resolves.toEqual({ text: 'onetwo', media: [] })
    await expect(joined).resolves.toEqual({ text: 'onetwo', media: [] })
    expect(messageTexts(calls[1]).at(-1)).toBe('and this')
    expect(
      await session.settled({ inputId: (await joined.receipt).inputId }),
    ).toEqual({
      inputId: (await joined.receipt).inputId,
      outcome: 'completed',
      operationId: a.id,
    })
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

    const turn = session.send('go')
    await waitFor(() => expect(calls).toHaveLength(1))
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
      defineHarness({
        name: 'test/approve',
        adapter,
        tools: [remove],
      }),
      {
        threadId: 't1',
      },
    )

    const turn = await session.send('remove a.txt')
    expect(turn.interrupts).toHaveLength(1)
    expect(session.snapshot().status).toBe('requires_action')

    const receipt = await session.resolve({
      resume: [
        {
          interruptId: turn.interrupts![0]!.id,
          status: 'resolved',
          payload: true,
        },
      ],
    })
    expect(receipt.status).toBe('accepted')
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
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
    const receipt = await session.resolve({
      resume: [{ interruptId: 'x', status: 'resolved', payload: true }],
    })
    expect(receipt).toMatchObject({
      status: 'rejected',
      reason: 'no_pending_interrupts',
    })
    await host.close()
  })
})

describe('settled operations', () => {
  it('keeps the last 500 settled operations, and drops older ones', async () => {
    const { host } = setup()
    const session = await host.open(
      defineHarness({
        name: 'test/window',
        adapter: mockAdapter([]).adapter,
      }),
      {
        threadId: 't1',
      },
    )
    const ids: Array<string> = []
    for (let index = 0; index < 501; index += 1) {
      const command = session.runCommand({ name: 'unknown' })
      ids.push(command.id)
      await command.then(
        () => undefined,
        () => undefined,
      )
    }
    await waitFor(() => expect(session.operation(ids[0] ?? '')).toBe(undefined))
    expect(session.operation(ids[1] ?? '')).toBeDefined()
    expect(session.operation(ids[500] ?? '')).toBeDefined()
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
    await session.send('a')
    const cursor = session.snapshot().cursor
    const second = session.send('b')
    await second

    const controller = new AbortController()
    const seen: Array<SessionEvent> = []
    for await (const entry of session.events({
      from: cursor,
      signal: controller.signal,
    })) {
      seen.push(entry)
      // The finished event of the first turn can land after its cursor.
      const isSecondDone =
        entry.operationId === second.id &&
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === HARNESS_EVENTS.operationFinished
      if (isSecondDone) controller.abort()
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
      defineHarness({
        name: 'test/agents',
        adapter,
        agents: [pricer],
      }),
      {
        threadId: 't1',
      },
    )

    const run = session.agents.pricer.run({ vendor: 'acme' })
    const result = await run
    expect(result).toEqual({ vendor: 'acme', cents: 1200 })
    expect(run.kind).toBe('agent')

    const { runs } = await storedThreadState(persistence.stores.log, {
      threadId: 't1',
    })
    expect(runs.get(run.id)).toMatchObject({
      kind: 'agent',
      agent: 'pricer',
      status: 'completed',
    })

    await session.send('what did it cost?')
    expect(
      messageTexts(calls[0]).some((line) => line.includes('[pricer finished]')),
    ).toBe(true)
    await host.close()
  })

  it('rejects input that fails the schema', async () => {
    const { host } = setup()
    const { adapter } = mockAdapter([])
    const session = await host.open(
      defineHarness({
        name: 'test/agents-bad',
        adapter,
        agents: [pricer],
      }),
      {
        threadId: 't1',
      },
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
      {
        threadId: 't1',
      },
    )

    await session.agents.pricer.start(
      { vendor: 'acme' },
      { startTurnWhenDone: true },
    )
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(messageTexts(calls[0]).at(-1)).toContain(
      'Background agent pricer finished',
    )
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    const transcript = await session.transcript()
    expect(wakeMessages(transcript)).toEqual([
      expect.stringContaining('Background agent pricer finished'),
    ])
    await host.close()
  })

  it('notes a failed background agent and wakes the session', async () => {
    const failing = defineAgent({
      name: 'failing',
      description: 'Fails',
      run: async () => {
        throw new Error('no vendor')
      },
    })
    const { host } = setup()
    const { adapter, calls } = mockAdapter([() => text('sorry')])
    const session = await host.open(
      defineHarness({
        name: 'test/wake-failed',
        adapter,
        agents: [failing],
      }),
      {
        threadId: 't1',
      },
    )

    await expect(
      session.agents.failing.start(undefined, { startTurnWhenDone: true }),
    ).rejects.toThrow('no vendor')
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(messageTexts(calls[0]).slice(-2)).toEqual([
      '[failing failed] no vendor',
      'Background agent failing failed: [failing failed] no vendor',
    ])
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    await host.close()
  })
})

describe('inputs', () => {
  it('refuses inputs that come while the host closes, and stops the running turn', async () => {
    const { host } = setup()
    const { adapter } = mockAdapter([untilAborted()])
    const session = await host.open(
      defineHarness({ name: 'test/closing', adapter }),
      {
        threadId: 't1',
      },
    )
    const running = session.send('First.')
    await running.receipt

    const closed = host.close()
    expect(() => session.send('Late.')).toThrow('The host is closed.')
    expect(() => session.send('Later.', { mode: 'followUp' })).toThrow(
      'The host is closed.',
    )
    await expect(running).rejects.toThrow()
    await closed
  })

  it('settles a turn as failed when it fails before it runs', async () => {
    const { persistence, host } = setup()
    const session = await host.open(
      defineHarness({
        name: 'test/early-fail',
        adapter: mockAdapter([]).adapter,
      }),
      {
        threadId: 't1',
      },
    )
    // Another host wrote an interrupt whose descriptor does not match it.
    await appendToLog(persistence.stores.log, { threadId: 't1' }, [
      {
        type: 'harness.interrupt',
        interrupt: {
          interruptId: 'i-1',
          runId: 'r-1',
          threadId: 't1',
          requestedAt: 1,
          payload: { id: 'i-2', toolCallId: 'c-1', reason: 'r', message: 'm' },
        },
      },
    ])

    const turn = session.send('Go.', { inputId: 'in-early' })
    const invalid = 'The stored interrupt descriptor is invalid.'
    await expect(turn).rejects.toThrow(invalid)
    expect(await session.settled({ inputId: 'in-early' })).toMatchObject({
      outcome: 'failed',
      error: { message: invalid },
    })
    const events: Array<StreamChunk> = []
    for await (const chunk of turn.stream()) events.push(chunk)
    expect(events.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      true,
    )
    await host.close()
  })
})

describe('plugins', () => {
  it('fails a turn whose turn plugin adds a command', async () => {
    const { host } = setup()
    const session = await host.open(
      defineHarness({
        name: 'test/turn-commands',
        adapter: mockAdapter([() => text('never')]).adapter,
        plugins: () => [
          definePlugin({
            name: 'test/turn-command',
            lifetime: 'turn',
            setup: () => ({
              commands: {
                hello: defineCommand({ description: 'Hi', run: () => 'hi' }),
              },
            }),
          }),
        ],
      }),
      {
        threadId: 't1',
      },
    )

    await expect(session.send('Go.')).rejects.toThrow(
      "lifetime 'turn' cannot add commands or config",
    )
    await host.close()
  })

  it('keeps session plugins across turns and sets up turn plugins per turn', async () => {
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
      lifetime: 'turn',
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
      {
        threadId: 't1',
      },
    )

    await session.send('one')
    await session.send('two')
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

  it('runs a harness without an adapter on the model a plugin picks', async () => {
    const { host } = setup()
    const { adapter, calls } = mockAdapter([() => text('picked')])
    const picker = definePlugin({
      name: 'test/picker',
      setup: () => ({ adapter: () => adapter }),
    })
    const session = await host.open(
      defineHarness({
        name: 'test/no-adapter',
        plugins: () => [picker],
      }),
      {
        threadId: 't1',
      },
    )

    expect((await session.send('hi')).text).toBe('picked')
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('fails the turn when nothing gives it a model', async () => {
    const { host } = setup()
    const session = await host.open(defineHarness({ name: 'test/no-model' }), {
      threadId: 't1',
    })

    const turn = session.send('hi', { inputId: 'in-1' })
    const chunks: Array<StreamChunk> = []
    for await (const chunk of turn.stream()) chunks.push(chunk)

    const message =
      'This turn has no model. Set `adapter` in defineHarness, return one from a plugin `adapter()`, or pass `overrides.adapter` to the turn.'
    await expect(turn).rejects.toThrow(message)
    expect(chunks).toContainEqual(
      expect.objectContaining({ type: EventType.RUN_ERROR, message }),
    )
    expect(await session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'failed',
      error: { message },
    })
    await host.close()
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
      {
        threadId: 't1',
      },
    )

    await session.send('time?')
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
        defineHarness({
          name: 'test/dup',
          adapter,
          plugins: () => [a, b],
        }),
        {
          threadId: 't1',
        },
      ),
    ).rejects.toThrow(
      'Duplicate tool "dup": first owner test/a, second owner test/b',
    )
  })
})

describe('a waiting steer with an abort request', () => {
  it('does not join, and settles aborted', async () => {
    const started = gate()
    const done = gate()
    const wait = toolDefinition({ name: 'wait', description: 'Wait' }).server(
      async () => {
        started.open()
        await done.opened
        return 'waited'
      },
    )
    const { adapter, calls } = mockAdapter([
      () => toolCall('wait', {}),
      () => text('host answer'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/steer-abort',
        adapter,
        tools: [wait],
      }),
      {
        threadId: 't-abort',
      },
    )

    const turn = session.send('start')
    await started.opened
    const steer = session.send('stop me', {
      busy: 'steer',
      inputId: 'steer-1',
    })
    await steer.receipt
    await session.cancel({ operationId: steer.id })
    done.open()

    expect(await turn).toEqual({ text: 'host answer', media: [] })
    expect(messageTexts(calls[1])).not.toContain('stop me')
    expect(await session.settled({ inputId: 'steer-1' })).toMatchObject({
      outcome: 'aborted',
    })
    expect(calls).toHaveLength(2)
    await host.close()
  })
})

describe('joins', () => {
  /** A session whose `wait` tool runs until `wait.done` opens. */
  async function openJoins(
    replies: Array<Reply>,
    turn: HarnessTurnOptions,
    persistence: HarnessPersistence = memoryPersistence(),
  ) {
    const started = gate()
    const done = gate()
    const tool = toolDefinition({ name: 'wait', description: 'Wait' }).server(
      async () => {
        started.open()
        await done.opened
        return 'waited'
      },
    )
    const { adapter, calls } = mockAdapter(replies)
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/joins',
        adapter,
        tools: [tool],
        turn,
      }),
      {
        threadId: 't-joins',
      },
    )
    return { host, session, calls, wait: { started, done } }
  }

  it('keeps a joined prompt findable, and cancels it with its turn', async () => {
    const { host, session, calls, wait } = await openJoins(
      [() => toolCall('wait', {}), untilAborted()],
      {},
    )

    const turn = session.send('start')
    await wait.started.opened
    const steer = session.send('join me', { busy: 'steer' })
    await steer.receipt
    wait.done.open()
    await waitFor(() => expect(calls).toHaveLength(2))

    expect(session.operation(steer.id)).toBe(steer)
    expect(await session.cancel({ operationId: steer.id })).toMatchObject({
      status: 'rejected',
      reason: 'not_running',
    })
    await session.cancel({ operationId: turn.id })
    await expect(steer).rejects.toThrow()
    expect(steer.status()).toBe('cancelled')
    await host.close()
  })

  it('refuses a cancel that lands while onJoin runs, and the steer joins', async () => {
    const inJoin = gate()
    const releaseJoin = gate()
    const { host, session, calls, wait } = await openJoins(
      [() => toolCall('wait', {}), () => text('host answer')],
      {
        onJoin: async () => {
          inJoin.open()
          await releaseJoin.opened
          return undefined
        },
      },
    )

    const turn = session.send('start')
    await wait.started.opened
    const steer = session.send('stop me', { busy: 'steer', inputId: 's1' })
    await steer.receipt
    wait.done.open()
    await inJoin.opened
    const receipt = await session.cancel({ operationId: steer.id })
    releaseJoin.open()

    expect(receipt).toMatchObject({ status: 'rejected', reason: 'not_running' })
    expect(await steer).toEqual(await turn)
    expect(messageTexts(calls[1]).at(-1)).toBe('stop me')
    expect(await session.settled({ inputId: 's1' })).toMatchObject({
      outcome: 'completed',
      operationId: turn.id,
    })
    await host.close()
  })

  it('refuses a cancel that lands after the late-join check', async () => {
    const inner = memoryLogStore()
    const inUpdate = gate()
    const releaseUpdate = gate()
    let isArmed = false
    /** The run of the turn starts again, for the late steer. */
    const isRunAgain = (record: LogRecord) =>
      record.type === 'harness.run.update' &&
      isRecord(record.patch) &&
      record.patch.status === 'running'
    const log = wrapLogStore(inner, {
      append: async (batch) => {
        if (isArmed && batch.records.some(isRunAgain)) {
          isArmed = false
          inUpdate.open()
          await releaseUpdate.opened
        }
        return inner.append(batch)
      },
    })
    const release = gate()
    const { host, session, calls } = await openJoins(
      [after(release.opened, 'first answer'), () => text('late answer')],
      {},
      { stores: { log } },
    )

    const turn = session.send('first')
    await waitFor(() => expect(calls).toHaveLength(1))
    const late = session.send('late', { busy: 'steer', inputId: 'late' })
    await late.receipt
    isArmed = true
    release.open()
    // The turn decided to run the model again for the late steer.
    await inUpdate.opened
    // Its input record waits for the log write of the run.
    const receipt = session.cancel({ operationId: late.id })
    releaseUpdate.open()

    expect(await receipt).toMatchObject({
      status: 'rejected',
      reason: 'not_running',
    })
    expect(await turn).toEqual({ text: 'first answerlate answer', media: [] })
    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1]).at(-1)).toBe('late')
    await host.close()
  })

  it('keeps the model context that an earlier middleware set, with the steer', async () => {
    const release = gate()
    const { adapter, calls } = mockAdapter([
      after(release.opened, 'first'),
      () => text('second'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/steer-context',
        adapter,
        middleware: [hideSecret],
      }),
      {
        threadId: 't-context',
      },
    )

    const turn = session.send('secret')
    await waitFor(() => expect(calls).toHaveLength(1))
    await session.send('more', { busy: 'steer' }).receipt
    release.open()
    await turn

    expect(messageTexts(calls[1])).toEqual(['[hidden]', 'first', 'more'])
    await host.close()
  })

  it('sends a steer that joins a call through the per-call change of a middleware', async () => {
    const image: ContentPart = {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/cat.png' },
    }
    // Like a model that cannot read images: each image becomes a text.
    const noImages: AnyChatMiddleware = {
      name: 'test/no-images',
      onConfig: (ctx, config) => {
        if (ctx.phase !== 'beforeModel') return undefined
        return {
          providerMessages: (config.providerMessages ?? config.messages).map(
            (message) =>
              Array.isArray(message.content)
                ? {
                    ...message,
                    content: message.content.map((part) =>
                      part.type === 'image'
                        ? { type: 'text' as const, content: '[image]' }
                        : part,
                    ),
                  }
                : message,
          ),
        }
      },
    }
    const release = gate()
    const { adapter, calls } = mockAdapter([
      after(release.opened, 'first'),
      () => text('second'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/steer-convert',
        adapter,
        middleware: [noImages],
      }),
      {
        threadId: 't-convert',
      },
    )
    const steer: Array<ContentPart> = [{ type: 'text', content: 'this' }, image]

    const turn = session.send('look')
    await waitFor(() => expect(calls).toHaveLength(1))
    await session.send(steer, { busy: 'steer' }).receipt
    release.open()
    await turn

    expect(calls[1].messages.at(-1).content).toEqual([
      { type: 'text', content: 'this' },
      { type: 'text', content: '[image]' },
    ])
    const transcript = await session.transcript()
    expect(
      transcript.find(
        (message) => message.role === 'user' && Array.isArray(message.content),
      )?.content,
    ).toEqual(steer)
    await host.close()
  })

  it('fails the turn when onJoin throws, and runs the steer as its own turn', async () => {
    const { host, session, calls, wait } = await openJoins(
      [() => toolCall('wait', {}), () => text('steer answer')],
      {
        onJoin: () => {
          throw new Error('hook broke')
        },
      },
    )

    const turn = session.send('start')
    await wait.started.opened
    const steer = session.send('more', { busy: 'steer', inputId: 's1' })
    await steer.receipt
    wait.done.open()

    await expect(turn).rejects.toThrow('hook broke')
    expect(await steer).toEqual({ text: 'steer answer', media: [] })
    expect(messageTexts(calls[1])).toContain('more')
    expect((await session.settled({ inputId: 's1' })).operationId).not.toBe(
      turn.id,
    )
    await host.close()
  })

  it('adds nothing from onJoin to a turn cancelled while the hook runs', async () => {
    const inJoin = gate()
    const releaseJoin = gate()
    const { host, session, calls, wait } = await openJoins(
      [
        () => toolCall('wait', {}),
        () => text('cancelled answer'),
        () => text('steer answer'),
      ],
      {
        onJoin: async () => {
          inJoin.open()
          await releaseJoin.opened
          return { messages: [{ role: 'user', content: 'hook' }] }
        },
      },
    )

    const turn = session.send('start')
    await wait.started.opened
    const steer = session.send('more', { busy: 'steer', inputId: 's1' })
    await steer.receipt
    wait.done.open()
    await inJoin.opened
    await turn.cancel()
    releaseJoin.open()

    await expect(turn).rejects.toThrow('Cancelled')
    expect(await steer).toEqual({ text: 'steer answer', media: [] })
    for (const call of calls) expect(messageTexts(call)).not.toContain('hook')
    expect(messageTexts(calls.at(-1))).toContain('more')
    expect((await session.settled({ inputId: 's1' })).operationId).not.toBe(
      turn.id,
    )
    await host.close()
  })

  it('stops at a steer that a cancel reaches while canJoin runs', async () => {
    let cancelled: Receipt | undefined
    let aId = ''
    let session: Awaited<ReturnType<typeof openJoins>>['session'] | undefined
    const joins = await openJoins(
      [
        () => toolCall('wait', {}),
        () => text('host answer'),
        () => text('b answer'),
      ],
      {
        canJoin: async ({ inputId }) => {
          // The cancel of the earlier steer lands while canJoin runs for `b`.
          if (inputId === 'b' && !cancelled) {
            cancelled = await session?.cancel({ operationId: aId })
          }
          return true
        },
      },
    )
    session = joins.session
    const { host, calls, wait } = joins

    const turn = session.send('start')
    await wait.started.opened
    const a = session.send('a', { busy: 'steer', inputId: 'a' })
    aId = a.id
    const b = session.send('b', { busy: 'steer', inputId: 'b' })
    await Promise.all([a.receipt, b.receipt])
    wait.done.open()
    await turn

    expect(cancelled?.status).toBe('accepted')
    expect(messageTexts(calls[1])).not.toContain('a')
    expect(await session.settled({ inputId: 'a' })).toMatchObject({
      outcome: 'aborted',
    })
    expect(await b).toEqual({ text: 'b answer', media: [] })
    await host.close()
  })
})
