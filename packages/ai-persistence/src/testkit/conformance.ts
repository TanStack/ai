/**
 * Shared conformance suite for the `AIPersistence` state contract.
 *
 * Every backend (memory, drizzle, prisma, …) runs this identical suite so that
 * schema drift or an implementation gap fails immediately. It exercises every
 * method of every store the persistence exposes; stores that are absent (a
 * backend may not provide `locks`, for example) are skipped, so the suite is
 * universal across backends.
 *
 * Artifacts are tested via `externalUrl` (not inline `bytes`) so the assertions
 * hold identically for byte-storing (memory) and reference-only (SQL) backends.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { canonicalizeInterruptResolutions } from '@tanstack/ai'
import type { CommitInterruptResolutionsInput } from '@tanstack/ai'
import type { AIPersistence, InterruptStore } from '../types'

type MakePersistence = () => Promise<AIPersistence> | AIPersistence

/**
 * Register a Vitest suite that validates `makePersistence()` against the full
 * `AIPersistence` contract.
 */
export function runPersistenceConformance(
  name: string,
  makePersistence: MakePersistence,
): void {
  describe(`AIPersistence conformance: ${name}`, () => {
    let persistence: AIPersistence

    beforeAll(async () => {
      persistence = await makePersistence()
    })

    describe('messages', () => {
      it('round-trips a thread and returns [] for unknown threads', async () => {
        const store = persistence.stores.messages
        if (!store) return

        expect(await store.loadThread('thread-unknown')).toEqual([])

        await store.saveThread('thread-msg', [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ])
        expect(await store.loadThread('thread-msg')).toEqual([
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ])

        // Overwrites, not appends.
        await store.saveThread('thread-msg', [
          { role: 'user', content: 'redo' },
        ])
        expect(await store.loadThread('thread-msg')).toEqual([
          { role: 'user', content: 'redo' },
        ])
      })
    })

    describe('runs', () => {
      it('creates, resumes idempotently, updates, and gets', async () => {
        const store = persistence.stores.runs
        if (!store) return

        expect(await store.get('run-missing')).toBeNull()

        const created = await store.createOrResume({
          runId: 'run-1',
          threadId: 'thread-1',
          startedAt: 1000,
        })
        expect(created).toMatchObject({
          runId: 'run-1',
          threadId: 'thread-1',
          status: 'running',
          startedAt: 1000,
        })

        // createOrResume is idempotent: returns the existing record unchanged.
        const resumed = await store.createOrResume({
          runId: 'run-1',
          threadId: 'thread-different',
          startedAt: 9999,
        })
        expect(resumed).toMatchObject({
          runId: 'run-1',
          threadId: 'thread-1',
          startedAt: 1000,
        })

        await store.update('run-1', {
          status: 'completed',
          finishedAt: 2000,
          usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        })
        const done = await store.get('run-1')
        expect(done).toMatchObject({
          runId: 'run-1',
          status: 'completed',
          finishedAt: 2000,
          usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        })

        await store.update('run-1', { status: 'failed', error: 'boom' })
        const failed = await store.get('run-1')
        expect(failed?.status).toBe('failed')
        expect(failed?.error).toBe('boom')

        // Updating a missing run is a no-op (does not throw, does not create).
        await store.update('run-absent', { status: 'completed' })
        expect(await store.get('run-absent')).toBeNull()
      })
    })

    describe('interrupts', () => {
      it('creates, resolves, cancels, and lists by thread and run', async () => {
        const store = persistence.stores.interrupts
        if (!store) return

        expect(await store.get('int-missing')).toBeNull()

        await store.create({
          interruptId: 'int-1',
          runId: 'run-i',
          threadId: 'thread-i',
          status: 'pending',
          requestedAt: 10,
          payload: { tool: 'search', args: { q: 'x' } },
        })
        await store.create({
          interruptId: 'int-2',
          runId: 'run-i',
          threadId: 'thread-i',
          status: 'pending',
          requestedAt: 20,
          payload: { tool: 'write' },
        })
        await store.create({
          interruptId: 'int-3',
          runId: 'run-other',
          threadId: 'thread-i',
          status: 'pending',
          requestedAt: 30,
          payload: {},
        })

        const one = await store.get('int-1')
        expect(one).toMatchObject({
          interruptId: 'int-1',
          runId: 'run-i',
          threadId: 'thread-i',
          status: 'pending',
          requestedAt: 10,
          payload: { tool: 'search', args: { q: 'x' } },
        })

        expect(
          (await store.list('thread-i')).map((r) => r.interruptId),
        ).toEqual(['int-1', 'int-2', 'int-3'])
        expect(
          (await store.listByRun('run-i')).map((r) => r.interruptId),
        ).toEqual(['int-1', 'int-2'])
        expect(
          (await store.listPending('thread-i')).map((r) => r.interruptId),
        ).toEqual(['int-1', 'int-2', 'int-3'])

        await store.resolve('int-1', { ok: true })
        const resolved = await store.get('int-1')
        expect(resolved?.status).toBe('resolved')
        expect(resolved?.response).toEqual({ ok: true })
        expect(typeof resolved?.resolvedAt).toBe('number')

        await store.cancel('int-2')
        const cancelled = await store.get('int-2')
        expect(cancelled?.status).toBe('cancelled')
        expect(typeof cancelled?.resolvedAt).toBe('number')

        expect(
          (await store.listPending('thread-i')).map((r) => r.interruptId),
        ).toEqual(['int-3'])
        expect(
          (await store.listPendingByRun('run-i')).map((r) => r.interruptId),
        ).toEqual([])
      })
    })

    describe('metadata', () => {
      it('sets, gets, scopes, and deletes', async () => {
        const store = persistence.stores.metadata
        if (!store) return

        expect(await store.get('scope-a', 'k')).toBeNull()

        await store.set('scope-a', 'k', { n: 1 })
        await store.set('scope-b', 'k', { n: 2 })
        expect(await store.get('scope-a', 'k')).toEqual({ n: 1 })
        expect(await store.get('scope-b', 'k')).toEqual({ n: 2 })

        await store.set('scope-a', 'k', { n: 3 })
        expect(await store.get('scope-a', 'k')).toEqual({ n: 3 })

        await store.delete('scope-a', 'k')
        expect(await store.get('scope-a', 'k')).toBeNull()
        // Delete is scoped: scope-b untouched.
        expect(await store.get('scope-b', 'k')).toEqual({ n: 2 })
      })
    })

    describe('artifacts', () => {
      it('saves, gets, lists by run, and deletes', async () => {
        const store = persistence.stores.artifacts
        if (!store) return

        expect(await store.get('art-missing')).toBeNull()

        await store.save({
          artifactId: 'art-1',
          runId: 'run-art',
          threadId: 'thread-art',
          name: 'image.png',
          mimeType: 'image/png',
          size: 123,
          externalUrl: 'https://example.com/image.png',
          createdAt: 500,
        })
        await store.save({
          artifactId: 'art-2',
          runId: 'run-art',
          threadId: 'thread-art',
          name: 'clip.mp4',
          mimeType: 'video/mp4',
          size: 456,
          externalUrl: 'https://example.com/clip.mp4',
          createdAt: 600,
        })

        const got = await store.get('art-1')
        expect(got).toMatchObject({
          artifactId: 'art-1',
          runId: 'run-art',
          threadId: 'thread-art',
          name: 'image.png',
          mimeType: 'image/png',
          size: 123,
          externalUrl: 'https://example.com/image.png',
          createdAt: 500,
        })

        expect(
          (await store.list('run-art')).map((a) => a.artifactId).sort(),
        ).toEqual(['art-1', 'art-2'])
        expect(await store.list('run-none')).toEqual([])

        if (store.delete) {
          await store.delete('art-1')
          expect(await store.get('art-1')).toBeNull()
          expect(
            (await store.list('run-art')).map((a) => a.artifactId),
          ).toEqual(['art-2'])
        }
        if (store.deleteForRun) {
          await store.deleteForRun('run-art')
          expect(await store.list('run-art')).toEqual([])
        }
      })
    })

    describe('blobs', () => {
      it('puts, gets, heads, lists, and deletes', async () => {
        const store = persistence.stores.blobs
        if (!store) return

        const put = await store.put('blobs/a.txt', 'hello world', {
          contentType: 'text/plain',
          customMetadata: { owner: 'alice' },
        })
        expect(put.key).toBe('blobs/a.txt')
        expect(put.size).toBe('hello world'.length)
        expect(put.contentType).toBe('text/plain')

        const got = await store.get('blobs/a.txt')
        expect(got).not.toBeNull()
        expect(await got?.text()).toBe('hello world')
        expect(got?.customMetadata).toEqual({ owner: 'alice' })

        const head = await store.head('blobs/a.txt')
        expect(head?.key).toBe('blobs/a.txt')
        expect(head?.size).toBe('hello world'.length)

        expect(await store.get('blobs/missing')).toBeNull()
        expect(await store.head('blobs/missing')).toBeNull()

        await store.put('blobs/b.txt', 'second')
        await store.put('other/c.txt', 'third')

        const page = await store.list({ prefix: 'blobs/' })
        expect(page.objects.map((o) => o.key).sort()).toEqual([
          'blobs/a.txt',
          'blobs/b.txt',
        ])

        const limited = await store.list({ prefix: 'blobs/', limit: 1 })
        expect(limited.objects).toHaveLength(1)
        expect(limited.truncated).toBe(true)
        expect(limited.cursor).toBeDefined()

        const rest = await store.list({
          prefix: 'blobs/',
          cursor: limited.cursor,
        })
        expect(rest.objects.map((o) => o.key)).not.toContain(
          limited.objects[0]?.key,
        )

        await store.delete('blobs/a.txt')
        expect(await store.get('blobs/a.txt')).toBeNull()
      })

      it('matches list prefixes literally and case-sensitively', async () => {
        const store = persistence.stores.blobs
        if (!store) return

        // `run_` contains a SQL LIKE metacharacter (`_`), and the differing-case
        // keys probe case sensitivity. Only the keys that literally start with
        // the exact bytes `run_` must come back — `_` must NOT match any single
        // character, and `RUN_1/...` (upper-case) must be excluded.
        await store.put('run_1/x', 'a')
        await store.put('run_2/y', 'b')
        await store.put('runX/z', 'c') // `_` as wildcard would wrongly match this
        await store.put('RUN_1/w', 'd') // case-insensitive match would include this

        const page = await store.list({ prefix: 'run_' })
        expect(page.objects.map((o) => o.key).sort()).toEqual([
          'run_1/x',
          'run_2/y',
        ])
      })
    })

    describe('locks', () => {
      it('runs the critical section and returns its value', async () => {
        const store = persistence.stores.locks
        if (!store) return

        const order: Array<string> = []
        const result = await store.withLock('lock-key', async () => {
          order.push('inside')
          return 42
        })
        expect(result).toBe(42)
        expect(order).toEqual(['inside'])
      })
    })
  })
}

