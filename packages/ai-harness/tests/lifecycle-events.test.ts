import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, durableTool, logIdOf } from '../src'
import { workspaceTools } from '../src/first-party/coding/workspace'
import {
  CRASHING_OWNERSHIP,
  after,
  appendToLog,
  gate,
  mockAdapter,
  ownershipExpired,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { LogStore } from '@tanstack/ai-persistence'
import type { BoundWorkspace } from '../src/first-party/coding/backend'
import type { HarnessEventValues, HarnessSession } from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The values of the `name` events in the log of `threadId`, in log order. */
async function valuesOf<TName extends keyof HarnessEventValues>(
  log: LogStore,
  threadId: string,
  name: TName,
): Promise<Array<unknown>> {
  const entries = await log.read({ logId: logIdOf({ logId: threadId }) })
  return entries.flatMap(({ record }) => {
    const { event } = record
    return record.type === 'harness.event' &&
      isObject(event) &&
      event.type === EventType.CUSTOM &&
      event.name === name
      ? [event.value]
      : []
  })
}

/** A host on `log` with the session of `threadId` open. */
async function openOn(
  log: LogStore,
  replies: Array<Reply>,
  options: {
    crashes?: boolean
    tools?: Parameters<typeof defineHarness>[0]['tools']
    plugins?: Parameters<typeof defineHarness>[0]['plugins']
    threadId?: string
  } = {},
) {
  const host = createHarnessHost({
    persistence: { stores: { log } },
    ...(options.crashes ? { ownership: CRASHING_OWNERSHIP } : {}),
  })
  const session: HarnessSession = await host.open(
    defineHarness({
      name: 'test/lifecycle',
      adapter: mockAdapter(replies).adapter,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.plugins ? { plugins: options.plugins } : {}),
    }),
    { threadId: options.threadId ?? THREAD },
  )
  return { host, session }
}

describe('harness.input.queued', () => {
  it('comes for an input that waits behind the running turn, with its delivery', async () => {
    const log = memoryLogStore()
    const first = gate()
    const { host, session } = await openOn(log, [
      after(first.opened, 'one'),
      () => text('two'),
      () => text('three'),
    ])
    const running = session.send('one', { inputId: 'in-1' })
    await waitFor(() => expect(session.snapshot().status).toBe('running'))

    const queued = session.send('two', { inputId: 'in-2' })
    const steered = session.send('three', { inputId: 'in-3', mode: 'steer' })
    await waitFor(async () =>
      expect(await valuesOf(log, THREAD, 'harness.input.queued')).toEqual([
        { inputId: 'in-2', delivery: 'queue' },
        { inputId: 'in-3', delivery: 'steer' },
      ]),
    )
    first.open()
    await Promise.all([running, queued, steered])
    await host.close()
  })

  it('does not come for an input that runs at once', async () => {
    const log = memoryLogStore()
    const { host, session } = await openOn(log, [() => text('one')])

    await session.send('one')

    expect(await valuesOf(log, THREAD, 'harness.input.queued')).toEqual([])
    await host.close()
  })
})

