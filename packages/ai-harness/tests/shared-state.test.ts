import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import { NO_SESSION_CONTEXT } from '../src/agents'
import { loadLogState, sessionOf } from '../src/log'
import { mockAdapter, storedThreadState, wrapLogStore } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { HarnessPersistence } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
const LOG = logIdOf({ logId: THREAD })

/** Memory stores that a second host reads, with a log store that can fork. */
function durablePersistence() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

/**
 * `adder` adds its name to the shared list `seen`. `ready`, when set, runs
 * before the update, so a test can make two updates start together.
 * `reader` returns the list.
 */
function sharing(ready?: () => Promise<void>) {
  const adder = defineAgent({
    name: 'adder',
    description: 'Adds a name to the shared list',
    inputSchema: z.object({ name: z.string() }),
    run: async (ctx) => {
      const seen = ctx.harness!.state({
        key: 'seen',
        initial: [] as Array<string>,
      })
      await ready?.()
      return seen.update((list) => [...list, ctx.input.name])
    },
  })
  const reader = defineAgent({
    name: 'reader',
    description: 'Reads the shared list',
    run: (ctx) =>
      ctx.harness!.state({ key: 'seen', initial: [] as Array<string> }).get(),
  })
  return defineHarness({
    name: 'test/shared-state',
    adapter: mockAdapter([]).adapter,
    agents: [adder, reader],
  })
}

/** Open `THREAD` on a new host: a server that starts. */
async function openOn(
  persistence: HarnessPersistence,
  harness: ReturnType<typeof sharing>,
  log?: { saveSnapshotAfter: { bytes: number } },
) {
  const host = createHarnessHost({ persistence, ...(log ? { log } : {}) })
  const session = await host.open(harness, { threadId: THREAD })
  return { host, session }
}

describe('ctx.harness.state', () => {
  it('keeps both changes when two agents update one key at the same time', async () => {
    // Both agents wait here until the two of them have arrived.
    let arrived = 0
    let release = () => {}
    const together = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = () => {
      arrived += 1
      if (arrived === 2) release()
      return together
    }
    const persistence = memoryPersistence()
    const { host, session } = await openOn(persistence, sharing(ready))
    const seen: Array<StreamChunk> = []
    const reader = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: reader.signal }))
        seen.push(entry.event)
    })()

    await Promise.all([
      session.agents.adder.start({ name: 'a' }, { addResultNote: false }),
      session.agents.adder.start({ name: 'b' }, { addResultNote: false }),
    ])

    const stored = await storedThreadState(persistence.stores.log, {
      threadId: THREAD,
    })
    expect([...(stored.shared.get('seen') as Array<string>)].sort()).toEqual([
      'a',
      'b',
    ])
    // Clients get the value in `STATE_SNAPSHOT`, under `shared`.
    await waitFor(() =>
      expect(
        seen.some(
          (event) =>
            event.type === EventType.STATE_SNAPSHOT &&
            JSON.stringify(event.snapshot).includes('"shared":{"seen":['),
        ),
      ).toBe(true),
    )
    reader.abort()
    await reading
    await host.close()
  })

  it('reads the value on a second host, and in a fork of the thread', async () => {
    const persistence = durablePersistence()
    const harness = sharing()
    const first = await openOn(persistence, harness)
    await first.session.agents.adder.start(
      { name: 'a' },
      { addResultNote: false },
    )
    await first.host.close()

    const second = await openOn(persistence, harness)
    await expect(second.session.agents.reader.start()).resolves.toEqual(['a'])
    const fork = await second.host.fork(harness, {
      threadId: THREAD,
      newThreadId: 'fork',
    })
    await expect(fork.agents.reader.start()).resolves.toEqual(['a'])
    await second.host.close()
  })

  it('keeps the value in a snapshot: a fold from the snapshot is the fold from the start', async () => {
    const persistence = memoryPersistence()
    const { log } = persistence.stores
    const { host, session } = await openOn(persistence, sharing(), {
      saveSnapshotAfter: { bytes: 1 },
    })
    await session.agents.adder.start({ name: 'a' }, { addResultNote: false })
    await host.close()
    const head = (await log.read({ logId: LOG })).at(-1)?.seq
    await waitFor(async () =>
      expect((await log.getSnapshot({ logId: LOG }))?.seq).toBe(head),
    )
    const fromStart = wrapLogStore(log, {
      getSnapshot: () => Promise.resolve(null),
    })

    const shared = async (store: typeof log) => {
      const state = await loadLogState({
        store,
        logId: LOG,
        rootThread: THREAD,
      })
      return { state, shared: sessionOf(state, THREAD).thread.shared }
    }

    const fromSnapshot = await shared(log)
    expect(fromSnapshot.state.snapshotSeq).toBe(head)
    expect([...fromSnapshot.shared]).toEqual([['seen', ['a']]])
    expect([...fromSnapshot.shared]).toEqual([
      ...(await shared(fromStart)).shared,
    ])
  })

  it('throws outside a harness session', () => {
    expect(() =>
      NO_SESSION_CONTEXT.state({ key: 'seen', initial: [] }),
    ).toThrow('ctx.harness.state needs a run that a harness session started.')
  })
})
