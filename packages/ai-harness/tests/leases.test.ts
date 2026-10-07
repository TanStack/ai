import { describe, expect, it, vi } from 'vitest'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { CUT_OFF_NOTE, INTERRUPTED_TOOL_RESULT } from '../src/resume'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTool, StreamChunk } from '@tanstack/ai'
import { EventType } from '@tanstack/ai'
import type {
  LeaseStore,
  LogStore,
  TurnLease,
  TurnLeaseKey,
} from '@tanstack/ai-persistence'
import type { AnyAgent, HarnessConfig } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/** A background agent that runs until it is cancelled. */
const waiter = defineAgent({
  name: 'waiter',
  description: 'Waits until it is cancelled',
  run: (ctx) =>
    new Promise<string>((resolve) =>
      ctx.abortSignal?.addEventListener('abort', () => resolve('stopped')),
    ),
})

/** A lease store in memory, like a job queue's leases. */
function memoryLeases() {
  const leases = new Map<string, TurnLease>()
  const calls: Array<string> = []
  const keyOf = (key: TurnLeaseKey) => `${key.inputId}:${key.attempt}`
  const store: LeaseStore = {
    acquire: async (lease) => {
      calls.push(`acquire ${keyOf(lease)}`)
      leases.set(keyOf(lease), lease)
    },
    renew: async (lease) => {
      calls.push(`renew ${keyOf(lease)}`)
      leases.set(keyOf(lease), lease)
    },
    release: async (lease) => {
      calls.push(`release ${keyOf(lease)}`)
      leases.delete(keyOf(lease))
    },
    isAlive: async (key) => {
      const lease = leases.get(keyOf(key))
      return lease !== undefined && lease.expiresAt >= Date.now()
    },
  }
  const expire = () => {
    for (const lease of leases.values()) lease.expiresAt = Date.now() - 1
  }
  return { store, calls, leases, expire }
}

function leasedPersistence(leases: LeaseStore) {
  return { stores: { log: memoryLogStore(), leases } }
}

async function openLeased(
  persistence: ReturnType<typeof leasedPersistence>,
  replies: Array<Reply>,
  tools: Array<AnyTool> = [],
  lease?: { renewMs?: number; ttlMs?: number },
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({ persistence, lease })
  const session = await host.open(
    defineHarness({ name: 'test/leases', adapter, tools }),
    { threadId: THREAD },
  )
  return { host, session, calls }
}

/** Resolves when the model call is aborted. */
const aborted = (options: any) =>
  new Promise<void>((resolve) =>
    options.request?.signal?.addEventListener('abort', () => resolve(), {
      once: true,
    }),
  )

/** A model call that waits until the call is aborted, like a host that stopped. */
const hangs: Reply = (options: any) =>
  (async function* (): AsyncGenerator<StreamChunk> {
    yield {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: 1,
    }
    await aborted(options)
  })()

/**
 * A model call that streams `content`, then waits until it is aborted.
 * `onStreamed` runs after the session took the text.
 */
const cutAfter =
  (content: string, onStreamed = () => {}): Reply =>
  (options: any) =>
    (async function* (): AsyncGenerator<StreamChunk> {
      // RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT.
      yield* text(content).slice(0, 3)
      onStreamed()
      await aborted(options)
    })()

async function openCutOff(
  persistence: ReturnType<typeof leasedPersistence>,
  replies: Array<Reply>,
  options: Partial<HarnessConfig> = {},
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({ name: 'test/leases', adapter, ...options }),
    { threadId: THREAD },
  )
  return { host, session, calls }
}

/** Each message as `[role, content]`. */
const roles = (messages: ReadonlyArray<{ role: string; content: unknown }>) =>
  messages.map((message) => [message.role, message.content])

