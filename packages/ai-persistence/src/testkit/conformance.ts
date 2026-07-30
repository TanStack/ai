/**
 * Shared conformance suite for the `AIPersistence` **state** contract.
 *
 * Every backend runs this identical suite — the in-memory reference store and
 * every adapter you write against your own database — so that schema drift or
 * an implementation gap fails immediately. It exercises every method of every
 * store the persistence exposes and is the authoritative compatibility gate for
 * the store interfaces in `../types.ts`.
 *
 * Locks are not part of this suite — they are a separate coordination concern
 * (`LockStore` + `withLocks`), not state stores.
 *
 * SKIPPING (declare or fail): a backend that deliberately omits a state store
 * must declare it in `options.skip`, and one that omits an OPTIONAL store
 * method must declare it in `options.skipMethods`. Anything absent and not
 * declared fails the suite loudly, and anything declared absent is reported by
 * vitest as a SKIPPED case, never as a pass. Silent gaps are not allowed: a
 * case that did not run must never be indistinguishable from one that did.
 *
 * RESERVED RUN-ID PREFIX: `rc-` belongs to the `listReclaimable` case, which
 * filters the method's (not thread-scoped) result down to `rc-` ids before an
 * exact-set assertion. A new case in `describe('runs')` must NOT seed a run id
 * starting with `rc-`, or it silently changes that expected set.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { ModelMessage } from '@tanstack/ai'
import type { AIPersistence, AIPersistenceStores, RunStore } from '../types'

type MakePersistence = () => Promise<AIPersistence> | AIPersistence

/** Methods that are optional on the `RunStore` contract. */
type OptionalRunStoreMethod =
  | 'findActiveRun'
  | 'listByThread'
  | 'listReclaimable'

/** Dotted `store.method` key a backend passes to declare an omitted method. */
export type PersistenceConformanceMethodKey = `runs.${OptionalRunStoreMethod}`

export interface PersistenceConformanceOptions {
  /**
   * Store keys this backend intentionally does not provide. Any store that is
   * absent from the persistence and NOT listed here fails the suite, so a
   * dropped/misconfigured store can never pass silently.
   */
  skip?: Array<keyof AIPersistenceStores>
  /**
   * OPTIONAL store methods this backend intentionally does not implement, as
   * `'runs.listByThread'` and friends. A method that is absent and NOT listed
   * here fails the suite; a listed one is reported as a skipped case.
   */
  skipMethods?: Array<PersistenceConformanceMethodKey>
}

/**
 * Register a Vitest suite that validates `makePersistence()` against the full
 * `AIPersistence` contract.
 */
