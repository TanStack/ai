import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { InputRejectedError, createHarnessHost, defineHarness } from '../src'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTool, ModelMessage } from '@tanstack/ai'
import type { LeaseStore, LogRecord } from '@tanstack/ai-persistence'
import type { HarnessDurability, HarnessInput, RecoverDecision } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

function durablePersistence() {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

/** The log record of a prompt. With no other record, it never ran. */
const pendingInput = (inputId: string, message: string): LogRecord => ({
  type: 'harness.input',
  inputId,
  input: { op: 'prompt', message, busy: 'queue' },
  at: 1,
})

/** The log record of a `cancelInput` or `setDelivery` input `ctl-1`. */
const controlInput = (input: HarnessInput): LogRecord => ({
  type: 'harness.input',
  inputId: 'ctl-1',
  input,
  at: 2,
})

const controlApplied: LogRecord = {
  type: 'harness.input.applied',
  inputId: 'ctl-1',
  operationId: 'session',
  attempt: 1,
}

/**
 * The log and run of a host that stopped during attempt `attempt` of input
 * `in-1`: the input, its applied record, and the user message that the turn
 * saved. The run lease has expired.
 */
async function seedStoppedTurn(
  persistence: Durable,
  options: {
    attempt: number
    timeoutAt?: number
    abort?: boolean
    answer?: string
  },
) {
  const user: ModelMessage = { id: 'u1', role: 'user', content: 'go' }
  const records: Array<LogRecord> = [
    pendingInput('in-1', 'go'),
    {
      type: 'harness.input.applied',
      inputId: 'in-1',
      operationId: 'op-stopped',
      attempt: options.attempt,
      ...(options.timeoutAt !== undefined
        ? { timeoutAt: options.timeoutAt }
        : {}),
    },
    {
      type: 'harness.transcript',
      keep: 0,
      add: options.answer
        ? [user, { id: 'a1', role: 'assistant', content: options.answer }]
        : [user],
    },
    ...(options.abort
      ? [{ type: 'harness.input.abort', inputId: 'in-1' }]
      : []),
  ]
  await persistence.stores.log.append(THREAD, 1, records)
  await persistence.stores.runs.createOrResume({
    runId: 'op-stopped',
    threadId: THREAD,
    startedAt: Date.now() - 60_000,
  })
  await persistence.stores.runs.update('op-stopped', {
    leaseOwner: 'host-gone',
    leaseExpiresAt: Date.now() - 1_000,
    checkpoint: { at: 1, pendingTools: [] },
  })
}

async function openDurable(options: {
  persistence: Durable
  replies: Array<Reply>
  durability?: HarnessDurability
  tools?: Array<AnyTool>
}) {
  const { adapter, calls } = mockAdapter(options.replies)
  const host = createHarnessHost({ persistence: options.persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/durable-inputs',
      adapter,
      ...(options.durability ? { durability: options.durability } : {}),
      ...(options.tools ? { tools: options.tools } : {}),
    }),
    { threadId: THREAD },
  )
  return { host, session, calls }
}

const logRecords = async (persistence: Durable) =>
  (await persistence.stores.log.read(THREAD)).map((entry) => entry.record)

const recordTypes = async (persistence: Durable) =>
  (await logRecords(persistence)).map((record) => record.type)

const recordTypesOf = async (persistence: Durable, inputId: string) =>
  (await logRecords(persistence))
    .filter((record) => record.inputId === inputId)
    .map((record) => record.type)