export interface InterruptConformanceHarness {
  getStore: () => InterruptStore | undefined
  advanceBy: (milliseconds: number) => void
  inspect: (interruptedRunId: string) => Promise<{
    statuses: ReadonlyArray<string>
    batchCount: number
  }>
  failTransitionOnce: (interruptId: string) => void
  reopen?: () => Promise<InterruptStore>
}

export async function openTwoInterrupts(store: InterruptStore) {
  return store.openInterruptBatch({
    threadId: 'thread-cas',
    interruptedRunId: 'run-interrupted',
    descriptors: [
      { id: 'int-a', reason: 'confirmation' },
      {
        id: 'int-b',
        reason: 'input_required',
        expiresAt: '2026-07-13T10:01:00.000Z',
      },
    ],
    bindings: [
      {
        interruptId: 'int-a',
        kind: 'generic',
        responseSchemaHash: 'sha256:a',
      },
      {
        interruptId: 'int-b',
        kind: 'generic',
        responseSchemaHash: 'sha256:b',
        expiresAt: '2026-07-13T10:01:00.000Z',
      },
    ],
  })
}

export function validTwoItemCommit(
  generation: number,
  continuationRunId = 'run-continuation-a',
): CommitInterruptResolutionsInput {
  const candidate = canonicalizeInterruptResolutions([
    { interruptId: 'int-b', status: 'cancelled' },
    {
      interruptId: 'int-a',
      status: 'resolved',
      payload: { ok: true },
    },
  ])
  return {
    threadId: 'thread-cas',
    interruptedRunId: 'run-interrupted',
    continuationRunId,
    expectedGeneration: generation,
    expectedInterruptIds: ['int-b', 'int-a'],
    resolutions: candidate.resolutions,
    fingerprint: candidate.fingerprint,
    canonicalResolutions: candidate.canonicalResolutions,
  }
}

