import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogStore } from '@tanstack/ai-persistence'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { createHarnessHost, defineHarness } from '../src'
import { SharedLog, emptySharedLogState, logIdOf } from '../src/log'
import { logChatStores } from '../src/log-stores'
import { HostOwnership } from '../src/ownership'
import {
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
  turnInterrupts,
} from './helpers'
import type { LogStore } from '@tanstack/ai-persistence'
import type { Reply } from './helpers'
import type { SessionImpl } from '../src/session/harness-session'

const THREAD = 't1'

/** The runs and interrupts on a new session view of a log of `log`. */
function storesOn(log: LogStore = memoryLogStore()) {
  const shared = new SharedLog({
    store: log,
    ownership: new HostOwnership({ store: log, ownerId: 'host-1' }),
    harness: 'test/log-stores',
    logId: logIdOf({ logId: THREAD }),
    rootThread: THREAD,
    state: emptySharedLogState(),
    coalesceMs: 0,
    eventBytes: 1_000_000,
  })
  const writer = shared.view(THREAD, {
    onFailure: () => {},
    onLost: () => {},
    isBusy: () => false,
    onOffers: () => {},
  })
  return logChatStores(writer)
}

// The same contract as every other run and interrupt store.
runPersistenceConformance('log chat stores', () => ({ stores: storesOn() }), {
  skip: [
    'messages',
    'activities',
    'metadata',
    'generationRuns',
    'artifacts',
    'blobs',
    'log',
    'sessions',
  ],
  // Only a sandbox reaper reads it, and the harness has none.
  skipMethods: ['runs.listReclaimable'],
  checks: ['runs.listByThread.state'],
})

describe('the run store on the log', () => {
  it('removes a field that an update sets to undefined', async () => {
    const { runs } = storesOn()
    await runs.createOrResume({ runId: 'r1', threadId: THREAD, startedAt: 1 })
    await runs.update('r1', {
      status: 'failed',
      finishedAt: 2,
      error: { message: 'down' },
    })

    await runs.update('r1', {
      status: 'running',
      finishedAt: undefined,
      error: undefined,
    })

    expect(await runs.get('r1')).toEqual({
      runId: 'r1',
      threadId: THREAD,
      startedAt: 1,
      status: 'running',
    })
  })
})

describe('the interrupt store on the log', () => {
  it('writes nothing for a batch that names an interrupt that is not pending', async () => {
    const { interrupts } = storesOn()
    for (const interruptId of ['i1', 'i2']) {
      await interrupts.create({
        interruptId,
        runId: 'r1',
        threadId: THREAD,
        requestedAt: 1,
        payload: {},
      })
    }
    await interrupts.cancel('i2')

    await expect(
      interrupts.commitBatch?.([
        { interruptId: 'i1', status: 'resolved', response: true },
        { interruptId: 'i2', status: 'resolved', response: true },
      ]),
    ).rejects.toThrow('i2, which is cancelled, not pending')
    expect((await interrupts.get('i1'))?.status).toBe('pending')
  })
})

const deploy = toolDefinition({
  name: 'deploy',
  description: 'Deploy. Needs approval.',
  needsApproval: true,
  inputSchema: z.object({ env: z.string() }),
})

/** A host with only a `log` store. */
async function openOn(
  log: LogStore,
  replies: Array<Reply>,
  user?: { id: string; tenantId: string },
) {
  const execute = vi.fn(async () => ({ ok: true }))
  const { adapter } = mockAdapter(replies)
  const host = createHarnessHost({ persistence: { stores: { log } } })
  const session = await host.open(
    defineHarness({
      name: 'test/log-stores',
      adapter,
      tools: [deploy.server(execute)],
    }),
    { threadId: THREAD, ...(user ? { user } : {}) },
  )
  return { host, session, execute }
}

describe('runs and interrupts of a session', () => {
  it('reads the run and the interrupts of a turn back on a new host, from the log only', async () => {
    const log = memoryLogStore()
    const first = await openOn(log, [() => toolCall('deploy', { env: 'prod' })])
    const stopped = first.session.send('Deploy.')
    const { interrupts } = await stopped
    const approval = interrupts?.[0]
    if (!approval) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await openOn(log, [() => text('Deployed.')])
    expect(
      turnInterrupts(next.session.snapshot()).map((item) => item.id),
    ).toEqual([approval.id])
    const stored = await storedThreadState(log, { threadId: THREAD })
    expect(stored.runs.get(stopped.id)).toMatchObject({
      threadId: THREAD,
      status: 'interrupted',
    })
    expect(stored.interrupts.get(approval.id)).toMatchObject({
      runId: stopped.id,
      threadId: THREAD,
      status: 'pending',
    })

    const receipt = await next.session.resolve({
      resume: [{ interruptId: approval.id, status: 'resolved', payload: true }],
    })
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'Deployed.',
      media: [],
    })
    expect(next.execute).toHaveBeenCalledTimes(1)
    const resolved = await storedThreadState(log, { threadId: THREAD })
    expect(resolved.interrupts.get(approval.id)?.status).toBe('resolved')
    expect(resolved.runs.get(receipt.operationId ?? '')?.status).toBe(
      'completed',
    )
    await next.host.close()
  })

  it('refuses a client run id that a run in the log has, also on a new host', async () => {
    const log = memoryLogStore()
    const first = await openOn(log, [() => text('Hi.')])
    await (first.session as unknown as SessionImpl).sendForRun('Hi.', {
      runId: 'run-1',
    })
    await first.host.close()

    const next = await openOn(log, [() => text('never')])
    const again = (next.session as unknown as SessionImpl).sendForRun(
      'Hi again.',
      { runId: 'run-1' },
    )
    expect(await again.receipt).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    await Promise.resolve(again).catch(() => {})
    await next.host.close()
  })

  it('takes one client run id in two tenants: each tenant has its own log', async () => {
    const log = memoryLogStore()
    const acme = await openOn(log, [() => text('Hello, acme.')], {
      id: 'a',
      tenantId: 'acme',
    })
    const globex = await openOn(log, [() => text('Hello, globex.')], {
      id: 'b',
      tenantId: 'globex',
    })

    expect(
      (
        await (acme.session as unknown as SessionImpl).sendForRun('Hi.', {
          runId: 'run-1',
        })
      ).text,
    ).toBe('Hello, acme.')
    expect(
      (
        await (globex.session as unknown as SessionImpl).sendForRun('Hi.', {
          runId: 'run-1',
        })
      ).text,
    ).toBe('Hello, globex.')
    await acme.host.close()
    await globex.host.close()
  })
})