describe('recovery of a durable input', () => {
  it('settles failed when the attempts are used up, with no model call', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence, { attempt: 3 })

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('never')],
      durability: { maxAttempts: 3 },
    })

    expect(await session.settled('in-1')).toEqual({
      inputId: 'in-1',
      outcome: 'failed',
      operationId: 'op-stopped',
      error: {
        message: 'The input stopped the host 3 times.',
        code: 'attempts_exhausted',
      },
    })
    expect(calls).toHaveLength(0)
    expect((await persistence.stores.runs.get('op-stopped'))?.status).toBe(
      'failed',
    )
    await host.close()
  })

  it('runs the next attempt while attempts are left', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence, { attempt: 1 })

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('recovered')],
      durability: { maxAttempts: 3 },
    })
    const settlement = await session.settled('in-1')

    expect(settlement.outcome).toBe('completed')
    expect(calls).toHaveLength(1)
    const applied = (await logRecords(persistence)).filter(
      (record) => record.type === 'harness.input.applied',
    )
    expect(applied.map((record) => record.attempt)).toEqual([1, 2])
    await host.close()
  })

  it('settles failed when the time limit passed, with attempts left', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence, {
      attempt: 1,
      timeoutAt: Date.now() - 1,
    })

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('never')],
      durability: { maxAttempts: 10, timeoutMs: 60_000 },
    })

    expect(await session.settled('in-1')).toMatchObject({
      outcome: 'failed',
      error: { code: 'timeout' },
    })
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it('settles aborted after an abort request, with no model call', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence, { attempt: 1, abort: true })

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('never')],
    })

    expect(await session.settled('in-1')).toMatchObject({ outcome: 'aborted' })
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it('settles aborted a pending input that was cancelled before it ran', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append(THREAD, 1, [
      pendingInput('in-1', 'go'),
      { type: 'harness.input.abort', inputId: 'in-1' },
    ])

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('never')],
    })

    expect(await session.settled('in-1')).toMatchObject({ outcome: 'aborted' })
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it('settles completed when the log already has the final answer', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence, { attempt: 1, answer: 'done before' })

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('never')],
    })

    expect(await session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it.each([
    { name: 'an abort request', stopped: { attempt: 1, abort: true } },
    { name: 'no attempt left', stopped: { attempt: 3 } },
    {
      name: 'a passed time limit',
      stopped: { attempt: 1, timeoutAt: Date.now() - 1 },
    },
  ])(
    'settles completed when the log has the final answer, also with $name',
    async ({ stopped }) => {
      const persistence = durablePersistence()
      await seedStoppedTurn(persistence, { ...stopped, answer: 'done before' })
      const seen: Array<RecoverDecision> = []

      const { host, session, calls } = await openDurable({
        persistence,
        replies: [() => text('never')],
        durability: {
          maxAttempts: 3,
          timeoutMs: 60_000,
          recover: ({ decision }) => {
            seen.push(decision)
            return undefined
          },
        },
      })

      expect(await session.settled('in-1')).toMatchObject({
        outcome: 'completed',
      })
      expect(seen).toEqual([{ action: 'settle', outcome: 'completed' }])
      expect(calls).toHaveLength(0)
      await host.close()
    },
  )

  it('gives a cut call of a tool that must not run twice the interruptedToolResult text', async () => {
    const interrupted = JSON.stringify({
      type: 'interrupted',
      message:
        'Tool execution was interrupted before completion. The outcome is unknown.',
    })
    const persistence = durablePersistence()
    const started = gate()
    const mail = toolDefinition({
      name: 'mail',
      description: 'Send a mail',
    }).server(
      (_args, context) =>
        new Promise<never>((_resolve, reject) => {
          started.open()
          // Wait like a host that stopped, until the call is aborted at close.
          context?.abortSignal?.addEventListener(
            'abort',
            () => reject(new Error('stopped')),
            { once: true },
          )
        }),
    )
    const first = await openDurable({
      persistence,
      replies: [() => toolCall('mail', {})],
      tools: [mail],
    })
    const turn = first.session.prompt('mail it', { inputId: 'in-1' })
    await started.opened
    // The first host stops: its run lease expires.
    await persistence.stores.runs.update(turn.id, {
      leaseExpiresAt: Date.now() - 1,
    })

    const next = await openDurable({
      persistence,
      replies: [() => text('done')],
      tools: [mail],
      durability: { interruptedToolResult: interrupted },
    })
    await next.session.settled('in-1')

    const results = (await next.session.transcript()).filter(
      (message) => message.role === 'tool',
    )
    expect(results).toEqual([
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: interrupted,
        error: interrupted,
      },
    ])
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('fails a background agent whose host stopped, and wakes the thread', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append(THREAD, 1, [
      {
        type: 'harness.input',
        inputId: 'in-agent',
        input: { op: 'agent', agent: 'waiter', detached: true },
        at: 1,
      },
      {
        type: 'harness.input.applied',
        inputId: 'in-agent',
        operationId: 'op-agent',
        attempt: 1,
      },
    ])
    await persistence.stores.runs.createOrResume({
      runId: 'op-agent',
      threadId: THREAD,
      startedAt: Date.now() - 60_000,
      kind: 'agent',
      agent: 'waiter',
    })
    await persistence.stores.runs.update('op-agent', {
      leaseOwner: 'host-gone',
      leaseExpiresAt: Date.now() - 1_000,
    })

    const { host, calls } = await openDurable({
      persistence,
      replies: [() => text('noted')],
    })

    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(messageTexts(calls[0]).slice(-2)).toEqual([
      '[waiter failed] The host stopped during this agent run.',
      'Background agent waiter failed: [waiter failed] The host stopped during this agent run.',
    ])
    expect((await persistence.stores.runs.get('op-agent'))?.status).toBe(
      'failed',
    )
    const settled = (await logRecords(persistence)).find(
      (record) =>
        record.type === 'harness.input.settled' &&
        record.inputId === 'in-agent',
    )
    expect(settled).toMatchObject({
      operationId: 'op-agent',
      outcome: 'failed',
      error: { message: 'The host stopped during this agent run.' },
    })
    await host.close()
  })

  it('settles an input with the recover hook that the default would run again', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence, { attempt: 1 })
    const seen: Array<unknown> = []

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('never')],
      durability: {
        recover: ({ input, decision }) => {
          seen.push({
            inputId: input.inputId,
            attempt: input.attempt,
            decision,
          })
          return {
            action: 'settle',
            outcome: 'failed',
            error: { message: 'The host gave up.', code: 'host_rule' },
          }
        },
      },
    })

    expect(await session.settled('in-1')).toEqual({
      inputId: 'in-1',
      outcome: 'failed',
      operationId: 'op-stopped',
      error: { message: 'The host gave up.', code: 'host_rule' },
    })
    expect(seen).toEqual([
      { inputId: 'in-1', attempt: 1, decision: { action: 'run' } },
    ])
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it('runs an input with the recover hook that the default would settle', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence, { attempt: 1, answer: 'old answer' })

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('new answer')],
      durability: {
        recover: ({ decision }) =>
          decision.action === 'settle' && decision.outcome === 'completed'
            ? { action: 'run' }
            : undefined,
      },
    })

    expect(await session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('asks the recover hook about an input that never ran', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append(THREAD, 1, [
      pendingInput('in-new', 'later'),
    ])

    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('never')],
      durability: { recover: () => ({ action: 'settle', outcome: 'aborted' }) },
    })

    expect(await session.settled('in-new')).toMatchObject({
      outcome: 'aborted',
    })
    expect(calls).toHaveLength(0)
    await host.close()
  })
})

