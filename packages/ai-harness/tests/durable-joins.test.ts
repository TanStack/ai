import { describe, expect, it, vi } from 'vitest'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
} from './helpers'
import type { AnyTool, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { LogRecord, LogStore } from '@tanstack/ai-persistence'
import type { HarnessTurnOptions } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/**
 * A durable store set. `batches` has the record types of each append.
 * `before` runs before each append, so it can hold or refuse the append.
 */
function durablePersistence(
  before?: (records: ReadonlyArray<LogRecord>) => void | Promise<void>,
) {
  const inner = memoryLogStore()
  const batches: Array<Array<string>> = []
  const log: LogStore = {
    append: async (threadId, seq, records) => {
      await before?.(records)
      await inner.append(threadId, seq, records)
      batches.push(records.map((record) => record.type))
    },
    read: (threadId, options) => inner.read(threadId, options),
    subscribe: (threadId, listener) => inner.subscribe(threadId, listener),
  }
  const { runs, metadata } = memoryPersistence().stores
  return { persistence: { stores: { log, runs, metadata } }, batches, inner }
}

type Durable = ReturnType<typeof durablePersistence>['persistence']

async function openDurable(
  persistence: Durable,
  replies: Array<Reply>,
  tools: Array<AnyTool> = [],
  turn?: HarnessTurnOptions,
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/joins',
      adapter,
      tools,
      ...(turn ? { turn } : {}),
    }),
    { threadId: THREAD },
  )
  return { host, session, calls }
}

/** A model call that fails. */
const fails: Reply = () =>
  (async function* (): AsyncGenerator<StreamChunk> {
    yield {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: Date.now(),
    }
    throw new Error('model down')
  })()

/**
 * The log and run of a host that stopped during input `in-1`. With
 * `joined`, input `in-2` had joined it: its join record and its message are
 * in one append. Without it, `in-2` was only accepted.
 */