export function runPersistenceConformance(
  name: string,
  makePersistence: MakePersistence,
  options?: PersistenceConformanceOptions,
): void {
  const skip = new Set<keyof AIPersistenceStores>(options?.skip ?? [])
  const skipMethods = new Set<PersistenceConformanceMethodKey>(
    options?.skipMethods ?? [],
  )

  describe(`AIPersistence conformance: ${name}`, () => {
    let persistence: AIPersistence

    beforeAll(async () => {
      persistence = await makePersistence()
    })

    /**
     * Return the store for `key`, or `null` when the backend intentionally
     * skips it. Throws (failing the test) when a store is missing but was not
     * declared in `options.skip`.
     */
    function resolveStore<TKey extends keyof AIPersistenceStores>(
      key: TKey,
    ): NonNullable<AIPersistenceStores[TKey]> | null {
      const store = persistence.stores[key]
      if (store) return store
      if (skip.has(key)) return null
      throw new Error(
        `AIPersistence conformance: store '${key}' is missing. ` +
          `Provide it, or pass { skip: ['${key}'] } if the omission is intentional.`,
      )
    }

    /**
     * Narrow `runs` to a store that definitely implements the optional method
     * `methodName`, so the case can call it without a non-null assertion.
     *
     * Returns `false` only when the omission was declared in
     * `options.skipMethods` (the caller then reports a skip). An undeclared
     * omission throws, mirroring `resolveStore`: a case that cannot run must
     * never be reported as a pass.
     */
    function hasRunsMethod<TName extends OptionalRunStoreMethod>(
      runs: RunStore,
      methodName: TName,
    ): runs is RunStore & Required<Pick<RunStore, TName>> {
      if (runs[methodName]) return true
      const key: PersistenceConformanceMethodKey = `runs.${methodName}`
      if (skipMethods.has(key)) return false
      throw new Error(
        `AIPersistence conformance: optional method '${key}' is not implemented. ` +
          `Implement it, or pass { skipMethods: ['${key}'] } if the omission is intentional.`,
      )
    }

    describe('messages', () => {
      it('round-trips a thread and returns [] for unknown threads', async (ctx) => {
        const store = resolveStore('messages')
        if (!store) return ctx.skip('store not provided')

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

      it('round-trips rich message shapes with deep equality', async (ctx) => {
        const store = resolveStore('messages')
        if (!store) return ctx.skip('store not provided')

        const rich: Array<ModelMessage> = [
          { role: 'user', content: 'plain string' },
          {
            // Tool-call message with JSON arguments.
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{"query":"weather in Paris"}',
                },
              },
            ],
          },
          {
            // Tool result message.
            role: 'tool',
            content: '{"temperature":21,"unit":"C"}',
            toolCallId: 'call-1',
          },
          {
            // Multi-part content: text + image reference.
            role: 'user',
            content: [
              { type: 'text', content: 'What is in this image?' },
              {
                type: 'image',
                source: {
                  type: 'url',
                  value: 'https://example.com/cat.png',
                  mimeType: 'image/png',
                },
              },
            ],
          },
          {
            // Reasoning / thinking part.
            role: 'assistant',
            content: 'Here is my answer.',
            thinking: [
              {
                content: 'The user is asking about the image.',
                signature: 'sig-1',
              },
            ],
          },
        ]

        await store.saveThread('thread-rich', rich)
        expect(await store.loadThread('thread-rich')).toEqual(rich)
      })
    })

    describe('runs', () => {
      it('creates, resumes idempotently, updates, and gets', async (ctx) => {
        const store = resolveStore('runs')
        if (!store) return ctx.skip('store not provided')

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

        // `error` is a structured RunError: the prose `message` plus the
        // optional machine-branchable `code`. Both must survive the round-trip,
        // so a backend that flattens the record to a bare string fails here.
        await store.update('run-1', {
          status: 'failed',
          error: { message: 'boom', code: 'provider_overloaded' },
        })
        const failed = await store.get('run-1')
        expect(failed?.status).toBe('failed')
        expect(failed?.error).toEqual({
          message: 'boom',
          code: 'provider_overloaded',
        })

        // Updating a missing run is a no-op (does not throw, does not create).
        await store.update('run-absent', { status: 'completed' })
        expect(await store.get('run-absent')).toBeNull()
      })

      // The idempotency invariant has teeth precisely where it is dangerous:
      // resuming a run that already FINISHED must not resurrect it. An adapter
      // written as `INSERT ... ON CONFLICT DO UPDATE SET status='running'`
      // looks correct on a still-running record and silently revives dead ones,
      // after which `findActiveRun` hands clients a run that will never emit
      // again. Assert the terminal status and `finishedAt` both survive.
      it('createOrResume never resurrects a finished run', async (ctx) => {
        const store = resolveStore('runs')
        if (!store) return ctx.skip('store not provided')

        await store.createOrResume({
          runId: 'nc-1',
          threadId: 'nc-t',
          startedAt: 10,
        })
        await store.update('nc-1', { status: 'completed', finishedAt: 20 })

        // Resume with a DIFFERENT status/startedAt: both must be ignored.
        const resumed = await store.createOrResume({
          runId: 'nc-1',
          threadId: 'nc-t',
          startedAt: 999,
          status: 'running',
        })
        expect(resumed).toMatchObject({
          runId: 'nc-1',
          status: 'completed',
          startedAt: 10,
          finishedAt: 20,
        })

        // And the stored record itself was not rewritten either.
        expect(await store.get('nc-1')).toMatchObject({
          status: 'completed',
          startedAt: 10,
          finishedAt: 20,
        })
      })

      // `sandboxKey`, `detachedSince`, `cancelRequested`, `driverEpoch` are the
      // durable-agent-runs fields: nothing before this suite ever wrote them,
      // so a backend can pass every other case while silently dropping one of
      // these on `update`. The reaper and takeover both depend on them
      // surviving a round-trip through the REQUIRED `update`/`get` pair, so
      // this case cannot be declared optional via `skipMethods`.
      it('round-trips the durable run fields, overwrites driverEpoch, and clears every one of them on explicit undefined', async (ctx) => {
        const store = resolveStore('runs')
        if (!store) return ctx.skip('store not provided')

        await store.createOrResume({
          runId: 'fc-1',
          threadId: 'fc-t',
          startedAt: 1,
        })

        // 0. A fresh run that was never patched with these fields must read
        // back as undefined -- not null, not false, not 0. A backend that
        // coerces a NULL/absent column to a falsy default (e.g.
        // `cancelRequested: false`) is claiming knowledge ("explicitly not
        // cancelled") it does not have, and `toBeFalsy()` would not catch
        // it since `false` is falsy too.
        const fresh = await store.get('fc-1')
        expect(fresh?.cancelRequested).toBeUndefined()
        expect(fresh?.detachedSince).toBeUndefined()
        expect(fresh?.sandboxKey).toBeUndefined()
        expect(fresh?.driverEpoch).toBeUndefined()

        // 1. All four fields round-trip through update -> get.
        await store.update('fc-1', {
          sandboxKey: 'sandbox-abc',
          detachedSince: 500,
          cancelRequested: true,
          driverEpoch: 1,
        })
        const afterFirstUpdate = await store.get('fc-1')
        expect(afterFirstUpdate?.sandboxKey).toBe('sandbox-abc')
        expect(afterFirstUpdate?.detachedSince).toBe(500)
        expect(afterFirstUpdate?.cancelRequested).toBe(true)
        expect(afterFirstUpdate?.driverEpoch).toBe(1)

        // 2. A monotonic driverEpoch bump overwrites, it is not ignored (a
        // takeover host bumping the fencing token must actually stick).
        await store.update('fc-1', { driverEpoch: 2 })
        const afterEpochBump = await store.get('fc-1')
        expect(afterEpochBump?.driverEpoch).toBe(2)
        // Sibling fields untouched by an update that only names driverEpoch.
        expect(afterEpochBump?.sandboxKey).toBe('sandbox-abc')
        expect(afterEpochBump?.cancelRequested).toBe(true)

        // 3. update({ detachedSince: undefined }) actually CLEARS the field.
        // A backend whose SQL adapter filters `undefined` out of its `SET`
        // clause leaves the old value, and every re-attached run then looks
        // permanently detached to the reaper.
        await store.update('fc-1', { detachedSince: undefined })
        const afterClear = await store.get('fc-1')
        expect(afterClear?.detachedSince).toBeUndefined()
        // Clearing detachedSince must not clobber the other durable fields.
        expect(afterClear?.sandboxKey).toBe('sandbox-abc')
        expect(afterClear?.cancelRequested).toBe(true)
        expect(afterClear?.driverEpoch).toBe(2)

        // 4. cancelRequested: false written EXPLICITLY must round-trip as
        // `false`, distinct from the fresh-run `undefined` checked in step 0.
        // A backend storing this boolean in an integer/NULL-able column has
        // to preserve the false/undefined distinction in both directions,
        // not just collapse both to falsy.
        await store.update('fc-1', { cancelRequested: false })
        const afterExplicitFalse = await store.get('fc-1')
        expect(afterExplicitFalse?.cancelRequested).toBe(false)
        expect(afterExplicitFalse?.cancelRequested).not.toBeUndefined()

        // 5. An explicit `undefined` clears EVERY durable field, not just
        // `detachedSince`. Step 3 only exercised one of the four, so a backend
        // half-converted to `'field' in patch` -- `in` for `detachedSince`,
        // still `patch.field !== undefined` for the rest -- passed the whole
        // suite while its clears silently no-opped. Step 4's explicit `false`
        // also survives a `!== undefined` guard, so nothing else here bites
        // either. Re-populate first, so each clear has a value to remove and
        // an assertion that fails when the clear is dropped.
        await store.update('fc-1', {
          sandboxKey: 'sandbox-xyz',
          detachedSince: 900,
          cancelRequested: true,
          driverEpoch: 3,
        })
        const beforeFullClear = await store.get('fc-1')
        expect(beforeFullClear?.sandboxKey).toBe('sandbox-xyz')
        expect(beforeFullClear?.detachedSince).toBe(900)
        expect(beforeFullClear?.cancelRequested).toBe(true)
        expect(beforeFullClear?.driverEpoch).toBe(3)

        await store.update('fc-1', {
          sandboxKey: undefined,
          detachedSince: undefined,
          cancelRequested: undefined,
          driverEpoch: undefined,
        })
        const afterFullClear = await store.get('fc-1')
        expect(afterFullClear?.sandboxKey).toBeUndefined()
        expect(afterFullClear?.detachedSince).toBeUndefined()
        expect(afterFullClear?.cancelRequested).toBeUndefined()
        expect(afterFullClear?.driverEpoch).toBeUndefined()
        // Clearing the durable fields is not a delete: the run row survives,
        // and the fields the patch never named keep their values.
        expect(afterFullClear?.status).toBe('running')
        expect(afterFullClear?.startedAt).toBe(1)
      })

      // `findActiveRun` is optional on the RunStore contract; a backend that
      // declares the omission in `skipMethods` is reported as skipped, and one
      // that omits it silently fails. Any backend that has it must satisfy these
      // invariants (most-recent-running wins, thread-scoped, null when idle).
      it('findActiveRun returns the most recent running run for a thread', async (ctx) => {
        const store = resolveStore('runs')
        if (!store) return ctx.skip('store not provided')
        if (!hasRunsMethod(store, 'findActiveRun')) {
          return ctx.skip('runs.findActiveRun not implemented')
        }

        const thread = 'thread-active'
        expect(await store.findActiveRun(thread)).toBeNull()

        await store.createOrResume({
          runId: 'active-1',
          threadId: thread,
          startedAt: 1000,
        })
        await store.createOrResume({
          runId: 'active-2',
          threadId: thread,
          startedAt: 2000,
        })
        // Most-recent running run wins.
        expect(await store.findActiveRun(thread)).toMatchObject({
          runId: 'active-2',
          status: 'running',
        })

        // A different thread's running run is not returned.
        await store.createOrResume({
          runId: 'other-1',
          threadId: 'thread-other',
          startedAt: 3000,
        })
        expect(await store.findActiveRun(thread)).toMatchObject({
          runId: 'active-2',
        })

        // Once the newest finishes, the older running run becomes active.
        await store.update('active-2', {
          status: 'completed',
          finishedAt: 2500,
        })
        expect(await store.findActiveRun(thread)).toMatchObject({
          runId: 'active-1',
          status: 'running',
        })

        // With none running, it is null.
        await store.update('active-1', {
          status: 'completed',
          finishedAt: 1500,
        })
        expect(await store.findActiveRun(thread)).toBeNull()
      })

      // `listByThread` is optional on the RunStore contract; a declared omission
      // is reported as skipped and an undeclared one fails. Any backend that has
      // it must return that thread's runs ordered ascending by `startedAt`.
      it('lists runs by thread when supported', async (ctx) => {
        const runs = resolveStore('runs')
        if (!runs) return ctx.skip('store not provided')
        if (!hasRunsMethod(runs, 'listByThread')) {
          return ctx.skip('runs.listByThread not implemented')
        }

        await runs.createOrResume({
          runId: 'lt-b',
          threadId: 'lt',
          startedAt: 2,
        })
        await runs.createOrResume({
          runId: 'lt-a',
          threadId: 'lt',
          startedAt: 1,
        })
        const listed = await runs.listByThread('lt')
        expect(listed.map((r) => r.runId)).toEqual(['lt-a', 'lt-b'])
      })

      // `listReclaimable` is optional on the RunStore contract; a declared
      // omission is reported as skipped and an undeclared one fails. Any
      // backend that has it must
      // surface only runs where ALL THREE hold: status === 'running',
      // detachedSince is set, and detachedSince <= now - ttlMs (inclusive
      // cutoff). Each negative fixture below pins one of those conditions so
      // a backend that drops any single check (e.g. "return every run", or
      // "ignore status", or "ignore detachedSince") fails this case. Do not
      // simplify these away to a bare `toContain` — that is exactly the
      // weakness this case was strengthened to catch.
      it('lists reclaimable detached runs when supported', async (ctx) => {
        const runs = resolveStore('runs')
        if (!runs) return ctx.skip('store not provided')
        if (!hasRunsMethod(runs, 'listReclaimable')) {
          return ctx.skip('runs.listReclaimable not implemented')
        }

        const now = 10_000
        const ttlMs = 5_000
        const cutoff = now - ttlMs // 5_000

        // Positive: running, detached well past the cutoff.
        await runs.createOrResume({
          runId: 'rc-included',
          threadId: 'rc-t',
          startedAt: 1,
        })
        await runs.update('rc-included', { detachedSince: 1_000 })

        // Positive boundary: detachedSince exactly equals the cutoff. Pins
        // the `<=` (inclusive) semantics — a backend that uses `<` instead
        // would wrongly exclude this run.
        await runs.createOrResume({
          runId: 'rc-boundary',
          threadId: 'rc-t',
          startedAt: 1,
        })
        await runs.update('rc-boundary', { detachedSince: cutoff })

        // Negative: still running, but detached AFTER the cutoff (not yet
        // abandoned long enough). Pins the `<= cutoff` comparison — a
        // backend that returns every detached run regardless of how recent
        // would wrongly include this one.
        await runs.createOrResume({
          runId: 'rc-too-recent',
          threadId: 'rc-t',
          startedAt: 1,
        })
        await runs.update('rc-too-recent', { detachedSince: cutoff + 1 })

        // Negative: detached past the cutoff, but no longer running (already
        // completed). Pins the `status === 'running'` check — a backend
        // that ignores status would wrongly include this one.
        await runs.createOrResume({
          runId: 'rc-completed',
          threadId: 'rc-t',
          startedAt: 1,
        })
        await runs.update('rc-completed', {
          detachedSince: 1_000,
          status: 'completed',
          finishedAt: 2_000,
        })

        // Negative: running, but never detached at all. Pins the
        // `detachedSince !== undefined` check — a backend that treats a
        // missing `detachedSince` as "always reclaimable" would wrongly
        // include this one.
        await runs.createOrResume({
          runId: 'rc-never-detached',
          threadId: 'rc-t',
          startedAt: 1,
        })

        const reclaimable = await runs.listReclaimable({ now, ttlMs })

        // Scope the assertion to ids seeded by this case: `listReclaimable`
        // is not thread-scoped, so it also sees `'running'` runs seeded by
        // sibling cases in this shared-store `describe('runs', ...)` block
        // (e.g. `other-1`, `lt-a`, `lt-b`). Those all lack `detachedSince`,
        // so a correct implementation already excludes them — but filtering
        // here keeps this assertion from depending on that fact holding for
        // every other case forever. Ordering is not part of this method's
        // contract, so sort before an exact-set comparison.
        const ourIds = reclaimable
          .map((r) => r.runId)
          .filter((id) => id.startsWith('rc-'))
          .sort()
        expect(ourIds).toEqual(['rc-boundary', 'rc-included'])

        // The four assertions below are scoped by exact runId (never by the
        // `rc-` exact-set comparison above), so each uses its own randomUUID
        // fixture and cannot perturb the fixed-set assertion just made.

        // (1) `ttlMs: 0` pins the cutoff as inclusive: a run detached at
        // exactly `now` (cutoff === now) must still come back. A backend
        // using strict `<` instead of `<=` would silently never reclaim a
        // run detached exactly at the boundary.
        const zeroTtlRunId = `rc-${crypto.randomUUID()}`
        await runs.createOrResume({
          runId: zeroTtlRunId,
          threadId: 'rc-t',
          startedAt: 1,
        })
        await runs.update(zeroTtlRunId, { detachedSince: now })
        const zeroTtlReclaimable = await runs.listReclaimable({
          now,
          ttlMs: 0,
        })
        expect(
          zeroTtlReclaimable.find((r) => r.runId === zeroTtlRunId)
            ?.detachedSince,
        ).toBe(now)

        // (2) Re-attaching — `update(runId, { detachedSince: undefined })`
        // — must drop the run out of the list. This is the most important
        // assertion in this case: a SQL `SET`-clause builder that filters
        // `undefined` out of the patch (`'field' in patch` instead of
        // `patch.field !== undefined`) keeps the old `detachedSince`, so a
        // run a user has actively re-attached to still looks detached — and
        // the reaper then cancels a run someone is watching.
        const reattachedRunId = `rc-${crypto.randomUUID()}`
        await runs.createOrResume({
          runId: reattachedRunId,
          threadId: 'rc-t',
          startedAt: 1,
        })
        await runs.update(reattachedRunId, { detachedSince: 1_000 })
        await runs.update(reattachedRunId, { detachedSince: undefined })
        const afterReattach = await runs.listReclaimable({ now, ttlMs })
        expect(afterReattach.some((r) => r.runId === reattachedRunId)).toBe(
          false,
        )

        // (3) No terminal status (`completed` / `failed` / `aborted`) ever
        // appears, whatever its `detachedSince`.
        const terminalStatuses = ['completed', 'failed', 'aborted'] as const
        const terminalRunIds = await Promise.all(
          terminalStatuses.map(async (status) => {
            const runId = `rc-${crypto.randomUUID()}`
            await runs.createOrResume({ runId, threadId: 'rc-t', startedAt: 1 })
            await runs.update(runId, {
              status,
              detachedSince: 1_000,
              finishedAt: 2_000,
            })
            return runId
          }),
        )
        const afterTerminal = await runs.listReclaimable({ now, ttlMs })
        expect(
          afterTerminal.some((r) => terminalRunIds.includes(r.runId)),
        ).toBe(false)

        // (4) `'interrupted'` does not appear. The documented predicate is
        // `status === 'running'`; an interrupted run is a human-in-the-loop
        // pause that interrupt-resume continues, not abandoned work a reaper
        // should tear down.
        const interruptedRunId = `rc-${crypto.randomUUID()}`
        await runs.createOrResume({
          runId: interruptedRunId,
          threadId: 'rc-t',
          startedAt: 1,
        })
        await runs.update(interruptedRunId, {
          status: 'interrupted',
          detachedSince: 1_000,
        })
        const afterInterrupted = await runs.listReclaimable({ now, ttlMs })
        expect(afterInterrupted.some((r) => r.runId === interruptedRunId)).toBe(
          false,
        )
      })
    })

    describe('interrupts', () => {
      it('creates, resolves, cancels, and lists by thread and run', async (ctx) => {
        const store = resolveStore('interrupts')
        if (!store) return ctx.skip('store not provided')

        expect(await store.get('int-missing')).toBeNull()

        await store.create({
          interruptId: 'int-1',
          runId: 'run-i',
          threadId: 'thread-i',
          requestedAt: 10,
          payload: { tool: 'search', args: { q: 'x' } },
        })
        await store.create({
          interruptId: 'int-2',
          runId: 'run-i',
          threadId: 'thread-i',
          requestedAt: 20,
          payload: { tool: 'write' },
        })
        await store.create({
          interruptId: 'int-3',
          runId: 'run-other',
          threadId: 'thread-i',
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

      it('create is insert-if-absent: a duplicate id never clobbers a resolved interrupt', async (ctx) => {
        const store = resolveStore('interrupts')
        if (!store) return ctx.skip('store not provided')

        await store.create({
          interruptId: 'int-dup',
          runId: 'run-dup',
          threadId: 'thread-dup',
          requestedAt: 100,
          payload: { attempt: 1 },
        })
        await store.resolve('int-dup', { answer: 42 })

        // A second create with the SAME id must be a no-op — not overwrite the
        // now-resolved record back to pending with a fresh payload.
        await store.create({
          interruptId: 'int-dup',
          runId: 'run-dup',
          threadId: 'thread-dup',
          requestedAt: 200,
          payload: { attempt: 2 },
        })

        const after = await store.get('int-dup')
        expect(after?.status).toBe('resolved')
        expect(after?.response).toEqual({ answer: 42 })
        expect(after?.payload).toEqual({ attempt: 1 })
        expect(after?.requestedAt).toBe(100)
      })

      it('lists ordered by requestedAt ascending even when inserts are out of order', async (ctx) => {
        const store = resolveStore('interrupts')
        if (!store) return ctx.skip('store not provided')

        // Insert later-timestamped first so Map insertion order would reverse
        // requestedAt order without an explicit sort.
        await store.create({
          interruptId: 'int-late',
          runId: 'run-order',
          threadId: 'thread-order',
          requestedAt: 300,
          payload: {},
        })
        await store.create({
          interruptId: 'int-early',
          runId: 'run-order',
          threadId: 'thread-order',
          requestedAt: 100,
          payload: {},
        })
        await store.create({
          interruptId: 'int-mid',
          runId: 'run-order',
          threadId: 'thread-order',
          requestedAt: 200,
          payload: {},
        })

        expect(
          (await store.list('thread-order')).map((r) => r.interruptId),
        ).toEqual(['int-early', 'int-mid', 'int-late'])
        expect(
          (await store.listPending('thread-order')).map((r) => r.interruptId),
        ).toEqual(['int-early', 'int-mid', 'int-late'])
        expect(
          (await store.listByRun('run-order')).map((r) => r.interruptId),
        ).toEqual(['int-early', 'int-mid', 'int-late'])
      })
    })

    describe('metadata', () => {
      it('sets, gets, namespaces, and deletes without composite-key collisions', async (ctx) => {
        const store = resolveStore('metadata')
        if (!store) return ctx.skip('store not provided')

        expect(await store.get('scope-a', 'k')).toBeNull()

        await store.set('scope-a', 'k', { n: 1 })
        await store.set('scope-b', 'k', { n: 2 })
        expect(await store.get('scope-a', 'k')).toEqual({ n: 1 })
        expect(await store.get('scope-b', 'k')).toEqual({ n: 2 })

        await store.set('scope-a', 'k', { n: 3 })
        expect(await store.get('scope-a', 'k')).toEqual({ n: 3 })

        await store.delete('scope-a', 'k')
        expect(await store.get('scope-a', 'k')).toBeNull()
        // Delete is namespaced: scope-b untouched.
        expect(await store.get('scope-b', 'k')).toEqual({ n: 2 })

        // Composite identity must not alias across colon-containing parts.
        // ('a:b','c') and ('a','b:c') are distinct pairs.
        await store.set('a:b', 'c', 'left')
        await store.set('a', 'b:c', 'right')
        expect(await store.get('a:b', 'c')).toBe('left')
        expect(await store.get('a', 'b:c')).toBe('right')
        await store.delete('a:b', 'c')
        expect(await store.get('a:b', 'c')).toBeNull()
        expect(await store.get('a', 'b:c')).toBe('right')
      })
    })
  })
}