describe('session.recover()', () => {
  /** A stopped turn whose run lease is alive: another host still runs it. */
  async function seedLiveTurn(persistence: Durable) {
    await seedStoppedTurn(persistence, { attempt: 1 })
    await persistence.stores.runs.update('op-stopped', {
      leaseExpiresAt: Date.now() + 60_000,
    })
  }

  const expireLease = (persistence: Durable) =>
    persistence.stores.runs.update('op-stopped', {
      leaseExpiresAt: Date.now() - 1,
    })

  it('runs a turn that another host held at open, after its lease expires', async () => {
    const persistence = durablePersistence()
    await seedLiveTurn(persistence)
    const { log } = persistence.stores
    // A store that does not push new records: the session reads them only
    // when it catches up.
    const quiet: Durable = {
      stores: {
        ...persistence.stores,
        log: {
          append: (threadId, seq, records) =>
            log.append(threadId, seq, records),
          read: (threadId, options) => log.read(threadId, options),
          subscribe: () => () => {},
        },
      },
    }
    const { host, session, calls } = await openDurable({
      persistence: quiet,
      replies: [() => text('one'), () => text('two')],
    })
    expect(calls).toHaveLength(0)

    // The other host stored one more input, then stopped.
    const head = (await log.read(THREAD)).length
    await log.append(THREAD, head + 1, [pendingInput('in-2', 'next')])
    await expireLease(persistence)
    await host.recover()

    expect(await session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(await session.settled('in-2')).toMatchObject({
      outcome: 'completed',
    })
    expect(calls).toHaveLength(2)
    await host.close()
  })

  it('runs the turn once when two calls run at once', async () => {
    const persistence = durablePersistence()
    await seedLiveTurn(persistence)
    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('recovered'), () => text('later'), () => text('x')],
    })
    await expireLease(persistence)

    await Promise.all([session.recover(), host.recover(THREAD)])
    await session.settled('in-1')
    // A second run of the turn would run before this one.
    await session.prompt('later')

    expect(calls).toHaveLength(2)
    const applied = (await logRecords(persistence)).filter(
      (record) =>
        record.type === 'harness.input.applied' && record.inputId === 'in-1',
    )
    expect(applied.map((record) => record.attempt)).toEqual([1, 2])
    await host.close()
  })

  it('leaves the turns that this session runs and queues alone', async () => {
    const persistence = durablePersistence()
    const release = gate()
    const { host, session, calls } = await openDurable({
      persistence,
      replies: [
        after(release.opened, 'first'),
        () => text('second'),
        () => text('third'),
        () => text('x'),
      ],
    })
    const one = session.prompt('one', { inputId: 'in-1' })
    const two = session.prompt('two', { inputId: 'in-2' })
    await two.receipt
    await vi.waitFor(() => expect(calls).toHaveLength(1))

    await session.recover()
    release.open()
    await Promise.all([one, two])
    // A second run of `two` would run before this one.
    await session.prompt('three')

    expect(calls.map((call) => messageTexts(call).at(-1))).toEqual([
      'one',
      'two',
      'three',
    ])
    await host.close()
  })
})