async function seedStoppedTurn(
  persistence: Durable,
  options: { joined: boolean },
) {
  const go: ModelMessage = { id: 'u1', role: 'user', content: 'go' }
  const more: ModelMessage = { id: 'u2', role: 'user', content: 'and more' }
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
      attempt: 1,
    },
    { type: 'harness.transcript', keep: 0, add: [go] },
    {
      type: 'harness.input',
      inputId: 'in-2',
      input: { op: 'prompt', message: 'and more', busy: 'steer' },
      at: 2,
    },
    ...(options.joined
      ? [
          { type: 'harness.transcript', keep: 1, add: [more] },
          { type: 'harness.input.joined', inputId: 'in-2', into: 'in-1' },
        ]
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

describe('durable joins', () => {
  it('joins three inputs in admission order at the next boundary, in one append', async () => {
    const { persistence, batches } = durablePersistence()
    const toolDone = gate()
    const toolStarted = gate()
    const wait = toolDefinition({ name: 'wait', description: 'Wait' }).server(
      async () => {
        toolStarted.open()
        await toolDone.opened
        return 'waited'
      },
    )
    const { host, session, calls } = await openDurable(
      persistence,
      [() => toolCall('wait', {}), () => text('all three answered')],
      [wait],
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await toolStarted.opened
    const joins = ['a', 'b', 'c'].map((name) =>
      session.prompt(name, { busy: 'steer', inputId: `join-${name}` }),
    )
    await Promise.all(joins.map((join) => join.receipt))
    toolDone.open()
    await turn

    expect(messageTexts(calls[1]).slice(-3)).toEqual(['a', 'b', 'c'])
    const joinBatch = batches.find((batch) =>
      batch.includes('harness.input.joined'),
    )
    expect(
      joinBatch?.filter((type) => type === 'harness.input.joined'),
    ).toHaveLength(3)
    expect(joinBatch).toContain('harness.transcript')
    for (const name of ['a', 'b', 'c']) {
      expect(await session.settled(`join-${name}`)).toEqual({
        inputId: `join-${name}`,
        outcome: 'completed',
        operationId: turn.id,
      })
    }
    await host.close()
  })

  it('answers a join that arrives after the last tool call in the same turn', async () => {
    const { persistence } = durablePersistence()
    const release = gate()
    const { host, session, calls } = await openDurable(persistence, [
      after(release.opened, 'first answer'),
      () => text('late answer'),
    ])

    const turn = session.prompt('first', { inputId: 'host' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const late = session.prompt('one more thing', {
      busy: 'steer',
      inputId: 'late',
    })
    await late.receipt
    release.open()

    expect(await turn).toEqual({ text: 'first answerlate answer' })
    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1]).at(-1)).toBe('one more thing')
    expect(await session.settled('late')).toMatchObject({
      outcome: 'completed',
      operationId: turn.id,
    })
    await host.close()
  })

  it('settles the joined inputs failed when the turn fails', async () => {
    const { persistence } = durablePersistence()
    const release = gate()
    const { host, session, calls } = await openDurable(persistence, [
      after(release.opened, 'first answer'),
      fails,
    ])

    const turn = session.prompt('first', { inputId: 'host' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const late = session.prompt('this fails', {
      busy: 'steer',
      inputId: 'late',
    })
    await late.receipt
    release.open()

    await expect(turn).rejects.toThrow('model down')
    const expected = {
      outcome: 'failed',
      operationId: turn.id,
      error: { message: 'model down' },
    }
    expect(await session.settled('host')).toMatchObject(expected)
    expect(await session.settled('late')).toMatchObject(expected)
    await host.close()
  })
})

describe('recovery of durable joins', () => {
  it('adopts a join whose record is in the log: it settles with the next attempt', async () => {
    const { persistence } = durablePersistence()
    await seedStoppedTurn(persistence, { joined: true })

    const { host, session, calls } = await openDurable(persistence, [
      () => text('answered both'),
    ])
    const host1 = await session.settled('in-1')

    expect(calls).toHaveLength(1)
    expect(messageTexts(calls[0]).slice(-2)).toEqual(['go', 'and more'])
    expect(host1.outcome).toBe('completed')
    expect(await session.settled('in-2')).toEqual({
      inputId: 'in-2',
      outcome: 'completed',
      operationId: host1.operationId,
    })
    await host.close()
  })

  it('runs an input whose join record is not in the log as its own turn', async () => {
    const { persistence } = durablePersistence()
    await seedStoppedTurn(persistence, { joined: false })

    const { host, session, calls } = await openDurable(persistence, [
      () => text('answer to go'),
      () => text('answer to more'),
    ])
    const first = await session.settled('in-1')
    const second = await session.settled('in-2')

    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1]).at(-1)).toBe('and more')
    expect(first.outcome).toBe('completed')
    expect(second.outcome).toBe('completed')
    expect(second.operationId).not.toBe(first.operationId)
    await host.close()
  })
})

