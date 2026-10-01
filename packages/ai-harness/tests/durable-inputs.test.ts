import { describe, expect, it, vi } from 'vitest'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { InputRejectedError, createHarnessHost, defineHarness } from '../src'
import { gate, mockAdapter, text, untilAborted } from './helpers'
import type { ModelMessage } from '@tanstack/ai'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { HarnessDurability } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

function durablePersistence() {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

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
    {
      type: 'harness.input',
      inputId: 'in-1',
      input: { op: 'prompt', message: 'go', busy: 'queue' },
      at: 1,
    },
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
}) {
  const { adapter, calls } = mockAdapter(options.replies)
  const host = createHarnessHost({ persistence: options.persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/durable-inputs',
      adapter,
      ...(options.durability ? { durability: options.durability } : {}),
    }),
    { threadId: THREAD },
  )
  return { host, session, calls }
}

const recordTypes = async (persistence: Durable) =>
  (await persistence.stores.log.read(THREAD)).map((entry) => entry.record.type)

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
    const applied = (await persistence.stores.log.read(THREAD))
      .map((entry) => entry.record)
      .filter((record) => record.type === 'harness.input.applied')
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
      {
        type: 'harness.input',
        inputId: 'in-1',
        input: { op: 'prompt', message: 'go', busy: 'queue' },
        at: 1,
      },
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
      {
        type: 'harness.input',
        inputId: 'in-new',
        input: { op: 'prompt', message: 'later', busy: 'queue' },
        at: 1,
      },
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