describe('durable input limits while a turn runs', () => {
  it('aborts a turn at its time limit and settles it failed', async () => {
    const persistence = durablePersistence()
    const { host, session } = await openDurable({
      persistence,
      replies: [untilAborted()],
      durability: { timeoutMs: 30 },
    })

    const turn = session.prompt('slow', { inputId: 'slow-1' })

    await expect(turn).rejects.toThrow('The input passed its time limit.')
    expect(await session.settled('slow-1')).toMatchObject({
      outcome: 'failed',
      error: { code: 'timeout' },
    })
    await host.close()
  })

  it('stores the abort request before it cancels the turn', async () => {
    const persistence = durablePersistence()
    const { host, session, calls } = await openDurable({
      persistence,
      replies: [untilAborted()],
    })
    const turn = session.prompt('wait', { inputId: 'wait-1' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))

    await session.cancel(turn.id)

    await expect(turn).rejects.toThrow('Cancelled.')
    expect(await session.settled('wait-1')).toMatchObject({
      outcome: 'aborted',
    })
    const types = await recordTypes(persistence)
    expect(types.indexOf('harness.input.abort')).toBeLessThan(
      types.indexOf('harness.input.settled'),
    )
    await host.close()
  })
})

/**
 * A durable session whose first turn calls `hold`, which waits for
 * `release`. The turn then makes one more model call, where a steer joins.
 */
async function openHolding(replies: Array<Reply>) {
  const persistence = durablePersistence()
  const release = gate()
  const hold = toolDefinition({ name: 'hold', description: 'Hold' }).server(
    async () => {
      await release.opened
      return 'held'
    },
  )
  const opened = await openDurable({
    persistence,
    replies: [() => toolCall('hold', {}), ...replies],
    tools: [hold],
  })
  return { ...opened, persistence, release }
}