describe('the join rule', () => {
  const waitTool = () => {
    const started = gate()
    const done = gate()
    const tool = toolDefinition({ name: 'wait', description: 'Wait' }).server(
      async () => {
        started.open()
        await done.opened
        return 'waited'
      },
    )
    return { tool, started, done }
  }

  it('joins A, stops at B with an abort request, and runs C as its own turn', async () => {
    const { persistence } = durablePersistence()
    const wait = waitTool()
    const { host, session, calls } = await openDurable(
      persistence,
      [
        () => toolCall('wait', {}),
        () => text('answer a'),
        () => text('answer c'),
      ],
      [wait.tool],
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    const steer = (name: string) =>
      session.prompt(name, { busy: 'steer', inputId: `join-${name}` })
    const a = steer('a')
    const b = steer('b')
    const c = steer('c')
    await Promise.all([a, b, c].map((join) => join.receipt))
    await session.cancel(b.id)
    wait.done.open()

    await turn
    expect(messageTexts(calls[1]).at(-1)).toBe('a')
    expect(await session.settled('join-a')).toMatchObject({
      outcome: 'completed',
      operationId: turn.id,
    })
    expect(await session.settled('join-b')).toMatchObject({
      outcome: 'aborted',
    })
    await expect(b).rejects.toThrow()
    const ownTurn = await session.settled('join-c')
    expect(ownTurn).toMatchObject({ outcome: 'completed' })
    expect(ownTurn.operationId).not.toBe(turn.id)
    expect(messageTexts(calls[2]).at(-1)).toBe('c')
    await host.close()
  })

  it('runs an input that canJoin refuses as its own turn later', async () => {
    const { persistence } = durablePersistence()
    const wait = waitTool()
    const { adapter, calls } = mockAdapter([
      () => toolCall('wait', {}),
      () => text('host answer'),
      () => text('later answer'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/joins',
        adapter,
        tools: [wait.tool],
        turn: { canJoin: ({ message }) => message !== 'later' },
      }),
      { threadId: THREAD },
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    const later = session.prompt('later', { busy: 'steer', inputId: 'later' })
    await later.receipt
    wait.done.open()

    await turn
    expect(messageTexts(calls[1])).not.toContain('later')
    expect(await later).toEqual({ text: 'later answer' })
    expect((await session.settled('later')).operationId).not.toBe(turn.id)
    await host.close()
  })

  it('lands the onJoin records in the append of the join', async () => {
    const { persistence, batches } = durablePersistence()
    const wait = waitTool()
    const { adapter } = mockAdapter([
      () => toolCall('wait', {}),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/joins',
        adapter,
        tools: [wait.tool],
        turn: {
          onJoin: ({ inputs }) => ({
            records: inputs.map((input) => ({
              type: 'app.start_hook',
              inputId: input.inputId,
            })),
          }),
        },
      }),
      { threadId: THREAD },
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    await session.prompt('more', { busy: 'steer', inputId: 'join-1' }).receipt
    wait.done.open()
    await turn

    const joinBatch = batches.find((batch) =>
      batch.includes('harness.input.joined'),
    )
    expect(joinBatch).toContain('app.start_hook')
    await host.close()
  })

  it('leaves neither the join nor the onJoin records when that append fails', async () => {
    const { persistence, inner } = durablePersistence((records) => {
      if (records.some((record) => record.type === 'harness.input.joined')) {
        throw new Error('store down')
      }
    })
    const wait = waitTool()
    const { host, session } = await openDurable(
      persistence,
      [() => toolCall('wait', {}), () => text('never')],
      [wait.tool],
      { onJoin: () => ({ records: [{ type: 'app.start_hook' }] }) },
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    const join = session.prompt('more', { busy: 'steer', inputId: 'join-1' })
    await join.receipt
    wait.done.open()
    await expect(turn).rejects.toThrow()
    // It did not join, so it ends with the session that stopped.
    await expect(join).rejects.toThrow('Session closed.')

    const types = (await inner.read(THREAD)).map((entry) => entry.record.type)
    expect(types).not.toContain('harness.input.joined')
    expect(types).not.toContain('app.start_hook')
    await host.close().catch(() => {})

    // The next host runs it as its own turn.
    const next = await openDurable(
      { stores: { ...persistence.stores, log: inner } },
      [() => text('host answer'), () => text('join answer')],
    )
    const settled = await next.session.settled('join-1')
    expect(settled.outcome).toBe('completed')
    expect(settled.operationId).not.toBe(turn.id)
    await next.host.close()
  })

  it('stops the join at a refused input, so the inputs after it wait too', async () => {
    const { persistence } = durablePersistence()
    const wait = waitTool()
    const { host, session, calls } = await openDurable(
      persistence,
      [
        () => toolCall('wait', {}),
        () => text('host answer'),
        () => text('answer x'),
        () => text('answer y'),
      ],
      [wait.tool],
      { canJoin: ({ message }) => message !== 'x' },
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    const x = session.prompt('x', { busy: 'steer', inputId: 'x' })
    const y = session.prompt('y', { busy: 'steer', inputId: 'y' })
    await Promise.all([x.receipt, y.receipt])
    wait.done.open()

    await turn
    expect(messageTexts(calls[1])).not.toContain('y')
    expect(await x).toEqual({ text: 'answer x' })
    expect(await y).toEqual({ text: 'answer y' })
    expect(messageTexts(calls[2]).at(-1)).toBe('x')
    expect(messageTexts(calls[3]).at(-1)).toBe('y')
    await host.close()
  })

  it('adds the onJoin messages after the joined ones', async () => {
    const { persistence } = durablePersistence()
    const wait = waitTool()
    const { host, session, calls } = await openDurable(
      persistence,
      [() => toolCall('wait', {}), () => text('done')],
      [wait.tool],
      { onJoin: () => ({ messages: [{ role: 'user', content: 'hook' }] }) },
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    await session.prompt('more', { busy: 'steer', inputId: 'join-1' }).receipt
    wait.done.open()

    await turn
    expect(messageTexts(calls[1]).slice(-2)).toEqual(['more', 'hook'])
    await host.close()
  })

  it('gives the onJoin ephemeral messages to the model call of the join only', async () => {
    const { persistence, inner } = durablePersistence()
    const wait = waitTool()
    const { host, session, calls } = await openDurable(
      persistence,
      [() => toolCall('wait', {}), () => text('done')],
      [wait.tool],
      {
        onJoin: () => ({ ephemeral: [{ role: 'user', content: 'only now' }] }),
      },
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    await session.prompt('more', { busy: 'steer', inputId: 'join-1' }).receipt
    wait.done.open()

    await turn
    expect(messageTexts(calls[1]).slice(-2)).toEqual(['more', 'only now'])
    expect(JSON.stringify(await inner.read(THREAD))).not.toContain('only now')
    await host.close()
  })

  it('refuses a cancel that lands while onJoin runs, and logs no abort for it', async () => {
    const { persistence, inner } = durablePersistence()
    const wait = waitTool()
    const inJoin = gate()
    const releaseJoin = gate()
    const { host, session, calls } = await openDurable(
      persistence,
      [() => toolCall('wait', {}), () => text('host answer')],
      [wait.tool],
      {
        onJoin: async () => {
          inJoin.open()
          await releaseJoin.opened
          return undefined
        },
      },
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    const steer = session.prompt('stop me', { busy: 'steer', inputId: 's1' })
    await steer.receipt
    wait.done.open()
    await inJoin.opened
    const receipt = await session.cancel(steer.id)
    releaseJoin.open()

    expect(receipt).toMatchObject({ status: 'rejected', reason: 'not_running' })
    expect(await steer).toEqual(await turn)
    expect(messageTexts(calls[1]).at(-1)).toBe('stop me')
    expect(await session.settled('s1')).toMatchObject({
      outcome: 'completed',
      operationId: turn.id,
    })
    const types = (await inner.read(THREAD))
      .map((entry) => entry.record)
      .filter((record) => record.inputId === 's1')
      .map((record) => record.type)
    expect(types).not.toContain('harness.input.abort')
    await host.close()
  })

  it('does not join a steer while its abort append is in flight', async () => {
    const inAbort = gate()
    const releaseAbort = gate()
    const { persistence } = durablePersistence(async (records) => {
      if (records.some((record) => record.type === 'harness.input.abort')) {
        inAbort.open()
        await releaseAbort.opened
      }
    })
    const wait = waitTool()
    let cancelled: Promise<unknown> | undefined
    const { host, session, calls } = await openDurable(
      persistence,
      [() => toolCall('wait', {}), () => text('answer a')],
      [wait.tool],
      {
        // The cancel of s1 lands while the join runs, and its append waits.
        canJoin: async ({ inputId }) => {
          if (inputId === 'join-a') {
            cancelled = session.cancel(steer.id)
            await inAbort.opened
          }
          return true
        },
      },
    )

    const turn = session.prompt('start', { inputId: 'host' })
    await wait.started.opened
    const a = session.prompt('a', { busy: 'steer', inputId: 'join-a' })
    const steer = session.prompt('stop me', { busy: 'steer', inputId: 's1' })
    await Promise.all([a.receipt, steer.receipt])
    wait.done.open()
    await vi.waitFor(() => expect(cancelled).toBeDefined())
    releaseAbort.open()

    expect(await cancelled).toMatchObject({ status: 'accepted' })
    await turn
    expect(messageTexts(calls[1])).not.toContain('stop me')
    expect(messageTexts(calls[1]).at(-1)).toBe('a')
    expect(await session.settled('s1')).toMatchObject({ outcome: 'aborted' })
    await expect(steer).rejects.toThrow()
    expect(calls).toHaveLength(2)
    await host.close()
  })

  it('ends a waiting steer when the apply of the turn fails, so close resolves', async () => {
    const { persistence } = durablePersistence((records) => {
      const isHostApply = records.some(
        (record) =>
          record.type === 'harness.input.applied' && record.inputId === 'host',
      )
      if (isHostApply) throw new Error('store down')
    })
    const { host, session } = await openDurable(persistence, [
      () => text('never'),
    ])

    const turn = session.prompt('start', { inputId: 'host' })
    const steer = session.prompt('more', { busy: 'steer', inputId: 's1' })
    await expect(turn).rejects.toThrow('store down')
    await expect(steer).rejects.toThrow('Session closed.')
    await session.close()
    await host.close()
  })
})