describe('a durable host with a lease store and no run store', () => {
  it('takes, renews, and releases the lease of a turn', async () => {
    const leases = memoryLeases()
    const { host, session } = await openLeased(
      leasedPersistence(leases.store),
      [() => text('done')],
    )

    await session.prompt('go', { inputId: 'in-1' })

    expect(leases.calls).toEqual(['acquire in-1:1', 'release in-1:1'])
    await host.close()
  })

  it('renews the lease while a turn runs, and stops at the release', async () => {
    const leases = memoryLeases()
    const hold = gate()
    const { host, session } = await openLeased(
      leasedPersistence(leases.store),
      [after(hold.opened, 'done')],
      [],
      { renewMs: 5, ttlMs: 50 },
    )

    const turn = session.prompt('go', { inputId: 'in-1' })
    await vi.waitFor(() => expect(leases.calls).toContain('renew in-1:1'))
    hold.open()
    await turn
    // A timer that the release did not stop would renew again in this time.
    await new Promise((resolve) => setTimeout(resolve, 30))

    const release = leases.calls.indexOf('release in-1:1')
    expect(release).toBeGreaterThan(-1)
    expect(leases.calls.slice(release)).not.toContain('renew in-1:1')
    await host.close()
  })

  it('lets the caller answer an interrupted turn as soon as it ends', async () => {
    const leases = memoryLeases()
    // A store that releases after a timer, like one over the network.
    const slow: LeaseStore = {
      ...leases.store,
      release: async (lease) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        await leases.store.release(lease)
      },
    }
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(async () => ({ ok: true }))
    const { host, session } = await openLeased(
      leasedPersistence(slow),
      [
        () => toolCall('remove', { path: 'a.txt' }, 'call_1'),
        () => text('removed'),
      ],
      [remove],
    )

    const turn = await session.prompt('remove a.txt')
    const interrupt = turn.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    expect(session.snapshot().status).toBe('requires_action')
    const receipt = await session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    expect(receipt.status).toBe('accepted')
    await host.close()
  })

  it('keeps a turn with a live lease, and runs one with an expired lease again', async () => {
    const leases = memoryLeases()
    const persistence = leasedPersistence(leases.store)
    const first = await openLeased(persistence, [hangs])
    first.session.prompt('go', { inputId: 'in-1' })
    await vi.waitFor(() => expect(leases.leases.size).toBe(1))

    // A second host while the lease is alive: it leaves the turn alone.
    const watcher = await openLeased(persistence, [() => text('never')])
    expect(watcher.calls).toHaveLength(0)
    expect(watcher.session.snapshot().status).toBe('idle')
    await watcher.host.close()

    leases.expire()
    const next = await openLeased(persistence, [() => text('recovered')])
    expect(await next.session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(next.calls).toHaveLength(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('fails a background agent with an expired lease, and keeps a finished one', async () => {
    const leases = memoryLeases()
    const persistence = leasedPersistence(leases.store)
    const pricer = defineAgent({
      name: 'pricer',
      description: 'Prices',
      run: async () => 'priced',
    })
    const first = createHarnessHost({ persistence })
    const session = await first.open(
      defineHarness({
        name: 'test/leases',
        adapter: mockAdapter([]).adapter,
        agents: [pricer, waiter],
      }),
      { threadId: THREAD },
    )
    await session.agents.pricer.run()
    session.agents.waiter.start(undefined, { wake: true })
    await vi.waitFor(() => expect(leases.leases.size).toBe(1))

    leases.expire()
    const next = await openLeased(persistence, [() => text('noted')])
    await vi.waitFor(() => expect(next.calls).toHaveLength(1))
    await vi.waitFor(() => expect(next.session.snapshot().status).toBe('idle'))

    // One wake, for the agent that stopped. The finished agent stays settled.
    expect(next.calls).toHaveLength(1)
    expect(messageTexts(next.calls[0]).at(-1)).toBe(
      'Background agent waiter failed: [waiter failed] The host stopped during this agent run.',
    )
    await first.close().catch(() => {})
    await next.host.close()
  })

  it('repairs a cut batch from the log', async () => {
    const leases = memoryLeases()
    const persistence = leasedPersistence(leases.store)
    const mailStarted = gate()
    const charge = vi.fn(async () => 'charged')
    const tools = [
      toolDefinition({ name: 'charge', description: 'Charge' }).server(charge),
      toolDefinition({ name: 'mail', description: 'Mail' }).server(
        async (_args, context) => {
          mailStarted.open()
          // Wait like a host that stopped, until the call is aborted at close.
          return new Promise<never>((_resolve, reject) => {
            context?.abortSignal?.addEventListener(
              'abort',
              () => reject(new Error('stopped')),
              { once: true },
            )
          })
        },
      ),
    ]
    const twoCalls: Reply = () => {
      const now = Date.now()
      return [
        {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
        },
        ...['charge', 'mail'].flatMap(
          (name): Array<StreamChunk> => [
            {
              type: EventType.TOOL_CALL_START,
              toolCallId: `call-${name}`,
              toolCallName: name,
              timestamp: now,
            },
            {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: `call-${name}`,
              delta: '{}',
              timestamp: now,
            },
            {
              type: EventType.TOOL_CALL_END,
              toolCallId: `call-${name}`,
              timestamp: now,
            },
          ],
        ),
        {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
          metadata: { tanstack: { finishReason: 'tool_calls' } },
        },
      ]
    }
    const first = await openLeased(persistence, [twoCalls], tools)
    first.session.prompt('charge and mail', { inputId: 'batch-1' })
    await mailStarted.opened
    await vi.waitFor(async () =>
      expect(
        (await persistence.stores.log.read(THREAD)).filter(
          (entry) => entry.record.type === 'harness.tool.result',
        ),
      ).toHaveLength(1),
    )
    leases.expire()

    const next = await openLeased(persistence, [() => text('done')], tools)
    await next.session.settled('batch-1')

    const results = (await next.session.transcript()).filter(
      (message) => message.role === 'tool',
    )
    expect(results).toEqual([
      { role: 'tool', toolCallId: 'call-charge', content: 'charged' },
      {
        role: 'tool',
        toolCallId: 'call-mail',
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: INTERRUPTED_TOOL_RESULT.note,
      },
    ])
    expect(charge).toHaveBeenCalledTimes(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('throws a clear error for a durable host with neither runs nor leases', () => {
    expect(() =>
      createHarnessHost({
        persistence: { stores: { log: memoryLogStore() } } as never,
      }),
    ).toThrow('stores.runs or stores.leases')
  })
})

describe('a durable host with runs and leases', () => {
  it('asks the lease store, and still writes run records', async () => {
    const leases = memoryLeases()
    const { runs } = memoryPersistence().stores
    const persistence = {
      stores: { log: memoryLogStore(), runs, leases: leases.store },
    }
    const { adapter } = mockAdapter([() => text('done')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/leases', adapter }),
      {
        threadId: THREAD,
      },
    )

    const turn = session.prompt('go', { inputId: 'in-1' })
    await turn

    expect(leases.calls).toEqual(['acquire in-1:1', 'release in-1:1'])
    expect((await runs.get(turn.id))?.status).toBe('completed')
    await host.close()
  })

  it('keeps the failed run when the stopped host ends its agent later', async () => {
    const leases = memoryLeases()
    const { runs } = memoryPersistence().stores
    const persistence = {
      stores: { log: memoryLogStore(), runs, leases: leases.store },
    }
    const harness = defineHarness({
      name: 'test/leases',
      adapter: mockAdapter([]).adapter,
      agents: [waiter],
    })
    const first = createHarnessHost({ persistence })
    const run = (
      await first.open(harness, { threadId: THREAD })
    ).agents.waiter.start()
    await vi.waitFor(() => expect(leases.leases.size).toBe(1))

    leases.expire()
    const next = createHarnessHost({ persistence })
    await next.open(harness, { threadId: THREAD })
    // The first host sees the writes of the second host, so it stops and
    // cancels its agent.
    await expect(Promise.resolve(run)).rejects.toThrow('Cancelled.')

    expect((await runs.get(run.id))?.status).toBe('failed')
    await first.close().catch(() => {})
    await next.close()
  })
})

describe('close({ recoverable: true })', () => {
  /** A durable store set with a run store, and a lease store when asked. */
  function durableStores(withLeases = true) {
    const { runs } = memoryPersistence().stores
    const log = memoryLogStore()
    const leases = memoryLeases().store
    return { stores: { log, runs, ...(withLeases ? { leases } : {}) } }
  }

  async function openOn(
    persistence: ReturnType<typeof durableStores>,
    replies: Array<Reply>,
    options: { tools?: Array<AnyTool>; agents?: Array<AnyAgent> } = {},
  ) {
    const { adapter, calls } = mockAdapter(replies)
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/leases', adapter, ...options }),
      { threadId: THREAD },
    )
    return { host, session, calls }
  }

  const logRecords = async (persistence: ReturnType<typeof durableStores>) =>
    (await persistence.stores.log.read(THREAD)).map((entry) => entry.record)

  it.each([true, false])(
    'runs a turn stopped in a model call again on the next host, with no settlement (lease store: %s)',
    async (withLeases) => {
      const persistence = durableStores(withLeases)
      const first = await openOn(persistence, [untilAborted()])
      const turn = first.session.prompt('go', { inputId: 'in-1' })
      await vi.waitFor(() => expect(first.calls).toHaveLength(1))

      await first.host.close({ recoverable: true })

      await expect(turn).rejects.toThrow('Session closed.')
      expect(
        (await logRecords(persistence)).map((record) => record.type),
      ).not.toContain('harness.input.settled')
      expect((await persistence.stores.runs.get(turn.id))?.status).toBe(
        'running',
      )
      const next = await openOn(persistence, [() => text('recovered')])
      expect(await next.session.settled('in-1')).toMatchObject({
        outcome: 'completed',
      })
      const applied = (await logRecords(persistence)).filter(
        (record) => record.type === 'harness.input.applied',
      )
      expect(applied.map((record) => record.attempt)).toEqual([1, 2])
      expect(messageTexts(next.calls[0])).toEqual(['go'])
      await next.host.close()
    },
  )

  it('gives a cut call of a tool that must not run twice the interrupted result', async () => {
    const persistence = durableStores()
    const started = gate()
    const mail = toolDefinition({ name: 'mail', description: 'Mail' }).server(
      (_args, context) =>
        new Promise<never>((_resolve, reject) => {
          started.open()
          context?.abortSignal?.addEventListener(
            'abort',
            () => reject(new Error('stopped')),
            { once: true },
          )
        }),
    )
    const first = await openOn(persistence, [() => toolCall('mail', {})], {
      tools: [mail],
    })
    void first.session.prompt('mail it', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await started.opened

    await first.host.close({ recoverable: true })
    const next = await openOn(persistence, [() => text('done')], {
      tools: [mail],
    })
    await next.session.settled('in-1')

    const results = (await next.session.transcript()).filter(
      (message) => message.role === 'tool',
    )
    expect(results).toEqual([
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: INTERRUPTED_TOOL_RESULT.note,
      },
    ])
    await next.host.close()
  })

  it('still settles a turn aborted at a plain close', async () => {
    const persistence = durableStores()
    const first = await openOn(persistence, [untilAborted()])
    const turn = first.session.prompt('go', { inputId: 'in-1' })
    await vi.waitFor(() => expect(first.calls).toHaveLength(1))

    await first.host.close()

    await expect(turn).rejects.toThrow('Cancelled.')
    expect((await persistence.stores.runs.get(turn.id))?.status).toBe('aborted')
    const next = await openOn(persistence, [() => text('never')])
    expect(await next.session.settled('in-1')).toMatchObject({
      outcome: 'aborted',
    })
    expect(next.calls).toHaveLength(0)
    await next.host.close()
  })

  it('keeps the text that a model call streamed before the close, for the next host', async () => {
    const log = memoryLogStore()
    // A store over the network: each append lands a little later.
    const slow: LogStore = {
      append: async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return log.append(...args)
      },
      read: (...args) => log.read(...args),
      subscribe: (...args) => log.subscribe(...args),
    }
    const persistence = { stores: { log: slow, leases: memoryLeases().store } }
    const streamed = gate()
    const first = await openCutOff(persistence, [
      cutAfter('The answer is ', streamed.open),
    ])
    void first.session.prompt('go', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await streamed.opened

    await first.host.close({ recoverable: true })
    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: true },
    })
    await next.session.settled('in-1')

    expect(roles(next.calls[0].messages)).toEqual([
      ['user', 'go'],
      ['assistant', 'The answer is '],
      ['user', CUT_OFF_NOTE],
    ])
    await next.host.close()
  })

  it('resumes an agent run on the next host', async () => {
    const persistence = durableStores()
    let started = 0
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits on its first run, then finishes',
      run: (ctx) => {
        started += 1
        if (started > 1) return Promise.resolve('done')
        return new Promise<string>((resolve) =>
          ctx.abortSignal?.addEventListener('abort', () => resolve('stopped')),
        )
      },
    })
    const first = await openOn(persistence, [], { agents: [worker] })
    first.session.agent('worker')?.start(undefined, { resume: true })
    await vi.waitFor(() => expect(started).toBe(1))

    await first.host.close({ recoverable: true })
    const next = await openOn(persistence, [], { agents: [worker] })

    await vi.waitFor(() => expect(started).toBe(2))
    const input = (await logRecords(persistence)).find(
      (record) => record.type === 'harness.input',
    )
    expect(await next.session.settled(String(input?.inputId))).toMatchObject({
      outcome: 'completed',
    })
    await next.host.close()
  })
})

describe('durability.continueCutOff', () => {
  const lookup = toolDefinition({
    name: 'lookup',
    description: 'Look up a fact',
  }).server(async () => 'found')

  /** A host that stops in a model call after `streamed` reached the log. */
  async function crashAfterText(
    replies: Array<Reply>,
    options: Partial<HarnessConfig> = { tools: [lookup] },
    streamed = 'The answer is ',
  ) {
    const leases = memoryLeases()
    const persistence = leasedPersistence(leases.store)
    const first = await openCutOff(persistence, replies, options)
    void first.session.prompt('go', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await vi.waitFor(async () =>
      expect(
        JSON.stringify(await persistence.stores.log.read(THREAD)),
      ).toContain(streamed),
    )
    leases.expire()
    return { persistence, first }
  }

  it.each([
    { option: true, note: CUT_OFF_NOTE },
    { option: { note: 'Go on.' }, note: 'Go on.' },
  ])(
    'continues an answer that a crash cut (continueCutOff: $option)',
    async ({ option, note }) => {
      // The text of the first model call is in the transcript already.
      const { persistence, first } = await crashAfterText([
        () => [
          ...text('Let me look.').slice(0, 4),
          ...toolCall('lookup', {}).slice(1),
        ],
        cutAfter('The answer is '),
      ])

      const next = await openCutOff(persistence, [() => text('42.')], {
        durability: { continueCutOff: option },
        tools: [lookup],
      })
      expect(await next.session.settled('in-1')).toMatchObject({
        outcome: 'completed',
      })

      const before = [
        ['user', 'go'],
        ['assistant', 'Let me look.'],
        ['tool', 'found'],
        ['assistant', 'The answer is '],
        ['user', note],
      ]
      expect(roles(next.calls[0].messages)).toEqual(before)
      expect(roles(await next.session.transcript())).toEqual([
        ...before,
        ['assistant', '42.'],
      ])
      // One append, so the transcript never ends with the cut answer.
      const added = (await persistence.stores.log.read(THREAD)).find(
        (entry) =>
          entry.record.type === 'harness.transcript' &&
          JSON.stringify(entry.record).includes(note),
      )
      expect(added?.record).toMatchObject({
        add: [
          { role: 'assistant', content: 'The answer is ' },
          { role: 'user', content: note },
        ],
      })
      await first.host.close().catch(() => {})
      await next.host.close()
    },
  )

  it('runs a cut answer again with no note when the option is off', async () => {
    const { persistence, first } = await crashAfterText([
      cutAfter('The answer is '),
    ])

    const next = await openCutOff(persistence, [() => text('42.')])
    await next.session.settled('in-1')

    expect(roles(next.calls[0].messages)).toEqual([['user', 'go']])
    expect(roles(await next.session.transcript())).toEqual([
      ['user', 'go'],
      ['assistant', '42.'],
    ])
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('does not keep the text of an agent that the crash cut', async () => {
    const child = mockAdapter([cutAfter('Agent notes ')])
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const subagents = { agents: [writer], tool: 'single' as const }
    const { persistence, first } = await crashAfterText(
      [() => toolCall('subagent', { agent: 'writer', prompt: 'Notes' })],
      { subagents },
      'Agent notes ',
    )

    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: true },
      subagents,
    })
    await next.session.settled('in-1')

    const sent = JSON.stringify(next.calls[0].messages)
    expect(sent).not.toContain('Agent notes')
    expect(sent).not.toContain(CUT_OFF_NOTE)
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('runs a call cut before any text again with no note', async () => {
    const leases = memoryLeases()
    const persistence = leasedPersistence(leases.store)
    const first = await openCutOff(persistence, [hangs])
    void first.session.prompt('go', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await vi.waitFor(() => expect(first.calls).toHaveLength(1))
    leases.expire()

    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: true },
    })
    await next.session.settled('in-1')

    expect(roles(next.calls[0].messages)).toEqual([['user', 'go']])
    await first.host.close().catch(() => {})
    await next.host.close()
  })
})