describe('waiting inputs', () => {
  it('lists the waiting inputs, and cancels a queued one so it never runs', async () => {
    const persistence = durablePersistence()
    const release = gate()
    const { host, session, calls } = await openDurable({
      persistence,
      replies: [after(release.opened, 'first done'), () => text('steer done')],
    })
    const first = session.prompt('first', { inputId: 'first' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await session.followUp('second', { inputId: 'second' })
    await session.steer('third', { inputId: 'third' })

    expect(session.inputs()).toEqual([
      { inputId: 'third', delivery: 'steer', message: 'third' },
      { inputId: 'second', delivery: 'queue', message: 'second' },
    ])
    expect(await session.cancelInput('second')).toMatchObject({
      status: 'accepted',
    })
    expect(await session.settled('second')).toMatchObject({
      outcome: 'aborted',
    })
    expect(session.inputs()).toEqual([
      { inputId: 'third', delivery: 'steer', message: 'third' },
    ])
    expect(await logRecords(persistence)).toContainEqual({
      type: 'harness.input.abort',
      inputId: 'second',
    })

    release.open()
    await first
    expect(await session.settled('third')).toMatchObject({
      outcome: 'completed',
    })
    expect(calls).toHaveLength(2)
    expect(calls.flatMap(messageTexts)).not.toContain('second')
    await host.close()
  })

  it('refuses to cancel an input that started', async () => {
    const release = gate()
    const { host, session, calls } = await openDurable({
      persistence: durablePersistence(),
      replies: [after(release.opened, 'done')],
    })
    const turn = session.prompt('first', { inputId: 'first' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))

    expect(await session.cancelInput('first')).toMatchObject({
      status: 'rejected',
      reason: 'not_waiting',
    })
    release.open()
    expect(await turn).toEqual({ text: 'done' })
    await host.close()
  })

  it('joins a queued input to the running turn with setDelivery steer', async () => {
    const { host, session, calls, persistence, release } = await openHolding([
      () => text('done'),
    ])
    const first = session.prompt('first', { inputId: 'first' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await session.followUp('later', { inputId: 'later' })

    expect(await session.setDelivery('later', 'steer')).toMatchObject({
      status: 'accepted',
    })
    expect(session.inputs()).toEqual([
      { inputId: 'later', delivery: 'steer', message: 'later' },
    ])
    expect(await logRecords(persistence)).toContainEqual({
      type: 'harness.input.delivery',
      inputId: 'later',
      delivery: 'steer',
    })

    release.open()
    await first
    expect(await session.settled('later')).toMatchObject({
      outcome: 'completed',
      operationId: first.id,
    })
    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1])).toContain('later')
    await host.close()
  })

  it('runs a steer as its own turn with setDelivery queue', async () => {
    const { host, session, calls, release } = await openHolding([
      () => text('done'),
      () => text('own turn'),
    ])
    const first = session.prompt('first', { inputId: 'first' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await session.steer('now', { inputId: 'now' })

    expect(await session.setDelivery('now', 'queue')).toMatchObject({
      status: 'accepted',
    })
    expect(session.inputs()).toEqual([
      { inputId: 'now', delivery: 'queue', message: 'now' },
    ])

    release.open()
    await first
    await session.settled('now')
    expect(calls).toHaveLength(3)
    expect(messageTexts(calls[1])).not.toContain('now')
    expect(messageTexts(calls[2])).toContain('now')
    await host.close()
  })

  const nothingLanded: Array<LogRecord> = []
  const abortLanded: Array<LogRecord> = [
    { type: 'harness.input.abort', inputId: 'in-1' },
    controlApplied,
  ]
  const deliveryLanded: Array<LogRecord> = [
    { type: 'harness.input.delivery', inputId: 'in-2', delivery: 'steer' },
    controlApplied,
  ]

  it.each([
    ['before its change landed', nothingLanded],
    ['after its change landed', abortLanded],
  ])(
    'recovery does not run an input after a cancelInput, crash %s',
    async (_when, landed) => {
      const persistence = durablePersistence()
      await persistence.stores.log.append(THREAD, 1, [
        pendingInput('in-1', 'go'),
        controlInput({ op: 'cancelInput', inputId: 'in-1' }),
        ...landed,
      ])

      const { host, session, calls } = await openDurable({
        persistence,
        replies: [() => text('never')],
      })

      expect(await session.settled('in-1')).toMatchObject({
        outcome: 'aborted',
      })
      expect(calls).toHaveLength(0)
      // Applied, not rejected with `expired_on_restart`.
      expect(await recordTypesOf(persistence, 'ctl-1')).toEqual([
        'harness.input',
        'harness.input.applied',
      ])
      await host.close()
    },
  )

  it.each([
    ['before its change landed', nothingLanded],
    ['after its change landed', deliveryLanded],
  ])(
    'recovery joins an input that a setDelivery sent to steer, crash %s',
    async (_when, landed) => {
      const persistence = durablePersistence()
      await persistence.stores.log.append(THREAD, 1, [
        pendingInput('in-1', 'first'),
        pendingInput('in-2', 'second'),
        controlInput({ op: 'setDelivery', inputId: 'in-2', delivery: 'steer' }),
        ...landed,
      ])

      const { host, session, calls } = await openDurable({
        persistence,
        replies: [() => text('both'), () => text('never')],
      })

      expect(await session.settled('in-2')).toMatchObject({
        outcome: 'completed',
      })
      expect(calls).toHaveLength(1)
      expect(messageTexts(calls[0])).toEqual(['first', 'second'])
      expect(await recordTypesOf(persistence, 'ctl-1')).toEqual([
        'harness.input',
        'harness.input.applied',
      ])
      await host.close()
    },
  )
})

describe('input ids', () => {
  it('returns the first operation for a duplicate, and runs once', async () => {
    const persistence = durablePersistence()
    const { host, session, calls } = await openDurable({
      persistence,
      replies: [() => text('once')],
    })

    const first = session.prompt('hi', { inputId: 'dup-1' })
    const again = session.prompt('hi', { inputId: 'dup-1' })

    expect(again).toBe(first)
    expect(await first).toEqual({ text: 'once' })
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('rejects the same id with another payload as a conflict', async () => {
    const persistence = durablePersistence()
    const { host, session } = await openDurable({
      persistence,
      replies: [() => text('first')],
    })
    await session.prompt('hi', { inputId: 'dup-1' })

    const other = session.prompt('something else', { inputId: 'dup-1' })

    await expect(other).rejects.toBeInstanceOf(InputRejectedError)
    expect(await other.receipt).toEqual({
      inputId: 'dup-1',
      status: 'rejected',
      reason: 'conflict',
    })
    expect(await session.followUp('x', { inputId: 'dup-1' })).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    await host.close()
  })

  it('settles a duplicate after a restart from the log, with no model call', async () => {
    const persistence = durablePersistence()
    const first = await openDurable({
      persistence,
      replies: [() => text('from the first host')],
    })
    const original = first.session.prompt('hi', { inputId: 'dup-1' })
    await original
    await first.host.close()

    const second = await openDurable({
      persistence,
      replies: [() => text('never')],
    })
    const replay = second.session.prompt('hi', { inputId: 'dup-1' })

    expect(await replay).toEqual({ text: 'from the first host' })
    expect(await replay.receipt).toEqual({
      inputId: 'dup-1',
      status: 'accepted',
      operationId: original.id,
    })
    expect(second.calls).toHaveLength(0)
    await second.host.close()
  })

  it('resolves the receipt when the input is in the log, before the turn ends', async () => {
    const persistence = durablePersistence()
    const release = gate()
    const { host, session } = await openDurable({
      persistence,
      replies: [
        () =>
          (async function* () {
            await release.opened
            yield* text('late')
          })(),
      ],
    })

    const turn = session.prompt('hi', { inputId: 'r-1' })
    const receipt = await turn.receipt

    expect(receipt).toEqual({
      inputId: 'r-1',
      status: 'accepted',
      operationId: turn.id,
    })
    expect(await recordTypes(persistence)).toContain('harness.input')
    expect(turn.status()).not.toBe('completed')
    release.open()
    await turn
    await host.close()
  })
})

describe('settled() without a log', () => {
  it('gives the outcome of a live input, and refuses an unknown id', async () => {
    const { adapter } = mockAdapter([() => text('fine')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({ name: 'test/settled', adapter }),
      { threadId: THREAD },
    )

    const turn = session.prompt('hi', { inputId: 'live-1' })
    await turn

    expect(await session.settled('live-1')).toEqual({
      inputId: 'live-1',
      outcome: 'completed',
      operationId: turn.id,
    })
    await expect(session.settled('missing')).rejects.toThrow(
      'knows no chat input',
    )
    await host.close()
  })
})

describe('durable approval recovery', () => {
  it('uses up the approval when a resume hits the time limit after its tool ran', async () => {
    const stores = memoryPersistence().stores
    const persistence = {
      stores: {
        log: memoryLogStore(),
        runs: stores.runs,
        metadata: stores.metadata,
        interrupts: stores.interrupts,
      },
    }
    const execute = vi.fn(async () => 'removed')
    const tool = toolDefinition({
      name: 'remove',
      description: 'Remove',
      needsApproval: true,
    }).server(execute)
    const main = mockAdapter([
      () => toolCall('remove', {}, 'timeout-approval'),
      untilAborted(),
    ])
    const config = defineHarness({
      name: 'approval-timeout',
      adapter: main.adapter,
      tools: [tool],
      durability: { timeoutMs: 30 },
    })
    const host = createHarnessHost({ persistence })
    const session = await host.open(config, { threadId: THREAD })
    const initial = await session.prompt('remove')
    const approval = initial.interrupts?.[0]
    if (!approval) throw new Error('The turn did not stop for approval.')
    const receipt = await session.resolve([
      { interruptId: approval.id, status: 'resolved', payload: true },
    ])
    await expect(session.operation(receipt.operationId ?? '')).rejects.toThrow(
      'time limit',
    )
    expect(await session.settled(receipt.inputId)).toMatchObject({
      outcome: 'failed',
      error: { code: 'timeout' },
    })
    // The approved tool ran before the time limit. Offering the approval
    // again would run it a second time, so it is used up.
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.snapshot().pendingInterrupts).toEqual([])
    expect((await stores.interrupts.get(approval.id))?.status).toBe('resolved')
    await host.close()
    const next = createHarnessHost({ persistence })
    const reopened = await next.open(config, { threadId: THREAD })
    expect(reopened.snapshot().pendingInterrupts).toEqual([])
    expect(
      await reopened.resolve([
        { interruptId: approval.id, status: 'resolved', payload: true },
      ]),
    ).toMatchObject({ status: 'rejected', reason: 'no_pending_interrupts' })
    expect(execute).toHaveBeenCalledTimes(1)
    await next.close()
  })

  it.each(['applied', 'lease'])(
    'keeps approval after an early %s failure',
    async (kind) => {
      const stores = memoryPersistence().stores
      const log = memoryLogStore()
      const leases: LeaseStore = {
        acquire: vi.fn(async () => {}),
        renew: vi.fn(async () => {}),
        release: vi.fn(async () => {}),
        isAlive: async () => false,
      }
      const persistence = {
        stores: {
          runs: stores.runs,
          metadata: stores.metadata,
          interrupts: stores.interrupts,
          log,
          leases,
        },
      }
      const execute = vi.fn(async () => 'removed')
      const tool = toolDefinition({
        name: 'remove',
        description: 'Remove',
        needsApproval: true,
      }).server(execute)
      const main = mockAdapter([
        () => toolCall('remove', {}, 'early-call'),
        () => text('Done.'),
      ])
      const config = defineHarness({
        name: 'early-approval',
        adapter: main.adapter,
        tools: [tool],
      })
      const host = createHarnessHost({ persistence })
      const session = await host.open(config, { threadId: THREAD })
      const result = await session.prompt('remove')
      const approval = result.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      const append = log.append.bind(log)
      const write = vi
        .spyOn(log, 'append')
        .mockImplementation(async (thread, seq, records) => {
          if (
            kind === 'applied' &&
            records.some((record) => record.type === 'harness.input.applied')
          )
            throw new Error('applied write failed')
          await append(thread, seq, records)
        })
      const lease = vi.spyOn(leases, 'acquire')
      if (kind === 'lease')
        lease.mockRejectedValueOnce(new Error('lease acquire failed'))
      const receipt = await session.resolve([
        { interruptId: approval.id, status: 'resolved', payload: true },
      ])
      await expect(
        session.operation(receipt.operationId ?? ''),
      ).rejects.toThrow()
      expect(
        session.snapshot().pendingInterrupts.map((item) => item.id),
      ).toEqual([approval.id])
      expect(execute).not.toHaveBeenCalled()
      write.mockRestore()
      lease.mockRestore()
      await host.close()
      const next = createHarnessHost({ persistence })
      const reopened = await next.open(config, { threadId: THREAD })
      if (kind === 'lease') await reopened.settled(receipt.inputId)
      // An applied lease failure can be retried by durable recovery itself.
      if (reopened.snapshot().pendingInterrupts.length > 0) {
        const retry = await reopened.resolve([
          { interruptId: approval.id, status: 'resolved', payload: true },
        ])
        await reopened.operation(retry.operationId ?? '')
      }
      expect(execute).toHaveBeenCalledTimes(1)
      expect(reopened.snapshot().pendingInterrupts).toEqual([])
      await next.close()
    },
  )

  it.each([false, true])(
    'replays an applied resolve after a crash (interrupt store: %s)',
    async (withStore) => {
      const stores = memoryPersistence().stores
      const log = memoryLogStore()
      const persistence = {
        stores: {
          runs: stores.runs,
          metadata: stores.metadata,
          ...(withStore ? { interrupts: stores.interrupts } : {}),
          log,
        },
      }
      const execute = vi.fn(async () => 'removed')
      const tool = toolDefinition({
        name: 'remove',
        description: 'Remove',
        needsApproval: true,
        inputSchema: z.object({ path: z.string() }),
      }).server(execute)
      const firstAdapter = mockAdapter([
        () => toolCall('remove', { path: 'a.txt' }, 'crash-call'),
      ])
      const first = createHarnessHost({ persistence })
      const firstSession = await first.open(
        defineHarness({
          name: 'crash-approval',
          adapter: firstAdapter.adapter,
          tools: [tool],
        }),
        { threadId: THREAD },
      )
      const result = await firstSession.prompt('remove')
      const approval = result.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      await first.close()
      const entries = await log.read(THREAD)
      await log.append(THREAD, entries.length + 1, [
        {
          type: 'harness.input',
          inputId: 'resume-crash',
          input: {
            op: 'resolve',
            resume: [
              { interruptId: approval.id, status: 'resolved', payload: true },
            ],
          },
          at: Date.now(),
        },
        {
          type: 'harness.input.applied',
          inputId: 'resume-crash',
          operationId: 'resume-stopped',
          attempt: 1,
        },
      ])
      await stores.runs.createOrResume({
        runId: 'resume-stopped',
        threadId: THREAD,
        startedAt: Date.now() - 60000,
      })
      await stores.runs.update('resume-stopped', {
        leaseExpiresAt: Date.now() - 1000,
        leaseOwner: 'gone',
      })
      const nextAdapter = mockAdapter([() => text('Recovered approval.')])
      const next = createHarnessHost({ persistence })
      const session = await next.open(
        defineHarness({
          name: 'crash-approval',
          adapter: nextAdapter.adapter,
          tools: [tool],
        }),
        { threadId: THREAD },
      )
      expect(await session.settled('resume-crash')).toMatchObject({
        outcome: 'completed',
      })
      expect(execute).toHaveBeenCalledExactlyOnceWith(
        { path: 'a.txt' },
        expect.anything(),
      )
      expect(nextAdapter.calls).toHaveLength(1)
      expect(session.snapshot().pendingInterrupts).toEqual([])
      await next.close()
    },
  )

  it.each([false, true])(
    'does not revive a consumed approval after a delete failure (interrupt store: %s)',
    async (withStore) => {
      const stores = memoryPersistence().stores
      const log = memoryLogStore()
      const persistence = {
        stores: {
          runs: stores.runs,
          metadata: stores.metadata,
          ...(withStore ? { interrupts: stores.interrupts } : {}),
          log,
        },
      }
      const execute = vi.fn(async () => 'removed')
      const tool = toolDefinition({
        name: 'remove',
        description: 'Remove',
        needsApproval: true,
      }).server(execute)
      const adapter = mockAdapter([
        () => toolCall('remove', {}, 'consumed-call'),
        () => text('Done.'),
      ])
      const host = createHarnessHost({ persistence })
      const config = defineHarness({
        name: 'consumed-approval',
        adapter: adapter.adapter,
        tools: [tool],
      })
      const session = await host.open(config, { threadId: THREAD })
      const result = await session.prompt('remove')
      const approval = result.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      const cached = await stores.metadata.get('harness:interrupted', THREAD)
      const deletion = vi
        .spyOn(stores.metadata, 'delete')
        .mockRejectedValueOnce(new Error('metadata delete failed'))
      const receipt = await session.resolve([
        { interruptId: approval.id, status: 'resolved', payload: true },
      ])
      await session.operation(receipt.operationId ?? '')
      deletion.mockRestore()
      expect(session.snapshot().pendingInterrupts).toEqual([])
      await host.close()
      await stores.metadata.set('harness:interrupted', THREAD, cached)
      const next = createHarnessHost({ persistence })
      const reopened = await next.open(config, { threadId: THREAD })
      expect(reopened.snapshot().pendingInterrupts).toEqual([])
      expect(
        await reopened.resolve([
          { interruptId: approval.id, status: 'resolved', payload: true },
        ]),
      ).toMatchObject({ status: 'rejected', reason: 'no_pending_interrupts' })
      expect(execute).toHaveBeenCalledTimes(1)
      await next.close()
    },
  )
})

describe('metadata-only approval consumption', () => {
  it('keeps a consumed approval cleared after one metadata delete failure', async () => {
    const stores = memoryPersistence().stores
    const persistence = {
      stores: {
        messages: stores.messages,
        runs: stores.runs,
        metadata: stores.metadata,
      },
    }
    const execute = vi.fn(async () => 'removed')
    const tool = toolDefinition({
      name: 'remove',
      description: 'Remove',
      needsApproval: true,
    }).server(execute)
    const main = mockAdapter([
      () => toolCall('remove', {}, 'metadata-only-call'),
      () => text('Done.'),
    ])
    const config = defineHarness({
      name: 'metadata-only-approval',
      adapter: main.adapter,
      tools: [tool],
    })
    const host = createHarnessHost({ persistence })
    const session = await host.open(config, { threadId: THREAD })
    const initial = await session.prompt('remove')
    const approval = initial.interrupts?.[0]
    if (!approval) throw new Error('The approval is missing.')
    const deletion = vi
      .spyOn(stores.metadata, 'delete')
      .mockRejectedValueOnce(new Error('delete unavailable'))
    const receipt = await session.resolve([
      { interruptId: approval.id, status: 'resolved', payload: true },
    ])
    await session.operation(receipt.operationId ?? '')
    deletion.mockRestore()
    expect(session.snapshot().pendingInterrupts).toEqual([])
    await host.close()
    const next = createHarnessHost({ persistence })
    const reopened = await next.open(config, { threadId: THREAD })
    expect(reopened.snapshot().pendingInterrupts).toEqual([])
    expect(execute).toHaveBeenCalledTimes(1)
    await next.close()
  })
})
