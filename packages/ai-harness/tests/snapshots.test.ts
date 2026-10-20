import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { NO_OWNER_EPOCH, memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '../src'
import { RevertFiles } from '../src/plugins'
import { createHarnessHandler } from '../src/server'
import { createHarnessClient } from '../src/client'
import { createSessionView } from '../src/view'
import { logIdOf } from '../src/log'
import { mockAdapter, text, wrapLogStore } from './helpers'
import type {
  AnyHarness,
  HarnessHost,
  HarnessHostOptions,
  PluginSessionApi,
  SessionEvent,
} from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })

const harness = defineHarness({
  name: 'test/snapshots',
  adapter: mockAdapter(() => text('Hello back.')).adapter,
})

/** One turn on `THREAD`, then the session closes. */
async function chat(host: HarnessHost, target: AnyHarness = harness) {
  const session = await host.open(target, { threadId: THREAD })
  await session.send('Hello.')
  await session.close()
}

/** Write one turn on a host with `options`, which then stops. */
async function seed(options: HarnessHostOptions, target?: AnyHarness) {
  const host = createHarnessHost(options)
  await chat(host, target)
  await host.close()
}

const snapshotOf = (persistence: ReturnType<typeof memoryPersistence>) =>
  persistence.stores.log.getSnapshot({ logId: LOG })

describe('log snapshots on a host', () => {
  it('opens a new host from the snapshot, and reads only the records after it', async () => {
    const persistence = memoryPersistence()
    await seed({ persistence, log: { saveSnapshotAfter: { bytes: 1 } } })
    const snapshot = await snapshotOf(persistence)
    if (!snapshot) throw new Error('The first host wrote a snapshot.')
    // A host with the default limits adds a turn, and no snapshot.
    await seed({ persistence })
    expect((await snapshotOf(persistence))?.seq).toBe(snapshot.seq)
    const inner = persistence.stores.log
    const reads: Array<number> = []
    const log = wrapLogStore(inner, {
      read: (query) => {
        reads.push(query.after ?? 0)
        return inner.read(query)
      },
    })
    const host = createHarnessHost({
      persistence: { stores: { ...persistence.stores, log } },
    })

    const session = await host.open(harness, { threadId: THREAD })

    expect(Math.min(...reads)).toBe(snapshot.seq)
    const transcript = await session.transcript()
    expect(transcript.map((message) => message.content)).toEqual([
      'Hello.',
      'Hello back.',
      'Hello.',
      'Hello back.',
    ])
    await session.close()
    await host.close()
  })

  it('sends a gap to an old cursor through the handler and the client, and the view loads again', async () => {
    const persistence = memoryPersistence()
    const options: HarnessHostOptions = {
      persistence,
      log: { saveSnapshotAfter: { bytes: 1 } },
      lifecycle: { retention: { keepLogRecords: 'since-snapshot' } },
    }
    await seed(options)
    const snapshot = await snapshotOf(persistence)
    if (!snapshot) throw new Error('The first host wrote a snapshot.')
    const head = String(snapshot.seq)
    const host = createHarnessHost(options)
    const handler = createHarnessHandler({
      host,
      harness,
      openAccess: { user: { id: 'u' } },
    })
    const client = createHarnessClient({
      url: 'http://local/api/harness',
      threadId: THREAD,
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const seen: Array<SessionEvent> = []
    for await (const entry of client.events({ from: '0' })) {
      seen.push(entry)
      break
    }
    expect(seen).toEqual([
      {
        cursor: head,
        threadId: THREAD,
        operationId: 'session',
        event: expect.objectContaining({
          type: EventType.CUSTOM,
          name: HARNESS_EVENTS.gap,
          value: { from: '0', resumeAt: head, reason: 'truncated' },
        }),
      },
    ])

    // A view that reads from the old cursor loads the transcript again.
    const transcript = vi.fn(() => client.transcript())
    const view = createSessionView({
      ...client,
      transcript,
      events: (eventOptions) => client.events({ ...eventOptions, from: '0' }),
    })
    await view.ready
    await waitFor(() => expect(transcript).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(view.store.get().messages.map((item) => item.role)).toEqual([
        'user',
        'assistant',
      ]),
    )
    view.dispose()
    await host.close()
  })

  it('gives a plugin its kept records after a truncate, oldest first', async () => {
    const persistence = memoryPersistence()
    const records = [
      { type: 'acme/steps:step', n: 1 },
      { type: 'acme/other', n: 2 },
      { type: 'acme/steps:step', n: 3 },
    ]
    await persistence.stores.log.append({
      logId: LOG,
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records,
    })
    let session: PluginSessionApi | undefined
    const steps = definePlugin({
      name: 'acme/steps',
      keepRecords: { 'acme/steps:step': 10 },
      setup: (ctx) => {
        session = ctx.session
      },
    })
    const withSteps = defineHarness({
      name: 'test/snapshots',
      adapter: mockAdapter(() => text('Hello back.')).adapter,
      plugins: () => [steps],
    })
    const options: HarnessHostOptions = {
      persistence,
      log: { saveSnapshotAfter: { bytes: 1 } },
      lifecycle: { retention: { keepLogRecords: 'since-snapshot' } },
    }
    await seed(options, withSteps)
    await expect(
      persistence.stores.log.read({ logId: LOG, after: 0 }),
    ).rejects.toThrow()

    const host = createHarnessHost(options)
    const handle = await host.open(withSteps, { threadId: THREAD })

    expect(await session?.keptRecords('acme/steps:step')).toEqual([
      records[0],
      records[2],
    ])
    await handle.close()
    await host.close()
  })

  it('reverts after a truncate with the file steps from before the cut', async () => {
    const persistence = memoryPersistence()
    const step = {
      type: 'tanstack/snapshots:step',
      from: 'a',
      to: 'b',
      files: ['notes.md'],
      toolCallIds: ['call-1'],
    }
    // A step record of the snapshots plugin, before the first turn.
    await persistence.stores.log.append({
      logId: LOG,
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records: [step],
    })
    let steps: Array<Record<string, unknown>> = []
    const files = definePlugin({
      name: 'test/files',
      provides: [RevertFiles],
      // The fold keeps the steps, so the snapshot has them.
      keepRecords: { [step.type]: 10 },
      setup: ({ provide }) =>
        provide(RevertFiles, {
          revert: async (_hidden, records) => {
            steps = await records(step.type)
            return undefined
          },
          unrevert: async () => {},
        }),
    })
    const withFiles = defineHarness({
      name: 'test/snapshots',
      adapter: mockAdapter(() => text('Hello back.')).adapter,
      plugins: () => [files],
    })
    const options: HarnessHostOptions = {
      persistence,
      log: { saveSnapshotAfter: { bytes: 1 } },
      lifecycle: { retention: { keepLogRecords: 'since-snapshot' } },
    }
    await seed(options, withFiles)
    const snapshot = await snapshotOf(persistence)
    if (!snapshot) throw new Error('The first host wrote a snapshot.')
    await expect(
      persistence.stores.log.read({ logId: LOG, after: 0 }),
    ).rejects.toThrow()

    const host = createHarnessHost(options)
    const session = await host.open(withFiles, { threadId: THREAD })
    const [first] = await session.transcript()

    expect(await session.revert({ messageId: first?.id ?? '' })).toMatchObject({
      status: 'accepted',
    })
    expect(steps).toEqual([step])
    await session.close()
    await host.close()
  })
})