export function runInterruptStoreConformance(
  createHarness: () => Promise<InterruptConformanceHarness>,
): void {
  describe('atomic interrupt store conformance', () => {
    it('requires the atomic interrupt capability', async () => {
      const harness = await createHarness()
      expect(
        harness.getStore(),
        'interrupt conformance requires stores.interrupts',
      ).toBeDefined()
      if (!harness.getStore()) throw new Error('interrupt store missing')
    })

    it('keeps canonical order stable and rejects malformed exact sets', async () => {
      const harness = await createHarness()
      const store = harness.getStore()
      if (!store) throw new Error('interrupt store missing')
      const opened = await openTwoInterrupts(store)
      const ordered = validTwoItemCommit(opened.generation)
      const reordered = canonicalizeInterruptResolutions([
        {
          interruptId: 'int-a',
          status: 'resolved',
          payload: { ok: true },
        },
        { interruptId: 'int-b', status: 'cancelled' },
      ])
      expect(reordered.fingerprint).toBe(ordered.fingerprint)
      expect(reordered.canonicalResolutions).toBe(ordered.canonicalResolutions)

      for (const expectedInterruptIds of [
        ['int-a'],
        ['int-a', 'int-b', 'int-c'],
        ['int-a', 'int-a'],
      ]) {
        await expect(
          store.commitInterruptResolutions({
            ...ordered,
            expectedInterruptIds,
          }),
        ).resolves.toMatchObject({ status: 'conflict' })
      }
      await expect(
        store.commitInterruptResolutions({
          ...ordered,
          expectedGeneration: opened.generation + 1,
        }),
      ).resolves.toMatchObject({ status: 'conflict' })
      await expect(
        store.commitInterruptResolutions({
          ...ordered,
          threadId: 'thread-other',
        }),
      ).resolves.toMatchObject({
        status: 'conflict',
        authoritativeState: { state: 'missing' },
      })
    })

    it('checks canonical bytes and digest before any transition', async () => {
      const harness = await createHarness()
      const store = harness.getStore()
      if (!store) throw new Error('interrupt store missing')
      const opened = await openTwoInterrupts(store)
      const input = validTwoItemCommit(opened.generation)
      await expect(
        store.commitInterruptResolutions({
          ...input,
          canonicalResolutions: `${input.canonicalResolutions} `,
        }),
      ).rejects.toThrow(/identity/i)
      await expect(harness.inspect('run-interrupted')).resolves.toEqual({
        statuses: ['pending', 'pending'],
        batchCount: 0,
      })
    })

    it('rolls back every row when a transition fails', async () => {
      const harness = await createHarness()
      const store = harness.getStore()
      if (!store) throw new Error('interrupt store missing')
      const opened = await openTwoInterrupts(store)
      harness.failTransitionOnce('int-b')
      await expect(
        store.commitInterruptResolutions(validTwoItemCommit(opened.generation)),
      ).rejects.toThrow()
      await expect(harness.inspect('run-interrupted')).resolves.toEqual({
        statuses: ['pending', 'pending'],
        batchCount: 0,
      })
    })

    it('projects pending, committed replay, restart, and one concurrent winner', async () => {
      const harness = await createHarness()
      const store = harness.getStore()
      if (!store) throw new Error('interrupt store missing')
      const opened = await openTwoInterrupts(store)
      await expect(
        store.getInterruptRecoveryState({
          threadId: 'thread-cas',
          interruptedRunId: 'run-interrupted',
          knownGeneration: opened.generation,
        }),
      ).resolves.toMatchObject({
        state: 'pending',
        generation: opened.generation,
      })

      const first = validTwoItemCommit(opened.generation, 'run-continuation-a')
      const secondCandidate = canonicalizeInterruptResolutions([
        { interruptId: 'int-a', status: 'cancelled' },
        { interruptId: 'int-b', status: 'cancelled' },
      ])
      const second = {
        ...first,
        continuationRunId: 'run-continuation-b',
        resolutions: secondCandidate.resolutions,
        fingerprint: secondCandidate.fingerprint,
        canonicalResolutions: secondCandidate.canonicalResolutions,
      }
      const results = await Promise.all([
        store.commitInterruptResolutions(first),
        store.commitInterruptResolutions(second),
      ])
      expect(results.map((result) => result.status).sort()).toEqual([
        'committed',
        'conflict',
      ])
      const winningRunId = results.find(
        (result) => result.status === 'committed',
      )?.continuationRunId
      expect(winningRunId).toBeDefined()
      const replayInput = winningRunId === 'run-continuation-a' ? first : second
      await expect(
        store.commitInterruptResolutions({
          ...replayInput,
          continuationRunId: 'ignored-replay-run',
        }),
      ).resolves.toEqual({
        status: 'replayed',
        continuationRunId: winningRunId,
      })

      const recoveredStore = harness.reopen ? await harness.reopen() : store
      await expect(
        recoveredStore.getInterruptRecoveryState({
          threadId: 'thread-cas',
          interruptedRunId: 'run-interrupted',
          knownGeneration: opened.generation,
        }),
      ).resolves.toMatchObject({
        state: 'committed',
        committed: { continuationRunId: winningRunId },
      })
    })

    it('projects missing and legacy-committed recovery states', async () => {
      const harness = await createHarness()
      const store = harness.getStore()
      if (!store) throw new Error('interrupt store missing')
      await expect(
        store.getInterruptRecoveryState({
          threadId: 'thread-cas',
          interruptedRunId: 'run-missing',
          knownGeneration: 3,
        }),
      ).resolves.toMatchObject({ state: 'missing', generation: 3 })

      await store.create({
        interruptId: 'legacy-int',
        runId: 'legacy-run',
        threadId: 'thread-cas',
        status: 'resolved',
        requestedAt: 1,
        payload: { id: 'legacy-int', reason: 'confirmation' },
      })
      await expect(
        store.getInterruptRecoveryState({
          threadId: 'thread-cas',
          interruptedRunId: 'legacy-run',
          knownGeneration: 0,
        }),
      ).resolves.toMatchObject({ state: 'legacy-committed' })
    })

    it('marks an uncommitted expired batch expired', async () => {
      const harness = await createHarness()
      const store = harness.getStore()
      if (!store) throw new Error('interrupt store missing')
      const opened = await openTwoInterrupts(store)
      harness.advanceBy(60_001)
      await expect(
        store.commitInterruptResolutions(validTwoItemCommit(opened.generation)),
      ).resolves.toMatchObject({
        status: 'conflict',
        authoritativeState: { state: 'expired' },
      })
    })
  })
}