describe('harness.ownership.changed', () => {
  it('comes once when the first host acquires the log, not when it acquires it again', async () => {
    const log = memoryLogStore()
    const { host, session } = await openOn(log, [
      () => text('one'),
      () => text('two'),
    ])

    const release = vi.spyOn(log, 'releaseOwnership')
    await session.send('one')
    // An idle host gives the log up. The next turn acquires it again.
    await waitFor(() => expect(release).toHaveBeenCalled())
    await session.send('two')
    await host.close()

    expect(await valuesOf(log, THREAD, 'harness.ownership.changed')).toEqual([
      { epoch: 1, reason: 'acquired' },
    ])
    // The host had the log at more than one epoch.
    const other = await log.acquireOwnership({
      logId: logIdOf({ logId: THREAD }),
      harness: 'other-host',
      ownerId: 'other-host',
      ttlMs: 60_000,
    })
    expect(other?.epoch).toBeGreaterThan(2)
  })

  it('says taken_over when a host takes the log with the work of a stopped host', async () => {
    const log = memoryLogStore()
    const first = await openOn(log, [untilAborted()], { crashes: true })
    void Promise.resolve(first.session.send('one', { inputId: 'in-1' })).catch(
      () => {},
    )
    await waitFor(() => expect(first.session.snapshot().status).toBe('running'))
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    const next = await openOn(log, [() => text('one again')])
    await next.session.settled({ inputId: 'in-1' })

    await waitFor(async () =>
      expect(await valuesOf(log, THREAD, 'harness.ownership.changed')).toEqual([
        { epoch: 1, reason: 'acquired' },
        { epoch: 2, reason: 'taken_over' },
      ]),
    )
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('says acquired when the old owner gave the log back with work left', async () => {
    const log = memoryLogStore()
    const first = await openOn(log, [untilAborted()])
    void Promise.resolve(first.session.send('one', { inputId: 'in-1' })).catch(
      () => {},
    )
    await waitFor(() => expect(first.session.snapshot().status).toBe('running'))
    // A graceful stop: the host releases the log, and the input waits.
    await first.host.close({ recoverable: true })

    const next = await openOn(log, [() => text('one again')])
    await next.session.settled({ inputId: 'in-1' })

    await waitFor(async () =>
      expect(await valuesOf(log, THREAD, 'harness.ownership.changed')).toEqual([
        { epoch: 1, reason: 'acquired' },
        { epoch: 2, reason: 'acquired' },
      ]),
    )
    await next.host.close()
  })
})

describe('harness.wait.opened and harness.wait.settled', () => {
  /** A durable tool that asks for a name, and returns it. */
  const greet = durableTool(
    toolDefinition({
      name: 'greet',
      description: 'Ask the user for a name',
      inputSchema: z.object({}),
    }),
    async (_args, { step }) => {
      const name = await step.ask({
        name: 'name',
        message: 'Name?',
        schema: z.object({ name: z.string() }),
      })
      return `Hello, ${name.name}.`
    },
  )

  it('come when a wait opens in the log, and when its answer ends it', async () => {
    const log = memoryLogStore()
    const { host, session } = await openOn(
      log,
      [() => toolCall('greet', {}, 'call-1'), () => text('ok')],
      { tools: [greet] },
    )
    const turn = session.send('greet me')
    await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
    const opened = await valuesOf(log, THREAD, 'harness.wait.opened')
    expect(opened).toEqual([
      {
        waitId: 'ask:call-1:name',
        kind: 'question',
        runId: turn.id,
        message: 'Name?',
        ...(isObject(opened[0]) && opened[0].expiresAt !== undefined
          ? { expiresAt: expect.any(Number) }
          : {}),
      },
    ])

    await session.answer({
      questionId: 'ask:call-1:name',
      value: { name: 'Ada' },
    })
    await turn

    await waitFor(async () =>
      expect(await valuesOf(log, THREAD, 'harness.wait.settled')).toEqual([
        { waitId: 'ask:call-1:name', outcome: 'answered' },
      ]),
    )
    await host.close()
  })
})

describe('harness.transferred', () => {
  it('comes on the source thread and on the target thread', async () => {
    const persistence = memoryPersistence()
    const { log } = persistence.stores
    const host = createHarnessHost({ persistence })
    const support = defineHarness({
      name: 'test/support',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const billing = defineHarness({
      name: 'test/billing',
      adapter: mockAdapter(() => text('billing here')).adapter,
    })
    const source = await host.open(support, { threadId: 'src' })
    await source.send('one')

    const { transferId, threadId } = await host.transfer({
      from: { harness: support, threadId: 'src' },
      to: { harness: billing },
      envelope: { note: 'Refund for order 42.' },
    })

    await waitFor(async () => {
      expect(await valuesOf(log, threadId, 'harness.transferred')).toEqual([
        { transferId, from: { threadId: 'src' } },
      ])
      expect(await valuesOf(log, 'src', 'harness.transferred')).toEqual([
        { transferId, to: { threadId } },
      ])
    })
    await host.close()
  })
})

describe('harness.stranded', () => {
  it('comes when the sandbox that the log binds the thread to is gone', async () => {
    const log = memoryLogStore()
    await appendToLog(log, { threadId: THREAD }, [
      {
        type: 'harness.workspace.bound',
        binding: {
          kind: 'sandbox',
          provider: 'fake',
          sandboxId: 'sb-1',
          root: '/ws',
        },
      },
    ])
    const bind = vi.fn(async (): Promise<BoundWorkspace> => {
      throw new Error('bind must not run')
    })
    const { host, session } = await openOn(
      log,
      [() => toolCall('read_file', { path: 'a.txt' }, 'c1'), () => text('ok')],
      // No reattach: the sandbox of the log cannot come back.
      { plugins: () => [workspaceTools({ workspace: { bind }, web: false })] },
    )
    const turn = session.send('read')
    await turn

    // Each try of the workspace sends one: before the turn, and at the call.
    await waitFor(async () => {
      const values = await valuesOf(log, THREAD, 'harness.stranded')
      expect(values).not.toHaveLength(0)
      for (const value of values)
        expect(value).toEqual({ operationId: turn.id })
    })
    expect(bind).not.toHaveBeenCalled()
    await host.close()
  })
})
