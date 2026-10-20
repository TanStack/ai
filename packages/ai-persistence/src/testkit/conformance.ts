/**
 * Shared conformance suite for the `AIPersistence` store contract.
 *
 * Every backend runs this identical suite — the in-memory reference store and
 * every adapter you write against your own database — so that schema drift or
 * an implementation gap fails immediately. It exercises every method of every
 * store the persistence exposes and is the authoritative compatibility gate for
 * the store interfaces in `../types.ts`.
 *
 * Covers the five chat state stores (`messages`, `activities`, `runs`,
 * `interrupts`, `metadata`), the three generation stores (`generationRuns`,
 * `artifacts`, `blobs`), and the opt-in session stores (`log`,
 * `sessions`). The session store cases run only
 * when the store is present, so they need no `skip` entry. Locks are not part of
 * this suite — they are a separate coordination concern (`LockStore` +
 * `withLocks`), not a store.
 *
 * SKIPPING (declare or fail): a backend that deliberately omits a store must
 * declare it in `options.skip`, and one that omits an OPTIONAL store method
 * must declare it in `options.skipMethods`. Anything absent and not declared
 * fails the suite loudly, and anything declared absent is reported by vitest as
 * a SKIPPED case, never as a pass. Silent gaps are not allowed: a case that did
 * not run must never be indistinguishable from one that did. A chat-only
 * adapter with no activity store therefore passes
 * `skip: ['activities', 'generationRuns', 'artifacts', 'blobs']`, and a
 * generation-only one skips the five state stores. `listByParentRun` is
 * the exception. Subagent support is opt-in, its cases skip on their own, and
 * a `'runs.listByParentRun'` entry is accepted but has no effect.
 *
 * NOT COVERED HERE: the four durable-run fields on `RunRecord` (`sandboxKey`,
 * `detachedSince`, `cancelRequested`, `driverEpoch`). They exist for durable
 * sandboxed runs, a chat app never writes them, and requiring them here made every
 * backend implement four columns and an omitted-vs-explicit-undefined rule it had no
 * use for. They are proven by `runDurableRunFieldsConformance` from
 * `@tanstack/ai-sandbox/testkit`, next to the takeover and reaper suites that consume
 * them. A backend that never runs sandboxes can leave the columns out.
 *
 * RESERVED RUN-ID PREFIX: `rc-` belongs to the `listReclaimable` case, which
 * filters the method's (not thread-scoped) result down to `rc-` ids before an
 * exact-set assertion. A new case in `describe('runs')` must NOT seed a run id
 * starting with `rc-`, or it silently changes that expected set.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  LogConflictError,
  LogTruncatedError,
  OwnershipLostError,
  NO_OWNER_EPOCH,
} from '../types'
import type { ModelMessage } from '@tanstack/ai'
import type {
  AIPersistence,
  AIPersistenceStores,
  ArtifactRecord,
  LogStore,
  RunStore,
  SessionIndexEntry,
  SessionIndexPage,
} from '../types'

type MakePersistence = () => Promise<AIPersistence> | AIPersistence

/**
 * Methods that are optional on the `RunStore` contract.
 *
 * `findActiveRun` is deliberately NOT here: it is REQUIRED, per the evolution
 * policy in `../types.ts`. It was optional for one release cycle and silently
 * disabled reconnect on every backend that had not caught up.
 */
type OptionalRunStoreMethod =
  | 'listByThread'
  | 'listByParentRun'
  | 'listReclaimable'

/** Dotted `store.method` key a backend passes to declare an omitted method. */
export type PersistenceConformanceMethodKey = `runs.${OptionalRunStoreMethod}`

/**
 * Checks added after the suite shipped. They are off by default, so a backend
 * that passed before still passes. Turn them on with `options.checks`.
 *
 * - `'messages.metadata'`: `saveThread` / `loadThread` keep message `metadata`,
 *   including `metadata.tanstack.run.id` (run timings on reload need it).
 * - `'runs.listByThread.state'`: `listByThread` returns each run's current
 *   `status` and `finishedAt` after `update` (`reconstructChat`'s
 *   `includeRuns` needs it).
 */
export type PersistenceConformanceCheck =
  | 'messages.metadata'
  | 'runs.listByThread.state'

/**
 * Unwrap a value the store contract says must be present. Fails the test with a
 * readable message instead of a non-null assertion (banned in this package) or
 * an early `return` that would pass silently.
 */
function required<TValue>(
  value: TValue | null | undefined,
  what: string,
): TValue {
  if (value == null) {
    throw new Error(`AIPersistence conformance: expected ${what} to exist`)
  }
  return value
}

/** Read a `BlobObject.body` to completion as one contiguous buffer. */
async function drainStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Array<Uint8Array> = []
  let total = 0
  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

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
   * `listByParentRun` is the exception. Subagent support is opt-in, its cases
   * skip on their own, and a `'runs.listByParentRun'` entry is accepted but
   * has no effect.
   */
  skipMethods?: Array<PersistenceConformanceMethodKey>
  /**
   * Opt-in checks, off by default so existing backends keep passing. A check
   * that is not listed is reported as a skipped case. See
   * {@link PersistenceConformanceCheck}.
   */
  checks?: Array<PersistenceConformanceCheck>
  /**
   * Make a second store set on the same backend as `persistence`, as a second
   * machine sees it. The `log across instances` cases use its `log` store.
   * A backend that provides `log` must pass `twin`, or those cases fail.
   *
   * @example
   * ```ts
   * twin: (persistence) =>
   *   defineAIPersistence({
   *     stores: { ...persistence.stores, log: myLogStore(sameDatabase) },
   *   })
   * ```
   */
  twin?: (persistence: AIPersistence) => AIPersistence | Promise<AIPersistence>
}

/**
 * Register a Vitest suite that validates `makePersistence()` against the full
 * `AIPersistence` contract — every store it provides, and none it declares
 * skipped.
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
  const checks = new Set<PersistenceConformanceCheck>(options?.checks ?? [])

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
     * Return the second store set from `options.twin`. Throws (failing the
     * test) when the option is missing, mirroring `resolveStore`: a case
     * that cannot run must never be reported as a pass.
     */
    async function resolveTwin() {
      const twin = options?.twin
      if (twin === undefined) {
        throw new Error(
          'AIPersistence conformance: Provide `twin`: a second store set on the same backend.',
        )
      }
      return twin(persistence)
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

    // Subagent support is opt-in. A store without `listByParentRun` skips the
    // subagent checks (vitest reports them as skipped) and needs no
    // `skipMethods` entry.
    function supportsSubagents(
      runs: RunStore,
    ): runs is RunStore & Required<Pick<RunStore, 'listByParentRun'>> {
      return typeof runs.listByParentRun === 'function'
    }

    describe('messages', () => {
      // One-argument loadThread is the full-thread contract. Paging
      // (`limit` / `before`) is an optional hint; this suite does not require it.
      it('round-trips a thread and returns [] for unknown threads', async (ctx) => {
        const store = resolveStore('messages')
        if (!store) return ctx.skip('store not provided')

        expect(await store.loadThread('thread-unknown')).toEqual([])

        await store.saveThread('thread-msg', [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ])
        const loaded = await store.loadThread('thread-msg')
        expect(Array.isArray(loaded)).toBe(true)
        expect(loaded).toEqual([
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

      it('round-trips message metadata', async (ctx) => {
        if (!checks.has('messages.metadata')) {
          return ctx.skip(
            "opt-in check: pass { checks: ['messages.metadata'] }",
          )
        }
        const store = resolveStore('messages')
        if (!store) return ctx.skip('store not provided')

        const withMetadata: Array<ModelMessage> = [
          {
            role: 'user',
            content: 'hi',
            metadata: { author: { id: 'user-42' } },
          },
          {
            role: 'assistant',
            content: 'hello',
            metadata: { tanstack: { run: { id: 'run-1' } }, custom: 1 },
          },
        ]

        await store.saveThread('thread-metadata', withMetadata)
        expect(await store.loadThread('thread-metadata')).toEqual(withMetadata)
      })
    })

    describe('activities', () => {
      it('round-trips a thread and returns [] for unknown threads', async (ctx) => {
        const store = resolveStore('activities')
        if (!store) return ctx.skip('store not provided')

        expect(await store.loadActivities('thread-unknown')).toEqual([])

        await store.saveActivities('thread-act', [
          {
            id: 'act-1',
            activityType: 'SEARCH',
            content: { query: 'tanstack' },
            index: 1,
          },
        ])
        expect(await store.loadActivities('thread-act')).toEqual([
          {
            id: 'act-1',
            activityType: 'SEARCH',
            content: { query: 'tanstack' },
            index: 1,
          },
        ])

        await store.saveActivities('thread-act', [
          {
            id: 'act-2',
            activityType: 'PLAN',
            content: { steps: [] },
            index: 0,
          },
        ])
        expect(await store.loadActivities('thread-act')).toEqual([
          {
            id: 'act-2',
            activityType: 'PLAN',
            content: { steps: [] },
            index: 0,
          },
        ])
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

        const resumedAfterUpdate = await store.createOrResume({
          runId: 'run-1',
          threadId: 'thread-different',
          startedAt: 9999,
        })
        expect(resumedAfterUpdate).toEqual(done)

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

      // `parentRunId`, `subagentRunId`, and `name` travel with createOrResume.
      // A parent row omits them. A child row keeps the values from the first
      // insert. A later createOrResume for that runId must not overwrite them.
      // Only a store with subagent support (`listByParentRun`) must keep them.
      it('round-trips subagent link fields and ignores them on resume', async (ctx) => {
        const store = resolveStore('runs')
        if (!store) return ctx.skip('store not provided')
        if (!supportsSubagents(store)) {
          return ctx.skip('runs.listByParentRun not implemented')
        }

        const parent = await store.createOrResume({
          runId: 'lp-parent',
          threadId: 'lp-thread',
          startedAt: 1,
        })
        expect(parent.parentRunId).toBeUndefined()
        expect(parent.subagentRunId).toBeUndefined()
        expect(parent.name).toBeUndefined()

        const child = await store.createOrResume({
          runId: 'lp-child',
          threadId: 'subagent:lp-child',
          startedAt: 2,
          parentRunId: 'lp-parent',
          subagentRunId: 'lp-sub',
          name: 'researcher',
        })
        expect(child).toMatchObject({
          runId: 'lp-child',
          threadId: 'subagent:lp-child',
          startedAt: 2,
          parentRunId: 'lp-parent',
          subagentRunId: 'lp-sub',
          name: 'researcher',
        })

        const resumed = await store.createOrResume({
          runId: 'lp-child',
          threadId: 'lp-other-thread',
          startedAt: 99,
          parentRunId: 'lp-other-parent',
          subagentRunId: 'lp-other-sub',
          name: 'writer',
        })
        expect(resumed).toMatchObject({
          runId: 'lp-child',
          threadId: 'subagent:lp-child',
          startedAt: 2,
          parentRunId: 'lp-parent',
          subagentRunId: 'lp-sub',
          name: 'researcher',
        })
        expect(await store.get('lp-child')).toMatchObject({
          parentRunId: 'lp-parent',
          subagentRunId: 'lp-sub',
          name: 'researcher',
        })
      })

      it('findActiveRun returns the most recent running run for a thread', async (ctx) => {
        const store = resolveStore('runs')
        if (!store) return ctx.skip('store not provided')

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

      it('lists runs by thread with their current status and finishedAt', async (ctx) => {
        if (!checks.has('runs.listByThread.state')) {
          return ctx.skip(
            "opt-in check: pass { checks: ['runs.listByThread.state'] }",
          )
        }
        const runs = resolveStore('runs')
        if (!runs) return ctx.skip('store not provided')
        if (!hasRunsMethod(runs, 'listByThread')) {
          return ctx.skip('runs.listByThread not implemented')
        }

        await runs.createOrResume({
          runId: 'lts-a',
          threadId: 'lts',
          startedAt: 1,
        })
        await runs.update('lts-a', { status: 'completed', finishedAt: 5 })

        expect(await runs.listByThread('lts')).toEqual([
          expect.objectContaining({
            runId: 'lts-a',
            status: 'completed',
            startedAt: 1,
            finishedAt: 5,
          }),
        ])
      })

      // `listByParentRun` is optional and is skipped when absent. A store that
      // has it returns only that parent's children, oldest `startedAt` first,
      // and [] for an unknown parent.
      it('lists child runs by parent when supported', async (ctx) => {
        const runs = resolveStore('runs')
        if (!runs) return ctx.skip('store not provided')
        if (!supportsSubagents(runs)) {
          return ctx.skip('runs.listByParentRun not implemented')
        }

        await runs.createOrResume({
          runId: 'lbp-parent',
          threadId: 'lbp-thread',
          startedAt: 1,
        })
        await runs.createOrResume({
          runId: 'lbp-b',
          threadId: 'subagent:lbp-b',
          startedAt: 20,
          parentRunId: 'lbp-parent',
          subagentRunId: 'lbp-sub-b',
          name: 'seo',
        })
        await runs.createOrResume({
          runId: 'lbp-a',
          threadId: 'subagent:lbp-a',
          startedAt: 10,
          parentRunId: 'lbp-parent',
          subagentRunId: 'lbp-sub-a',
          name: 'researcher',
        })
        await runs.createOrResume({
          runId: 'lbp-other',
          threadId: 'subagent:lbp-other',
          startedAt: 5,
          parentRunId: 'lbp-elsewhere',
          subagentRunId: 'lbp-sub-other',
          name: 'writer',
        })

        const listed = await runs.listByParentRun('lbp-parent')
        expect(listed.map((run) => run.runId)).toEqual(['lbp-a', 'lbp-b'])
        expect(listed.map((run) => run.name)).toEqual(['researcher', 'seo'])
        expect(await runs.listByParentRun('lbp-missing')).toEqual([])
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

    describe('generationRuns', () => {
      it('creates, resumes idempotently, updates, and gets', async () => {
        const store = resolveStore('generationRuns')
        if (!store) return

        expect(await store.get('gen-missing')).toBeNull()

        const created = await store.createOrResume({
          runId: 'gen-1',
          threadId: 'gen-thread-1',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 1000,
        })
        expect(created).toMatchObject({
          runId: 'gen-1',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          status: 'running',
          startedAt: 1000,
        })
        // threadId is the slot the run fills and is required: it must round-trip
        // exactly, since findLatestForThread is the only query that finds a run.
        expect(created.threadId).toBe('gen-thread-1')

        // Idempotent: the stored record comes back untouched by the new input.
        const resumed = await store.createOrResume({
          runId: 'gen-1',
          activity: 'video',
          provider: 'google',
          model: 'veo-3',
          startedAt: 9999,
          threadId: 'thread-late',
        })
        expect(resumed).toMatchObject({
          runId: 'gen-1',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 1000,
        })
        // Idempotency covers threadId too: the late scope must not overwrite the
        // one the run was filed under.
        expect(resumed.threadId).toBe('gen-thread-1')

        await store.update('gen-1', {
          status: 'completed',
          finishedAt: 2000,
          result: { images: [{ url: 'https://example.com/a.png' }] },
          artifacts: [
            {
              role: 'output',
              artifactId: 'art-1',
              runId: 'gen-1',
              threadId: 'thread-gen',
              name: 'a.png',
              mimeType: 'image/png',
              size: 3,
              createdAt: '2024-01-01T00:00:00.000Z',
              source: {
                activity: 'image',
                path: 'images.0',
                provider: 'openai',
                model: 'gpt-image-1',
              },
            },
          ],
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        })
        const done = await store.get('gen-1')
        expect(done).toMatchObject({
          status: 'completed',
          finishedAt: 2000,
          result: { images: [{ url: 'https://example.com/a.png' }] },
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        })
        expect(done?.artifacts).toHaveLength(1)
        expect(done?.artifacts?.[0]).toMatchObject({
          artifactId: 'art-1',
          mimeType: 'image/png',
        })

        await store.update('gen-1', {
          status: 'failed',
          error: { message: 'boom', code: 'provider_error' },
        })
        const failed = await store.get('gen-1')
        expect(failed?.status).toBe('failed')
        expect(failed?.error).toEqual({
          message: 'boom',
          code: 'provider_error',
        })

        // Patching a missing run is a no-op (does not throw, does not create).
        await store.update('gen-absent', { status: 'completed' })
        expect(await store.get('gen-absent')).toBeNull()
      })

      // `findLatestForThread` is REQUIRED: `reconstructGeneration` hydrates a
      // server-driven client from the stable thread id alone, so a backend that
      // always answers `null` silently restores nothing rather than degrading.
      it('findLatestForThread returns the most recently started linked run', async () => {
        const store = resolveStore('generationRuns')
        if (!store) return

        const thread = 'thread-gen-latest'
        expect(await store.findLatestForThread(thread)).toBeNull()

        // Insert out of order so insertion order cannot stand in for startedAt.
        await store.createOrResume({
          runId: 'gen-late',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 3000,
          threadId: thread,
        })
        await store.createOrResume({
          runId: 'gen-early',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 1000,
          threadId: thread,
        })
        expect(await store.findLatestForThread(thread)).toMatchObject({
          runId: 'gen-late',
        })

        // Another thread's run is never returned, and unlike findActiveRun a
        // TERMINAL run still counts — this is "the latest", not "the active".
        await store.createOrResume({
          runId: 'gen-other',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 9000,
          threadId: 'thread-gen-other',
        })
        await store.update('gen-late', {
          status: 'completed',
          finishedAt: 3500,
        })
        expect(await store.findLatestForThread(thread)).toMatchObject({
          runId: 'gen-late',
          status: 'completed',
        })

        // A run with no thread link is not attributed to any thread.
        expect(await store.findLatestForThread('thread-unlinked')).toBeNull()
      })
    })

    describe('artifacts', () => {
      const artifact = (
        overrides: Partial<ArtifactRecord> & Pick<ArtifactRecord, 'artifactId'>,
      ): ArtifactRecord => ({
        runId: 'run-art',
        threadId: 'thread-art',
        name: 'image.png',
        mimeType: 'image/png',
        size: 3,
        createdAt: 100,
        ...overrides,
      })

      it('saves as an upsert, gets, and lists by run', async () => {
        const store = resolveStore('artifacts')
        if (!store) return

        expect(await store.get('art-missing')).toBeNull()
        expect(await store.list('run-unknown')).toEqual([])

        await store.save(
          artifact({
            artifactId: '\u{10000}',
            blobKey: 'artifacts/run-art/art-a',
            createdAt: 100,
          }),
        )
        await store.save(
          artifact({
            artifactId: '\u{e000}',
            sourceUrl: 'https://provider.example/expiring.png',
            createdAt: 100,
          }),
        )
        await store.save(
          artifact({ artifactId: 'art-c', runId: 'run-art-other' }),
        )

        expect(await store.get('\u{10000}')).toMatchObject({
          artifactId: '\u{10000}',
          runId: 'run-art',
          threadId: 'thread-art',
          blobKey: 'artifacts/run-art/art-a',
          name: 'image.png',
          mimeType: 'image/png',
          size: 3,
          createdAt: 100,
        })
        expect(await store.get('\u{e000}')).toMatchObject({
          sourceUrl: 'https://provider.example/expiring.png',
        })

        expect((await store.list('run-art')).map((r) => r.artifactId)).toEqual([
          '\u{e000}',
          '\u{10000}',
        ])

        // save() is insert-OR-OVERWRITE: re-saving an id corrects the record.
        await store.save(
          artifact({ artifactId: '\u{10000}', name: 'renamed.png', size: 9 }),
        )
        const updated = await store.get('\u{10000}')
        expect(updated).toMatchObject({ name: 'renamed.png', size: 9 })
        expect(updated?.blobKey).toBeUndefined()
        expect((await store.list('run-art')).map((r) => r.artifactId)).toEqual([
          '\u{e000}',
          '\u{10000}',
        ])
      })

      it('lists a thread in deterministic createdAt and artifactId order', async () => {
        const store = resolveStore('artifacts')
        if (!store) return

        await store.save(
          artifact({
            artifactId: 'thread-b',
            threadId: 'thread-order',
            createdAt: 2,
          }),
        )
        await store.save(
          artifact({
            artifactId: 'thread-a',
            threadId: 'thread-order',
            createdAt: 2,
          }),
        )
        await store.save(
          artifact({
            artifactId: 'thread-early',
            threadId: 'thread-order',
            createdAt: 1,
          }),
        )
        await store.save(
          artifact({
            artifactId: 'other',
            threadId: 'thread-other',
            createdAt: 0,
          }),
        )

        expect(
          (await store.listForThread('thread-order')).map((r) => r.artifactId),
        ).toEqual(['thread-early', 'thread-a', 'thread-b'])
      })

      it('orders artifact IDs by UTF-8 bytes after createdAt', async () => {
        const store = resolveStore('artifacts')
        if (!store) return

        await store.save(
          artifact({
            artifactId: '\u{10000}',
            threadId: 'thread-utf8',
            createdAt: 1,
          }),
        )
        await store.save(
          artifact({
            artifactId: '\u{e000}',
            threadId: 'thread-utf8',
            createdAt: 1,
          }),
        )
        await store.save(
          artifact({ artifactId: 'a', threadId: 'thread-utf8', createdAt: 1 }),
        )

        expect(
          (await store.listForThread('thread-utf8')).map((r) => r.artifactId),
        ).toEqual(['a', '\u{e000}', '\u{10000}'])
      })

      it('deletes one artifact and every artifact for a run', async () => {
        const store = resolveStore('artifacts')
        if (!store) return

        await store.save(artifact({ artifactId: 'art-d1', runId: 'run-del' }))
        await store.save(artifact({ artifactId: 'art-d2', runId: 'run-del' }))
        await store.save(
          artifact({ artifactId: 'art-keep', runId: 'run-keep' }),
        )

        await store.delete('art-d1')
        expect(await store.get('art-d1')).toBeNull()
        expect((await store.list('run-del')).map((r) => r.artifactId)).toEqual([
          'art-d2',
        ])

        // Deleting an absent id is a silent no-op, mirroring BlobStore.delete.
        await store.delete('art-d1')

        await store.deleteForRun('run-del')
        expect(await store.list('run-del')).toEqual([])
        expect(await store.get('art-d2')).toBeNull()
        // Scoped to the run: another run's artifacts survive.
        expect((await store.list('run-keep')).map((r) => r.artifactId)).toEqual(
          ['art-keep'],
        )
        // deleteForRun on a run with no artifacts is a no-op.
        await store.deleteForRun('run-del')
      })
    })

    describe('blobs', () => {
      it('round-trips bytes and metadata through put/get/head', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        expect(await store.get('blob-missing')).toBeNull()
        expect(await store.head('blob-missing')).toBeNull()

        const bytes = new Uint8Array([1, 2, 3, 4])
        const put = await store.put('blob/a', bytes, {
          contentType: 'image/png',
          customMetadata: { runId: 'run-blob' },
        })
        expect(put).toMatchObject({
          key: 'blob/a',
          size: 4,
          contentType: 'image/png',
          customMetadata: { runId: 'run-blob' },
        })

        const object = required(await store.get('blob/a'), 'blob/a')
        expect(new Uint8Array(await object.arrayBuffer())).toEqual(bytes)
        expect(object).toMatchObject({
          key: 'blob/a',
          size: 4,
          contentType: 'image/png',
          customMetadata: { runId: 'run-blob' },
        })

        const head = await store.head('blob/a')
        expect(head).toMatchObject({ key: 'blob/a', size: 4 })

        // A string body encodes as UTF-8 and reads back through text().
        await store.put('blob/text', 'héllo')
        const text = required(await store.get('blob/text'), 'blob/text')
        expect(await text.text()).toBe('héllo')

        // An ArrayBuffer body is accepted too.
        await store.put('blob/buffer', new Uint8Array([9, 9]).buffer)
        const buffered = required(await store.get('blob/buffer'), 'blob/buffer')
        expect(new Uint8Array(await buffered.arrayBuffer())).toEqual(
          new Uint8Array([9, 9]),
        )
      })

      it('accepts a stream body with no declared length', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        // A TransformStream's readable side carries no declared length —
        // exactly what a fetch-based producer hands the store when the origin
        // chunks its reply (or its length can't be trusted). Byte bodies take
        // a different branch in most stores and prove nothing about the
        // streaming path, so this case is the one that keeps a store honest:
        // it must drain the stream, not require a length up front.
        const bytes = new Uint8Array(64 * 1024).map((_, i) => i % 251)
        const source = required(new Response(bytes).body, 'response body')
        const lengthless = source.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>(),
        )
        const put = await store.put('blob/stream', lengthless, {
          contentType: 'application/octet-stream',
        })
        expect(put.size).toBe(bytes.byteLength)

        const object = required(await store.get('blob/stream'), 'blob/stream')
        expect(new Uint8Array(await object.arrayBuffer())).toEqual(bytes)
        expect(object.size).toBe(bytes.byteLength)
      })

      it('accepts expectedLength as an advisory hint for a stream body', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        // The real-world combination: a length-less stream PLUS the hint —
        // which is what the artifact middleware sends when the origin declared
        // a trustworthy `content-length`. The hint is advisory (a store may
        // use it to pick an upload strategy); the drained bytes stay the
        // record of truth, so `size` must still be the count of what arrived.
        const bytes = new Uint8Array(9 * 1024).map((_, i) => i % 251)
        const source = required(new Response(bytes).body, 'response body')
        const lengthless = source.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>(),
        )
        const put = await store.put('blob/stream-hint', lengthless, {
          expectedLength: bytes.byteLength,
        })
        expect(put.size).toBe(bytes.byteLength)

        const object = required(
          await store.get('blob/stream-hint'),
          'blob/stream-hint',
        )
        expect(new Uint8Array(await object.arrayBuffer())).toEqual(bytes)
        expect(object.size).toBe(bytes.byteLength)
      })

      it('serves a byte range and reports the slice it served', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        // Range reads are what a serve route turns into `206` +
        // `Content-Range` — the shape `<video>` seeking is built on. `size`
        // keeps reporting the WHOLE object so the route can finish the
        // `Content-Range` header from the same result.
        const bytes = new Uint8Array(1024).map((_, i) => i % 251)
        await store.put('blob/range', bytes)

        const middle = required(
          await store.get('blob/range', { range: { offset: 100, length: 50 } }),
          'blob/range',
        )
        expect(new Uint8Array(await middle.arrayBuffer())).toEqual(
          bytes.slice(100, 150),
        )
        expect(middle.size).toBe(bytes.byteLength)
        expect(middle.range).toEqual({ offset: 100, length: 50 })

        // No `length`: from the offset to the end.
        const tail = required(
          await store.get('blob/range', { range: { offset: 1000 } }),
          'blob/range',
        )
        expect(new Uint8Array(await tail.arrayBuffer())).toEqual(
          bytes.slice(1000),
        )
        expect(tail.range).toEqual({ offset: 1000, length: 24 })

        // A `length` past the end is clamped, not an error: `bytes=1000-2000`
        // against a 1 KiB object is a legal request that serves 24 bytes.
        const clamped = required(
          await store.get('blob/range', {
            range: { offset: 1000, length: 1000 },
          }),
          'blob/range',
        )
        expect(clamped.range).toEqual({ offset: 1000, length: 24 })
        expect((await clamped.arrayBuffer()).byteLength).toBe(24)

        // The streaming accessor carries the same slice as arrayBuffer().
        const streamed = required(
          await store.get('blob/range', { range: { offset: 10, length: 5 } }),
          'blob/range',
        )
        const body = streamed.body
        if (body) {
          expect(await drainStream(body)).toEqual(bytes.slice(10, 15))
        }

        // A whole-object read reports no `range` — a caller that sees one
        // takes the bytes for a slice and would answer `206` for all of them.
        const whole = required(await store.get('blob/range'), 'blob/range')
        expect(whole.range).toBeUndefined()
      })

      it('overwrites an existing key and deletes silently', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        const first = await store.put('blob/over', new Uint8Array([1]), {
          contentType: 'text/plain',
          customMetadata: { v: '1' },
        })
        const second = await store.put('blob/over', new Uint8Array([2, 2, 2]), {
          contentType: 'application/octet-stream',
          customMetadata: { v: '2' },
        })

        expect(second).toMatchObject({
          size: 3,
          contentType: 'application/octet-stream',
          customMetadata: { v: '2' },
        })
        // When a backend exposes etags at all, new bytes get a new one.
        if (first.etag !== undefined && second.etag !== undefined) {
          expect(second.etag).not.toBe(first.etag)
        }
        const after = required(await store.get('blob/over'), 'blob/over')
        expect(new Uint8Array(await after.arrayBuffer())).toEqual(
          new Uint8Array([2, 2, 2]),
        )

        await store.delete('blob/over')
        expect(await store.get('blob/over')).toBeNull()
        expect(await store.head('blob/over')).toBeNull()
        // Deleting an absent key is a no-op, not an error.
        await store.delete('blob/over')
      })

      it('lists by literal prefix in ascending key order', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        // `_` and `%` are LIKE metacharacters: a SQL backend that forgets to
        // escape them would match `list-x/…` here. And SQLite's LIKE is
        // case-insensitive for ASCII, so `LIST_/` must not match either.
        await store.put('list_/b', new Uint8Array([2]))
        await store.put('list_/a', new Uint8Array([1]))
        await store.put('list_/c', new Uint8Array([3]))
        await store.put('list-x/d', new Uint8Array([4]))
        await store.put('LIST_/e', new Uint8Array([5]))

        const page = await store.list({ prefix: 'list_/' })
        expect(page.objects.map((o) => o.key)).toEqual([
          'list_/a',
          'list_/b',
          'list_/c',
        ])
        expect(page.truncated).toBeFalsy()

        expect(
          (await store.list({ prefix: 'list_/nothing-here' })).objects,
        ).toEqual([])
      })

      it('pages with a cursor and returns an empty page for limit 0', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        for (const key of ['page/a', 'page/b', 'page/c', 'page/d', 'page/e']) {
          await store.put(key, new Uint8Array([1]))
        }

        const empty = await store.list({ prefix: 'page/', limit: 0 })
        expect(empty.objects).toEqual([])
        expect(empty.truncated).toBeFalsy()
        expect(empty.cursor).toBeUndefined()

        // Walk every key exactly once: each page's cursor resumes strictly
        // after the last key it returned.
        const seen: Array<string> = []
        let cursor: string | undefined
        for (let guard = 0; guard < 10; guard++) {
          const result = await store.list({
            prefix: 'page/',
            limit: 2,
            ...(cursor !== undefined ? { cursor } : {}),
          })
          seen.push(...result.objects.map((o) => o.key))
          if (!result.truncated) break
          expect(result.cursor).toBe(result.objects.at(-1)?.key)
          cursor = result.cursor
        }
        expect(seen).toEqual(['page/a', 'page/b', 'page/c', 'page/d', 'page/e'])

        // An exact-fit limit is not truncated: no key matches beyond the page.
        const exact = await store.list({ prefix: 'page/', limit: 5 })
        expect(exact.objects.map((o) => o.key)).toEqual(seen)
        expect(exact.truncated).toBeFalsy()
      })
    })

    // The session stores below are opt-in. A backend without one skips its
    // cases and needs no `skip` entry.
    // Each case uses its own log, because the suite shares one persistence.
    const newLog = () => `log-${crypto.randomUUID()}`
    // The suite shares one store. A case that lists orphans filters by its
    // own harness, so the orphans of other cases cannot fill the limit.
    const newHarness = () => `harness-${crypto.randomUUID()}`
    // Subscribe a listener that counts its calls.
    const countCalls = (store: LogStore, logId: string) => {
      let calls = 0
      const stop = store.subscribe({
        logId,
        listener: () => {
          calls += 1
        },
      })
      return { calls: () => calls, stop }
    }
    // Give a store that notifies later (a poller) the time to call again.
    const waitForLateCalls = () =>
      new Promise((resolve) => setTimeout(resolve, 50))

    describe('log', () => {
      const types = async (store: LogStore, logId: string) =>
        (await store.read({ logId })).map((entry) => [
          entry.seq,
          entry.record.type,
        ])

      it('writes a batch at consecutive positions and reads it in order', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [
            { type: 'a', n: 1 },
            { type: 'b', n: 2 },
          ],
        })
        await store.append({
          logId,
          seq: 3,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'c', nested: { deep: [1] } }],
        })

        expect(await store.read({ logId })).toEqual([
          { seq: 1, record: { type: 'a', n: 1 } },
          { seq: 2, record: { type: 'b', n: 2 } },
          { seq: 3, record: { type: 'c', nested: { deep: [1] } } },
        ])
      })

      it('rejects a taken position or a gap with LogConflictError and writes nothing', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'first' }],
        })

        await expect(
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: [{ type: 'late-1' }, { type: 'late-2' }],
          }),
        ).rejects.toBeInstanceOf(LogConflictError)

        // A gap (position 3 while 2 is free) is a conflict too.
        await expect(
          store.append({
            logId,
            seq: 3,
            epoch: NO_OWNER_EPOCH,
            records: [{ type: 'gap' }],
          }),
        ).rejects.toBeInstanceOf(LogConflictError)

        expect(await types(store, logId)).toEqual([[1, 'first']])
      })

      it('names the log in a LogConflictError', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'first' }],
        })

        await expect(
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: [{ type: 'late' }],
          }),
        ).rejects.toMatchObject({ name: 'LogConflictError', logId, seq: 1 })
      })

      it('rejects an epoch other than NO_OWNER_EPOCH on a log that no host acquired', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        const write = store.append({
          logId,
          seq: 1,
          epoch: 1,
          records: [{ type: 'fenced' }],
        })
        await expect(write).rejects.toBeInstanceOf(OwnershipLostError)
        await expect(write).rejects.toMatchObject({ logId, epoch: 1 })

        expect(await store.read({ logId })).toEqual([])
      })

      it('lets one of two concurrent appends at one position win', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        const results = await Promise.allSettled([
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: [{ type: 'left' }],
          }),
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: [{ type: 'right-1' }, { type: 'right-2' }],
          }),
        ])

        const won = results.filter((result) => result.status === 'fulfilled')
        const lost = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        )
        expect(won).toHaveLength(1)
        expect(lost).toHaveLength(1)
        expect(lost[0]).toBeInstanceOf(LogConflictError)
        // Only the winner's batch is in the log, whole.
        const winner = results[0].status === 'fulfilled' ? 'left' : 'right'
        expect(await types(store, logId)).toEqual(
          winner === 'left'
            ? [[1, 'left']]
            : [
                [1, 'right-1'],
                [2, 'right-2'],
              ],
        )
      })

      it('writes nothing for an empty batch', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [],
        })

        expect(await store.read({ logId })).toEqual([])
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'still-first' }],
        })
        expect(await types(store, logId)).toEqual([[1, 'still-first']])
      })

      it('reads after a position, with a limit', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [
            { type: 'r1' },
            { type: 'r2' },
            { type: 'r3' },
            { type: 'r4' },
          ],
        })

        const page = await store.read({ logId, after: 1, limit: 2 })
        expect(page.map((entry) => entry.seq)).toEqual([2, 3])
        expect(
          (await store.read({ logId, after: 3 })).map((entry) => entry.seq),
        ).toEqual([4])
        expect(await store.read({ logId, after: 4 })).toEqual([])
        expect(await store.read({ logId: newLog() })).toEqual([])
      })

      it('reads nothing with limit 0', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'r1' }, { type: 'r2' }],
        })

        // The log has records, so the empty page comes from the limit.
        expect(await types(store, logId)).toHaveLength(2)
        expect(await store.read({ logId, limit: 0 })).toEqual([])
      })

      it('keeps logs apart', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const left = newLog()
        const right = newLog()

        await store.append({
          logId: left,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'left' }],
        })
        // Position 1 is free on the other log.
        await store.append({
          logId: right,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'right' }],
        })

        expect(await types(store, left)).toEqual([[1, 'left']])
        expect(await types(store, right)).toEqual([[1, 'right']])
      })

      it('calls a listener after each append until it unsubscribes', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const counter = countCalls(store, logId)

        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'one' }],
        })
        await expect.poll(counter.calls).toBe(1)
        counter.stop()
        await store.append({
          logId,
          seq: 2,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'two' }],
        })

        await waitForLateCalls()
        expect(counter.calls()).toBe(1)
      })

      it('does not share record objects with the caller', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const written = { type: 'shared', list: [1] }
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [written],
        })
        written.list.push(2)

        const [first] = await store.read({ logId })
        required(first, 'the first log entry').record.type = 'changed'

        expect(await store.read({ logId })).toEqual([
          { seq: 1, record: { type: 'shared', list: [1] } },
        ])
      })
    })

    // Expiry uses real time, so that every backend can run these cases: a
    // short ttl or wake is due after `waitPastShort()`. The window is long
    // enough for a store with network round trips to check "not due yet".
    describe('log ownership', () => {
      const LIVE_MS = 10_000
      const SHORT_MS = 400
      const waitPastShort = () =>
        new Promise((resolve) => setTimeout(resolve, 500))
      const claimOf = (logId: string, ownerId: string) => ({
        logId,
        harness: 'h',
        ownerId,
        ttlMs: LIVE_MS,
      })
      // Owner `a` lets the log expire. Then owner `b` acquires it.
      const handOver = async (store: LogStore) => {
        const logId = newLog()
        await store.acquireOwnership({
          ...claimOf(logId, 'a'),
          ttlMs: SHORT_MS,
        })
        await waitPastShort()
        const taken = await store.acquireOwnership(claimOf(logId, 'b'))
        return { logId, taken }
      }

      it('gives the first acquire epoch 1 and refuses a second owner', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        expect(await store.acquireOwnership(claimOf(logId, 'a'))).toEqual({
          epoch: 1,
        })
        expect(await store.acquireOwnership(claimOf(logId, 'b'))).toBeNull()
      })

      it('returns the same epoch when the owner acquires again', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        expect(await store.acquireOwnership(claimOf(logId, 'a'))).toEqual({
          epoch: 1,
        })
        expect(await store.acquireOwnership(claimOf(logId, 'a'))).toEqual({
          epoch: 1,
        })
      })

      it('hands a log to a new owner after expiry with a higher epoch', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')

        const { taken } = await handOver(store)

        expect(taken).toEqual({ epoch: 2, expired: true })
      })

      it('fences a write from the previous owner', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const { logId } = await handOver(store)

        await expect(
          store.append({ logId, seq: 1, epoch: 1, records: [{ type: 'old' }] }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        await store.append({
          logId,
          seq: 1,
          epoch: 2,
          records: [{ type: 'new' }],
        })
        // The fence comes before the position check: a stale write at a
        // taken position is an OwnershipLostError, not a LogConflictError.
        await expect(
          store.append({ logId, seq: 1, epoch: 1, records: [{ type: 'old' }] }),
        ).rejects.toBeInstanceOf(OwnershipLostError)

        expect(await store.read({ logId })).toEqual([
          { seq: 1, record: { type: 'new' } },
        ])
      })

      it('refuses NO_OWNER_EPOCH once a log was acquired', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.acquireOwnership(claimOf(logId, 'a'))
        await store.releaseOwnership({ logId, ownerId: 'a', epoch: 1 })

        await expect(
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: [{ type: 'unowned' }],
          }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        // The owner released the log, so its own epoch cannot write either.
        await expect(
          store.append({
            logId,
            seq: 1,
            epoch: 1,
            records: [{ type: 'released' }],
          }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        expect(await store.read({ logId })).toEqual([])
      })

      it('renews only with the current epoch and owner', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const { logId } = await handOver(store)

        expect(
          await store.renewOwnership({
            logId,
            ownerId: 'a',
            epoch: 1,
            ttlMs: LIVE_MS,
          }),
        ).toBe(false)
        expect(
          await store.renewOwnership({
            logId,
            ownerId: 'a',
            epoch: 2,
            ttlMs: LIVE_MS,
          }),
        ).toBe(false)
        expect(
          await store.renewOwnership({
            logId,
            ownerId: 'b',
            epoch: 2,
            ttlMs: LIVE_MS,
          }),
        ).toBe(true)
      })

      it('renews after expiry when nobody took the log', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.acquireOwnership({
          ...claimOf(logId, 'a'),
          ttlMs: SHORT_MS,
        })
        await waitPastShort()

        expect(
          await store.renewOwnership({
            logId,
            ownerId: 'a',
            epoch: 1,
            ttlMs: LIVE_MS,
          }),
        ).toBe(true)
        expect(await store.acquireOwnership(claimOf(logId, 'b'))).toBeNull()
      })

      it('releases and lets anyone acquire with the next epoch', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.acquireOwnership(claimOf(logId, 'a'))

        await store.releaseOwnership({ logId, ownerId: 'a', epoch: 1 })

        // A released log is not held, so the old owner cannot renew it.
        expect(
          await store.renewOwnership({
            logId,
            ownerId: 'a',
            epoch: 1,
            ttlMs: LIVE_MS,
          }),
        ).toBe(false)
        expect(await store.acquireOwnership(claimOf(logId, 'b'))).toEqual({
          epoch: 2,
        })
      })

      it('ignores a release with a stale epoch', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const { logId } = await handOver(store)

        await store.releaseOwnership({ logId, ownerId: 'a', epoch: 1 })
        // The current epoch with another owner is ignored too.
        await store.releaseOwnership({ logId, ownerId: 'a', epoch: 2 })

        expect(await store.acquireOwnership(claimOf(logId, 'c'))).toBeNull()
      })

      it('lists an expired log as orphaned', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const harness = newHarness()
        await store.acquireOwnership({
          ...claimOf(logId, 'a'),
          harness,
          ttlMs: SHORT_MS,
        })

        // A live owner holds the log, so the log is not orphaned yet.
        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([])
        await waitPastShort()
        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([{ logId, harness, reason: 'expired' }])
      })

      it('lists a released log with a due wake', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const harness = newHarness()
        await store.acquireOwnership({ ...claimOf(logId, 'a'), harness })
        await store.releaseOwnership({
          logId,
          ownerId: 'a',
          epoch: 1,
          wakeInMs: SHORT_MS,
        })

        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([])
        await waitPastShort()
        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([{ logId, harness, reason: 'wake' }])
      })

      it('clears the wake time on acquire', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const harness = newHarness()
        await store.acquireOwnership({ ...claimOf(logId, 'a'), harness })
        await store.releaseOwnership({
          logId,
          ownerId: 'a',
          epoch: 1,
          wakeInMs: 0,
        })

        // Owner `b` runs the woken log, then gives it back with no wake.
        await store.acquireOwnership({ ...claimOf(logId, 'b'), harness })
        await store.releaseOwnership({ logId, ownerId: 'b', epoch: 2 })

        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([])
      })

      it('filters orphaned logs by harness', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const first = newLog()
        const second = newLog()
        const h1 = newHarness()
        const h2 = newHarness()
        await store.acquireOwnership({
          ...claimOf(first, 'a'),
          harness: h1,
          ttlMs: SHORT_MS,
        })
        // This log is due later, so the order below is fixed.
        await store.acquireOwnership({
          ...claimOf(second, 'a'),
          harness: h2,
          ttlMs: SHORT_MS + 10,
        })
        await waitPastShort()

        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [h1] }),
        ).toEqual([{ logId: first, harness: h1, reason: 'expired' }])
        // The log that is due first comes first, in any order of `harnesses`.
        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [h2, h1] }),
        ).toEqual([
          { logId: first, harness: h1, reason: 'expired' },
          { logId: second, harness: h2, reason: 'expired' },
        ])
      })

      it('keeps a pinned log away from other affinities', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const harness = newHarness()
        const claim = { ...claimOf(logId, 'a'), harness }
        // A pin counts while its host is alive.
        await store.markHostAlive({ hostId: 'host-1', ttlMs: LIVE_MS })
        await store.acquireOwnership(claim)
        await store.pinToWorkers({ logId, epoch: 1, affinity: 'host-1' })
        await store.releaseOwnership({
          logId,
          ownerId: 'a',
          epoch: 1,
          wakeInMs: 0,
        })

        // List before the acquires below, because a new owner makes the log
        // live again.
        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([])
        expect(
          await store.listLogsWithoutOwner({
            limit: 10,
            harnesses: [harness],
            affinity: 'host-1',
          }),
        ).toEqual([{ logId, harness, reason: 'wake' }])
        expect(
          await store.acquireOwnership({
            ...claim,
            ownerId: 'b',
            affinity: 'host-2',
          }),
        ).toBeNull()
        expect(
          await store.acquireOwnership({
            ...claim,
            ownerId: 'b',
            affinity: 'host-1',
          }),
        ).toEqual({ epoch: 2 })
      })

      it('lets other hosts take a pinned log when the heartbeat of its host expired', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const harness = newHarness()
        const host = `host-${logId}`
        await store.markHostAlive({ hostId: host, ttlMs: SHORT_MS })
        await store.acquireOwnership({
          ...claimOf(logId, 'a'),
          harness,
          affinity: host,
        })
        await store.pinToWorkers({ logId, epoch: 1, affinity: host })
        await store.releaseOwnership({
          logId,
          ownerId: 'a',
          epoch: 1,
          wakeInMs: 0,
        })
        const other = { ...claimOf(logId, 'b'), harness }

        // The host is alive: its idle log stays with it.
        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([])
        expect(await store.acquireOwnership(other)).toBeNull()

        await waitPastShort()
        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([{ logId, harness, reason: 'wake' }])
        expect(await store.acquireOwnership(other)).toEqual({ epoch: 2 })
      })

      it('fences pinToWorkers', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.acquireOwnership(claimOf(logId, 'a'))
        await store.releaseOwnership({ logId, ownerId: 'a', epoch: 1 })
        await store.acquireOwnership(claimOf(logId, 'b'))

        await expect(
          store.pinToWorkers({ logId, epoch: 1, affinity: 'host-1' }),
        ).rejects.toBeInstanceOf(OwnershipLostError)

        // The refused pin wrote nothing, so a host with no affinity can
        // acquire the log.
        await store.releaseOwnership({ logId, ownerId: 'b', epoch: 2 })
        expect(await store.acquireOwnership(claimOf(logId, 'c'))).toEqual({
          epoch: 3,
        })

        // Only an owner pins, so a log that no host acquired refuses a pin.
        const unowned = newLog()
        await store.markHostAlive({ hostId: 'host-1', ttlMs: LIVE_MS })
        await expect(
          store.pinToWorkers({
            logId: unowned,
            epoch: NO_OWNER_EPOCH,
            affinity: 'host-1',
          }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        expect(await store.acquireOwnership(claimOf(unowned, 'a'))).toEqual({
          epoch: 1,
        })
      })

      it('rejects a ttlMs that is not positive, or a negative wakeInMs', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        await expect(
          store.acquireOwnership({ ...claimOf(logId, 'a'), ttlMs: 0 }),
        ).rejects.toBeInstanceOf(RangeError)
        // The refused acquire took no epoch.
        expect(await store.acquireOwnership(claimOf(logId, 'a'))).toEqual({
          epoch: 1,
        })
        await expect(
          store.renewOwnership({ logId, ownerId: 'a', epoch: 1, ttlMs: -1 }),
        ).rejects.toBeInstanceOf(RangeError)
        await expect(
          store.releaseOwnership({
            logId,
            ownerId: 'a',
            epoch: 1,
            wakeInMs: -1,
          }),
        ).rejects.toBeInstanceOf(RangeError)
        await expect(
          store.markHostAlive({ hostId: 'host-1', ttlMs: 0 }),
        ).rejects.toBeInstanceOf(RangeError)
        // The refused release did not release the log.
        expect(await store.acquireOwnership(claimOf(logId, 'b'))).toBeNull()
      })

      it('lists nothing with limit 0', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.acquireOwnership({
          ...claimOf(logId, 'a'),
          harness: newHarness(),
        })
        await store.releaseOwnership({
          logId,
          ownerId: 'a',
          epoch: 1,
          wakeInMs: 0,
        })

        // The store has an orphan, so the empty list comes from the limit.
        expect(await store.listLogsWithoutOwner({ limit: 1 })).toHaveLength(1)
        expect(await store.listLogsWithoutOwner({ limit: 0 })).toEqual([])
      })
    })

    describe('log input lane', () => {
      const inputOf = (text: string) => ({ type: 'input', text })
      const offerOf = (logId: string, inputId: string, text = 'hi') => ({
        logId,
        harness: 'h',
        inputId,
        record: inputOf(text),
      })
      const pendingIds = async (store: LogStore, logId: string) =>
        (await store.listOfferedInputs({ logId })).map((input) => input.inputId)

      it('offers an input once and reports a duplicate with the same record', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        expect(await store.offerInput(offerOf(logId, 'i1'))).toBe('offered')
        expect(await store.offerInput(offerOf(logId, 'i1'))).toBe('duplicate')
        // The duplicate added no second offer.
        expect(await pendingIds(store, logId)).toEqual(['i1'])
      })

      it('reports a conflict for the same id with another record', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.offerInput(offerOf(logId, 'i1', 'first'))

        expect(await store.offerInput(offerOf(logId, 'i1', 'second'))).toBe(
          'conflict',
        )
        // The first record stays.
        expect(await store.listOfferedInputs({ logId })).toEqual([
          {
            inputId: 'i1',
            record: inputOf('first'),
            offeredAt: expect.any(Number),
          },
        ])
      })

      it('keeps offers apart per log', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')

        expect(await store.offerInput(offerOf(newLog(), 'i1'))).toBe('offered')
        expect(await store.offerInput(offerOf(newLog(), 'i1'))).toBe('offered')
      })

      it('lists pending offers in offer order', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        // The offer order is not the order of the ids, so a store that sorts
        // by id fails.
        await store.offerInput(offerOf(logId, 'i2', 'first'))
        await store.offerInput(offerOf(logId, 'i3', 'second'))
        await store.offerInput(offerOf(logId, 'i1', 'third'))

        expect(await store.listOfferedInputs({ logId })).toEqual([
          {
            inputId: 'i2',
            record: inputOf('first'),
            offeredAt: expect.any(Number),
          },
          {
            inputId: 'i3',
            record: inputOf('second'),
            offeredAt: expect.any(Number),
          },
          {
            inputId: 'i1',
            record: inputOf('third'),
            offeredAt: expect.any(Number),
          },
        ])
      })

      it('consumes offers in the same write as the records', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.offerInput(offerOf(logId, 'i1', 'one'))
        await store.offerInput(offerOf(logId, 'i2', 'two'))

        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [inputOf('one')],
          consumes: ['i1'],
        })

        expect(await pendingIds(store, logId)).toEqual(['i2'])
        expect(await store.read({ logId })).toEqual([
          { seq: 1, record: inputOf('one') },
        ])
        // The store keeps the consumed id, so a retry of the offer is a
        // duplicate, and a second consume of it is refused.
        expect(await store.offerInput(offerOf(logId, 'i1', 'one'))).toBe(
          'duplicate',
        )
        await expect(
          store.append({
            logId,
            seq: 2,
            epoch: NO_OWNER_EPOCH,
            records: [inputOf('one again')],
            consumes: ['i1'],
          }),
        ).rejects.toBeInstanceOf(TypeError)
        expect(await store.read({ logId, after: 1 })).toEqual([])
      })

      it('rejects consumes of an id that is not pending and writes nothing', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.offerInput(offerOf(logId, 'i1'))

        // The position check comes before the consumes check. A writer that
        // lost a race gets LogConflictError, also when the winner consumed
        // the same offers.
        await expect(
          store.append({
            logId,
            seq: 2,
            epoch: NO_OWNER_EPOCH,
            records: [inputOf('hi')],
            consumes: ['missing'],
          }),
        ).rejects.toBeInstanceOf(LogConflictError)
        await expect(
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: [inputOf('hi')],
            consumes: ['i1', 'missing'],
          }),
        ).rejects.toBeInstanceOf(TypeError)

        expect(await store.read({ logId })).toEqual([])
        // The batch also named a pending id. That offer is still pending.
        expect(await pendingIds(store, logId)).toEqual(['i1'])
      })

      it('writes nothing when a consuming batch cannot become JSON', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.offerInput(offerOf(logId, 'i1'))

        await expect(
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: [{ type: 'input', count: BigInt(1) }],
            consumes: ['i1'],
          }),
        ).rejects.toThrow()

        expect(await store.read({ logId })).toEqual([])
        expect(await pendingIds(store, logId)).toEqual(['i1'])
        // Position 1 and the offer are still free for a valid batch.
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'input', count: '1' }],
          consumes: ['i1'],
        })
        expect(await pendingIds(store, logId)).toEqual([])
      })

      it('rejects an offer that cannot become JSON and stores nothing', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()

        await expect(
          store.offerInput({
            ...offerOf(logId, 'i1'),
            record: { type: 'input', count: BigInt(1) },
          }),
        ).rejects.toThrow()

        expect(await store.listOfferedInputs({ logId })).toEqual([])
        // The refused offer did not take the id.
        expect(await store.offerInput(offerOf(logId, 'i1'))).toBe('offered')
      })

      it('lists a log with pending offers and no live owner as orphaned', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const harness = newHarness()
        const orphans = () =>
          store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] })
        // No host ever acquired the log.
        await store.offerInput({ ...offerOf(logId, 'i1'), harness })

        expect(await orphans()).toEqual([{ logId, harness, reason: 'offered' }])
        await store.acquireOwnership({
          logId,
          harness,
          ownerId: 'a',
          ttlMs: 10_000,
        })
        expect(await orphans()).toEqual([])
        // The owner leaves, and the offer is still pending. The wake is due
        // too, and 'offered' comes first.
        await store.releaseOwnership({
          logId,
          ownerId: 'a',
          epoch: 1,
          wakeInMs: 0,
        })
        expect(await orphans()).toEqual([{ logId, harness, reason: 'offered' }])

        // A pin stays after the owner releases the log.
        const pinned = newLog()
        const pinnedHarness = newHarness()
        await store.markHostAlive({ hostId: 'host-1', ttlMs: 10_000 })
        await store.acquireOwnership({
          logId: pinned,
          harness: pinnedHarness,
          ownerId: 'a',
          ttlMs: 10_000,
        })
        await store.pinToWorkers({
          logId: pinned,
          epoch: 1,
          affinity: 'host-1',
        })
        await store.releaseOwnership({ logId: pinned, ownerId: 'a', epoch: 1 })
        await store.offerInput({
          ...offerOf(pinned, 'i1'),
          harness: pinnedHarness,
        })
        expect(
          await store.listLogsWithoutOwner({
            limit: 10,
            harnesses: [pinnedHarness],
          }),
        ).toEqual([])
        expect(
          await store.listLogsWithoutOwner({
            limit: 10,
            harnesses: [pinnedHarness],
            affinity: 'host-1',
          }),
        ).toEqual([
          { logId: pinned, harness: pinnedHarness, reason: 'offered' },
        ])
      })

      it('keeps the harness of the owner or the first offer for a log', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const first = newHarness()
        const other = newHarness()
        const orphans = (harness: string) =>
          store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] })
        // A later offer that names another harness does not move the log.
        const offeredLog = newLog()
        await store.offerInput({ ...offerOf(offeredLog, 'i1'), harness: first })
        await store.offerInput({ ...offerOf(offeredLog, 'i2'), harness: other })
        expect(await orphans(first)).toEqual([
          { logId: offeredLog, harness: first, reason: 'offered' },
        ])
        expect(await orphans(other)).toEqual([])
        // The owner names the harness of a log that it released.
        const ownedLog = newLog()
        await store.acquireOwnership({
          logId: ownedLog,
          harness: first,
          ownerId: 'a',
          ttlMs: 10_000,
        })
        await store.releaseOwnership({
          logId: ownedLog,
          ownerId: 'a',
          epoch: 1,
        })
        await store.offerInput({ ...offerOf(ownedLog, 'i1'), harness: other })
        expect(await orphans(other)).toEqual([])
        expect(await orphans(first)).toContainEqual({
          logId: ownedLog,
          harness: first,
          reason: 'offered',
        })
      })

      it('notifies subscribers of a new offer', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const counter = countCalls(store, logId)

        await store.offerInput(offerOf(logId, 'i1'))
        await expect.poll(counter.calls).toBe(1)
        // A duplicate and a conflict change nothing, so they do not notify.
        await store.offerInput(offerOf(logId, 'i1'))
        await store.offerInput(offerOf(logId, 'i1', 'other'))

        await waitForLateCalls()
        expect(counter.calls()).toBe(1)
        counter.stop()
      })
    })

    describe('log snapshots and lifecycle', () => {
      const LIVE_MS = 10_000
      // The records r1, r2, and so on, for the positions 1 to `count`.
      const recordsOf = (count: number) =>
        Array.from({ length: count }, (_, index) => ({ type: `r${index + 1}` }))
      // Only an owner writes a snapshot or truncates. The first acquire of a
      // new log gives epoch 1.
      const EPOCH = 1
      // A new log that owner `a` acquired, with `count` records.
      const logWith = async (store: LogStore, count: number) => {
        const logId = newLog()
        await store.acquireOwnership({
          logId,
          harness: 'h',
          ownerId: 'a',
          ttlMs: LIVE_MS,
        })
        await store.append({
          logId,
          seq: 1,
          epoch: EPOCH,
          records: recordsOf(count),
        })
        return logId
      }
      const snapshotAt = (logId: string, seq: number) => ({
        logId,
        epoch: EPOCH,
        seq,
        version: 'v1',
        state: { upTo: seq, nested: { list: [seq] } },
      })
      // A log with 4 records and a snapshot at position 3.
      const logWithSnapshot = async (store: LogStore) => {
        const logId = await logWith(store, 4)
        await store.putSnapshot(snapshotAt(logId, 3))
        return logId
      }
      const seqsAfter = async (store: LogStore, logId: string, after: number) =>
        (await store.read({ logId, after })).map((entry) => entry.seq)

      it('stores the latest snapshot', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = await logWith(store, 2)

        expect(await store.getSnapshot({ logId })).toBeNull()
        await store.putSnapshot(snapshotAt(logId, 1))
        const latest = snapshotAt(logId, 2)
        await store.putSnapshot(latest)
        // The store keeps copies, so these changes do not change the snapshot.
        latest.state.nested.list.push(99)
        required(await store.getSnapshot({ logId }), 'the snapshot').seq = 7

        expect(await store.getSnapshot({ logId })).toEqual({
          seq: 2,
          version: 'v1',
          state: { upTo: 2, nested: { list: [2] } },
        })
      })

      it('fences putSnapshot and truncate', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const claim = { logId, harness: 'h', ttlMs: LIVE_MS }
        await store.acquireOwnership({ ...claim, ownerId: 'a' })
        await store.releaseOwnership({ logId, ownerId: 'a', epoch: 1 })
        await store.acquireOwnership({ ...claim, ownerId: 'b' })
        await store.append({ logId, seq: 1, epoch: 2, records: recordsOf(2) })
        await store.putSnapshot({ ...snapshotAt(logId, 1), epoch: 2 })

        // Owner `b` holds the log at epoch 2, so epoch 1 is stale.
        await expect(
          store.putSnapshot({ ...snapshotAt(logId, 2), epoch: 1 }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        await expect(
          store.truncate({ logId, epoch: 1, beforeSeq: 2 }),
        ).rejects.toBeInstanceOf(OwnershipLostError)

        // The refused calls changed nothing.
        expect(await store.getSnapshot({ logId })).toMatchObject({ seq: 1 })
        expect(await seqsAfter(store, logId, 0)).toEqual([1, 2])
      })

      it('refuses putSnapshot and truncate on a log that no host acquired', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: recordsOf(2),
        })

        await expect(
          store.putSnapshot({ ...snapshotAt(logId, 1), epoch: NO_OWNER_EPOCH }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        await expect(
          store.truncate({ logId, epoch: NO_OWNER_EPOCH, beforeSeq: 1 }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        expect(await store.getSnapshot({ logId })).toBeNull()
      })

      it('refuses a snapshot past the head', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = await logWith(store, 2)

        await expect(
          store.putSnapshot(snapshotAt(logId, 5)),
        ).rejects.toBeInstanceOf(RangeError)
        // Position 3 is the next free position, so it has no record yet.
        await expect(
          store.putSnapshot(snapshotAt(logId, 3)),
        ).rejects.toBeInstanceOf(RangeError)

        expect(await store.getSnapshot({ logId })).toBeNull()
      })

      it('refuses a snapshot before the truncation point', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = await logWithSnapshot(store)
        await store.truncate({ logId, epoch: EPOCH, beforeSeq: 4 })

        // The cut dropped positions 1 to 3, so a reader cannot replay from 1.
        await expect(
          store.putSnapshot(snapshotAt(logId, 1)),
        ).rejects.toBeInstanceOf(RangeError)
        expect(await store.getSnapshot({ logId })).toMatchObject({ seq: 3 })
        // Position 3 is the last dropped one, so the reader needs no dropped
        // record and the snapshot is accepted.
        await store.putSnapshot({ ...snapshotAt(logId, 3), version: 'v2' })
        expect(await store.getSnapshot({ logId })).toMatchObject({
          seq: 3,
          version: 'v2',
        })
      })

      it('truncates before a snapshot and keeps counting positions', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = await logWithSnapshot(store)

        await store.truncate({ logId, epoch: EPOCH, beforeSeq: 4 })

        expect(await store.read({ logId, after: 3 })).toEqual([
          { seq: 4, record: { type: 'r4' } },
        ])
        // The log keeps 1 record, and the next free position is still 5.
        await store.append({
          logId,
          seq: 5,
          epoch: EPOCH,
          records: [{ type: 'r5' }],
        })
        expect(await seqsAfter(store, logId, 3)).toEqual([4, 5])
      })

      it('signals a read before the truncation point', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = await logWithSnapshot(store)
        await store.truncate({ logId, epoch: EPOCH, beforeSeq: 4 })

        const read = store.read({ logId, after: 0 })
        await expect(read).rejects.toBeInstanceOf(LogTruncatedError)
        await expect(read).rejects.toMatchObject({ logId, firstSeq: 4 })
        // The truncate dropped position 3 too, so a read after 2 fails.
        await expect(store.read({ logId, after: 2 })).rejects.toBeInstanceOf(
          LogTruncatedError,
        )
      })

      it('refuses to truncate past the snapshot', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = await logWithSnapshot(store)
        // A log with no snapshot cannot drop records either.
        const bare = await logWith(store, 2)

        await expect(
          store.truncate({ logId, epoch: EPOCH, beforeSeq: 5 }),
        ).rejects.toBeInstanceOf(RangeError)
        await expect(
          store.truncate({ logId: bare, epoch: EPOCH, beforeSeq: 2 }),
        ).rejects.toBeInstanceOf(RangeError)

        // The refused cuts dropped nothing.
        expect(await seqsAfter(store, logId, 0)).toEqual([1, 2, 3, 4])
        expect(await seqsAfter(store, bare, 0)).toEqual([1, 2])
      })

      it('deletes a log and keeps its epoch counter', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const harness = newHarness()
        const claim = { logId, harness, ttlMs: LIVE_MS }
        const input = { logId, harness, inputId: 'i1', record: { type: 'in' } }
        await store.markHostAlive({ hostId: 'host-1', ttlMs: LIVE_MS })
        await store.acquireOwnership({ ...claim, ownerId: 'a' })
        await store.pinToWorkers({ logId, epoch: 1, affinity: 'host-1' })
        await store.append({ logId, seq: 1, epoch: 1, records: recordsOf(2) })
        await store.putSnapshot({ ...snapshotAt(logId, 1), epoch: 1 })
        await store.truncate({ logId, epoch: 1, beforeSeq: 2 })
        await store.offerInput(input)

        await store.deleteLog({ logId })

        // The truncation point is gone too, so a read from the start works.
        expect(await store.read({ logId })).toEqual([])
        expect(await store.listOfferedInputs({ logId })).toEqual([])
        expect(await store.getSnapshot({ logId })).toBeNull()
        // The log has no owner now. The old epoch and NO_OWNER_EPOCH stay
        // fenced.
        await expect(
          store.append({ logId, seq: 1, epoch: 1, records: recordsOf(1) }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        await expect(
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: recordsOf(1),
          }),
        ).rejects.toBeInstanceOf(OwnershipLostError)
        // The pin is gone, so a host with no affinity gets the next epoch.
        expect(
          await store.acquireOwnership({ ...claim, ownerId: 'b' }),
        ).toEqual({
          epoch: 2,
        })
        // The positions start at 1 again, and the input id is free again.
        await store.append({ logId, seq: 1, epoch: 2, records: recordsOf(1) })
        expect(await seqsAfter(store, logId, 0)).toEqual([1])
        expect(await store.offerInput(input)).toBe('offered')

        // The delete clears a due wake, so the log is not orphaned.
        const woken = newLog()
        const orphans = () =>
          store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] })
        await store.acquireOwnership({ ...claim, logId: woken, ownerId: 'a' })
        await store.releaseOwnership({
          logId: woken,
          ownerId: 'a',
          epoch: 1,
          wakeInMs: 0,
        })
        expect(await orphans()).toEqual([
          { logId: woken, harness, reason: 'wake' },
        ])
        await store.deleteLog({ logId: woken })
        expect(await orphans()).toEqual([])
      })

      it('notifies subscribers of a delete', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = await logWith(store, 1)
        const counter = countCalls(store, logId)

        await store.deleteLog({ logId })

        await expect.poll(counter.calls).toBe(1)
        counter.stop()
      })

      it('refuses a late offer to a deleted log until an acquire', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = await logWith(store, 1)
        const harness = newHarness()
        const input = {
          logId,
          harness,
          inputId: 'late',
          record: { type: 'in' },
        }
        await store.deleteLog({ logId })

        expect(await store.offerInput(input)).toBe('deleted')
        // The refused offer stored nothing, so no worker wakes for it.
        expect(await store.listOfferedInputs({ logId })).toEqual([])
        expect(
          await store.listLogsWithoutOwner({ limit: 10, harnesses: [harness] }),
        ).toEqual([])
        // An acquire opens the log again.
        await store.acquireOwnership({
          logId,
          harness,
          ownerId: 'b',
          ttlMs: LIVE_MS,
        })
        expect(await store.offerInput(input)).toBe('offered')
      })

      it('refuses a late NO_OWNER_EPOCH write to a deleted log until an acquire', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const logId = newLog()
        const writeAgain = (epoch: number) =>
          store.append({ logId, seq: 1, epoch, records: [{ type: 'again' }] })
        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: recordsOf(2),
        })

        await store.deleteLog({ logId })

        // A late writer must not bring the deleted log back.
        await expect(writeAgain(NO_OWNER_EPOCH)).rejects.toBeInstanceOf(
          OwnershipLostError,
        )
        expect(await store.read({ logId })).toEqual([])
        // An acquire opens the log again. The delete took no epoch, so the
        // first acquire still gets epoch 1.
        expect(
          await store.acquireOwnership({
            logId,
            harness: 'h',
            ownerId: 'a',
            ttlMs: LIVE_MS,
          }),
        ).toEqual({ epoch: 1 })
        await writeAgain(1)
        expect(await store.read({ logId })).toEqual([
          { seq: 1, record: { type: 'again' } },
        ])
      })
    })

    // Store A is `persistence.stores.log`. Store B is the log store of the
    // twin, on the same backend, as a second machine sees it.
    describe('log across instances', () => {
      const twinLog = async () => {
        const other = required(
          (await resolveTwin()).stores.log,
          'the log store of the twin',
        )
        // One instance passes every case here on its own.
        expect(other, 'the twin must have a new log store instance').not.toBe(
          persistence.stores.log,
        )
        return other
      }

      it('notifies a subscriber on the other instance', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const other = await twinLog()
        const logId = newLog()
        const counter = countCalls(other, logId)

        await store.append({
          logId,
          seq: 1,
          epoch: NO_OWNER_EPOCH,
          records: [{ type: 'from-a' }],
        })

        await expect.poll(counter.calls).toBe(1)
        counter.stop()
        // The listener on B can read the record that A wrote.
        expect(await other.read({ logId })).toEqual([
          { seq: 1, record: { type: 'from-a' } },
        ])
      })

      it('gives one owner across instances', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const other = await twinLog()
        const claim = { logId: newLog(), harness: 'h', ttlMs: 10_000 }

        expect(
          await store.acquireOwnership({ ...claim, ownerId: 'a' }),
        ).toEqual({
          epoch: 1,
        })
        expect(
          await other.acquireOwnership({ ...claim, ownerId: 'b' }),
        ).toBeNull()
      })

      it('deduplicates offers across instances', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const other = await twinLog()
        const input = {
          logId: newLog(),
          harness: 'h',
          inputId: 'i1',
          record: { type: 'input', text: 'hi' },
        }

        expect(await store.offerInput(input)).toBe('offered')
        expect(await other.offerInput(input)).toBe('duplicate')
      })

      it('keeps notifying after a listener throws', async (ctx) => {
        const store = persistence.stores.log
        if (!store) return ctx.skip('log store not provided')
        const other = await twinLog()
        const logId = newLog()
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
        ctx.onTestFinished(() => errors.mockRestore())
        const stopThrower = store.subscribe({
          logId,
          listener: () => {
            throw new Error('listener failed')
          },
        })
        const counter = countCalls(other, logId)

        await expect(
          store.append({
            logId,
            seq: 1,
            epoch: NO_OWNER_EPOCH,
            records: [{ type: 'one' }],
          }),
        ).resolves.toBeUndefined()

        await expect.poll(counter.calls).toBe(1)
        await expect.poll(() => errors.mock.calls.length).toBeGreaterThan(0)
        stopThrower()
        counter.stop()
      })
    })

    // The suite shares one persistence. Most cases write in a tenant of their
    // own, so a list has only the entries of the case. The cases about the
    // default tenant use new thread ids.
    describe('sessions', () => {
      const newId = () => `sessions-${crypto.randomUUID()}`
      const sessionEntry = (
        threadId: string,
        updatedAt: number,
        extra: Partial<SessionIndexEntry> = {},
      ) => ({ threadId, members: [], createdAt: 1, updatedAt, ...extra })
      /** A new tenant, with an entry and a key factory for it. */
      const newTenant = () => {
        const tenantId = newId()
        return {
          tenantId,
          entry: (
            threadId: string,
            updatedAt: number,
            extra: Partial<SessionIndexEntry> = {},
          ) => sessionEntry(threadId, updatedAt, { tenantId, ...extra }),
          key: (threadId: string) => ({ tenantId, threadId }),
        }
      }
      const threadIds = (page: SessionIndexPage) =>
        page.entries.map((entry) => entry.threadId)

      it('gets every field of an upserted entry, and undefined for an unknown thread', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, key } = newTenant()
        const written: SessionIndexEntry = {
          tenantId,
          threadId: 'thread',
          members: [
            { userId: 'user-1', role: 'owner' },
            { userId: 'user-2', role: 'viewer' },
          ],
          harness: 'coder',
          title: 'Fix the build',
          parentThreadId: 'parent',
          parentToolCallId: 'call-1',
          createdAt: 1,
          updatedAt: 2,
          pinned: true,
          usage: {
            turns: 2,
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
            cachedTokens: 4,
            cacheWriteTokens: 1,
            cost: 0.25,
          },
          metadata: { model: 'm-1' },
        }

        await store.upsert(written)

        expect(await store.get(key('thread'))).toEqual(written)
        expect(await store.get(key('unknown'))).toBeUndefined()
      })

      it('keeps the owner and the members in getVersioned and list', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry, key } = newTenant()
        const shared = entry('shared', 1, {
          members: [
            { userId: 'alice', role: 'owner' },
            { userId: 'bob', role: 'member' },
            { userId: 'carol', role: 'viewer' },
          ],
        })

        await store.upsert(shared)

        expect((await store.getVersioned(key('shared')))?.entry).toEqual(shared)
        expect((await store.list({ tenantId })).entries).toEqual([shared])
      })

      it('keeps one thread id in two tenants as two entries', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const threadId = newId()
        const tenantId = newId()
        const inTenant = sessionEntry(threadId, 10, { tenantId, title: 'a' })
        const inDefault = sessionEntry(threadId, 20, { title: 'b' })

        await store.upsert(inTenant)
        await store.upsert(inDefault)

        expect(await store.get({ tenantId, threadId })).toEqual(inTenant)
        expect(await store.get({ threadId })).toEqual(inDefault)
        expect((await store.list({ tenantId })).entries).toEqual([inTenant])

        await store.delete({ tenantId, threadId })

        expect(await store.get({ tenantId, threadId })).toBeUndefined()
        expect(await store.get({ threadId })).toEqual(inDefault)
      })

      it('lists only the default tenant without tenantId', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const id = newId()
        await store.upsert(sessionEntry(`${id}-tenant`, 10, { tenantId: id }))
        await store.upsert(sessionEntry(`${id}-default`, 10))

        const page = await store.list()

        expect(threadIds(page)).toContain(`${id}-default`)
        // `''` is the default tenant too.
        const otherTenants = page.entries.filter(
          (entry) => (entry.tenantId ?? '') !== '',
        )
        expect(otherTenants).toEqual([])
      })

      it('replaces the whole entry on a second upsert', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry, key } = newTenant()
        await store.upsert(entry('thread', 2, { title: 'old', pinned: true }))

        await store.upsert(entry('thread', 3, { title: 'new' }))

        // `pinned` is gone: upsert does not merge.
        expect(await store.get(key('thread'))).toEqual({
          tenantId,
          threadId: 'thread',
          members: [],
          createdAt: 1,
          updatedAt: 3,
          title: 'new',
        })
      })

      it('lists newest first and pages with a cursor', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        await store.upsert(entry('c', 20))
        await store.upsert(entry('a', 30))
        await store.upsert(entry('b', 20))

        // Newest first. The same `updatedAt` goes in `threadId` order.
        expect(threadIds(await store.list({ tenantId }))).toEqual([
          'a',
          'b',
          'c',
        ])

        const first = await store.list({ tenantId, limit: 2 })
        expect(threadIds(first)).toEqual(['a', 'b'])
        expect(first.truncated).toBe(true)

        const second = await store.list({
          tenantId,
          limit: 2,
          cursor: required(first.cursor, 'the cursor of a truncated page'),
        })
        expect(threadIds(second)).toEqual(['c'])
        expect(second.truncated).toBeFalsy()
        expect(second.cursor).toBeUndefined()
      })

      it('filters by parent thread', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        await store.upsert(entry('parent', 10))
        await store.upsert(
          entry('child', 20, {
            parentThreadId: 'parent',
            parentToolCallId: 'call-1',
          }),
        )
        await store.upsert(entry('sibling', 30, { parentThreadId: 'parent' }))
        await store.upsert(entry('other', 40, { parentThreadId: 'other' }))

        expect(
          threadIds(await store.list({ tenantId, parentThreadId: 'parent' })),
        ).toEqual(['sibling', 'child'])
      })

      it('lists only the entries with no parent for parentThreadId null', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        await store.upsert(entry('parent', 10))
        await store.upsert(entry('child', 20, { parentThreadId: 'parent' }))

        expect(
          threadIds(await store.list({ tenantId, parentThreadId: null })),
        ).toEqual(['parent'])
      })

      it('filters by member id, with any role', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        const bob = { userId: 'bob', role: 'owner' } as const
        await store.upsert(
          entry('owned', 10, {
            members: [{ userId: 'alice', role: 'owner' }],
          }),
        )
        await store.upsert(
          entry('member', 20, {
            members: [bob, { userId: 'alice', role: 'member' }],
          }),
        )
        await store.upsert(
          entry('viewer', 30, {
            members: [bob, { userId: 'alice', role: 'viewer' }],
          }),
        )
        await store.upsert(entry('other', 40, { members: [bob] }))
        // A subagent child has no members.
        await store.upsert(entry('child', 50, { parentThreadId: 'owned' }))

        expect(
          threadIds(await store.list({ tenantId, memberId: 'alice' })),
        ).toEqual(['viewer', 'member', 'owned'])
      })

      it('filters by title search, without case', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        await store.upsert(entry('build', 10, { title: 'Fix the Build' }))
        await store.upsert(entry('docs', 20, { title: 'Write docs' }))
        await store.upsert(entry('untitled', 30))

        expect(
          threadIds(await store.list({ tenantId, search: 'BUILD' })),
        ).toEqual(['build'])
        // An entry with no title never matches.
        expect(threadIds(await store.list({ tenantId, search: '' }))).toEqual([
          'docs',
          'build',
        ])
      })

      it('filters by harness name', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        await store.upsert(entry('coder', 10, { harness: 'coder' }))
        await store.upsert(entry('writer', 20, { harness: 'writer' }))
        await store.upsert(entry('none', 30))

        expect(
          threadIds(await store.list({ tenantId, harness: 'coder' })),
        ).toEqual(['coder'])
      })

      it('filters by exact metadata values', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        await store.upsert(
          entry('both', 10, { metadata: { project: 'p-1', branch: 'main' } }),
        )
        await store.upsert(
          entry('project-only', 20, { metadata: { project: 'p-1' } }),
        )
        await store.upsert(
          entry('other', 30, { metadata: { project: 'p-2', branch: 'main' } }),
        )
        await store.upsert(entry('none', 40))

        expect(
          threadIds(
            await store.list({ tenantId, metadata: { project: 'p-1' } }),
          ),
        ).toEqual(['project-only', 'both'])
        expect(
          threadIds(
            await store.list({
              tenantId,
              metadata: { project: 'p-1', branch: 'main' },
            }),
          ),
        ).toEqual(['both'])
      })

      it('combines search, harness, and metadata with AND', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        const base = {
          title: 'Fix the build',
          harness: 'coder',
          metadata: { project: 'p-1' },
        }
        await store.upsert(entry('match', 10, base))
        await store.upsert(
          entry('wrong-title', 20, { ...base, title: 'Write docs' }),
        )
        await store.upsert(
          entry('wrong-harness', 30, { ...base, harness: 'writer' }),
        )
        await store.upsert(
          entry('wrong-project', 40, {
            ...base,
            metadata: { project: 'p-2' },
          }),
        )

        expect(
          threadIds(
            await store.list({
              tenantId,
              search: 'build',
              harness: 'coder',
              metadata: { project: 'p-1' },
            }),
          ),
        ).toEqual(['match'])
      })

      it('pages the filtered list with a cursor', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry } = newTenant()
        await store.upsert(entry('a', 50, { title: 'build a' }))
        await store.upsert(entry('skip', 40, { title: 'docs' }))
        await store.upsert(entry('b', 30, { title: 'build b' }))
        await store.upsert(entry('c', 20, { title: 'build c' }))

        const first = await store.list({ tenantId, search: 'build', limit: 2 })
        expect(threadIds(first)).toEqual(['a', 'b'])
        expect(first.truncated).toBe(true)

        const second = await store.list({
          tenantId,
          search: 'build',
          limit: 2,
          cursor: required(first.cursor, 'the cursor of a truncated page'),
        })
        expect(threadIds(second)).toEqual(['c'])
        expect(second.truncated).toBeFalsy()
      })

      it('deletes an entry for good, and ignores an unknown thread', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { tenantId, entry, key } = newTenant()
        await store.upsert(entry('kept', 1))
        await store.upsert(entry('removed', 2, { title: 'old' }))

        await store.delete(key('removed'))
        await store.delete(key('unknown'))

        expect(await store.get(key('removed'))).toBeUndefined()
        expect(await store.getVersioned(key('removed'))).toBeUndefined()
        expect(threadIds(await store.list({ tenantId }))).toEqual(['kept'])
        // Nothing of the old entry is left, so "only when absent" writes.
        const recreated = await store.upsertIf({
          entry: entry('removed', 3),
          revision: null,
        })
        expect(recreated.ok).toBe(true)
        expect(await store.get(key('removed'))).toEqual(entry('removed', 3))
      })

      it('writes with upsertIf only at the expected revision', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { entry, key } = newTenant()
        expect(await store.getVersioned(key('thread'))).toBeUndefined()

        // `null`: only when absent.
        const created = await store.upsertIf({
          entry: entry('thread', 1),
          revision: null,
        })
        if (!created.ok) throw new Error('the first upsertIf conflicted')
        expect(
          await store.upsertIf({ entry: entry('thread', 9), revision: null }),
        ).toEqual({ ok: false, reason: 'conflict' })
        expect(await store.getVersioned(key('thread'))).toEqual({
          entry: entry('thread', 1),
          revision: created.revision,
        })

        const changed = await store.upsertIf({
          entry: entry('thread', 2, { title: 'new' }),
          revision: created.revision,
        })
        if (!changed.ok)
          throw new Error('upsertIf at the read revision conflicted')
        expect(changed.revision).not.toBe(created.revision)

        // A stale revision conflicts and leaves the entry as it was.
        expect(
          await store.upsertIf({
            entry: entry('thread', 3),
            revision: created.revision,
          }),
        ).toEqual({ ok: false, reason: 'conflict' })
        expect(await store.get(key('thread'))).toEqual(
          entry('thread', 2, { title: 'new' }),
        )
      })

      it('changes the revision on a plain upsert, and never reuses one after delete', async (ctx) => {
        const store = persistence.stores.sessions
        if (!store) return ctx.skip('sessions store not provided')
        const { entry, key } = newTenant()
        await store.upsert(entry('thread', 1))
        const read = required(
          await store.getVersioned(key('thread')),
          'the versioned entry',
        )

        await store.upsert(entry('thread', 2))

        expect(
          await store.upsertIf({
            entry: entry('thread', 3),
            revision: read.revision,
          }),
        ).toEqual({ ok: false, reason: 'conflict' })
        expect((await store.get(key('thread')))?.updatedAt).toBe(2)

        // A deleted revision does not match the entry written after it.
        const last = required(
          await store.getVersioned(key('thread')),
          'the versioned entry',
        )
        await store.delete(key('thread'))
        expect(
          await store.upsertIf({
            entry: entry('thread', 4),
            revision: last.revision,
          }),
        ).toEqual({ ok: false, reason: 'conflict' })
        expect(await store.get(key('thread'))).toBeUndefined()
        const recreated = await store.upsertIf({
          entry: entry('thread', 5),
          revision: null,
        })
        if (!recreated.ok) throw new Error('upsertIf after delete conflicted')
        expect(recreated.revision).not.toBe(last.revision)
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

      // Compare-and-set is opt-in. A store without it skips this case.
      it('setIf writes only when the revision matches', async (ctx) => {
        const store = resolveStore('metadata')
        if (!store?.setIf || !store.getVersioned) {
          return ctx.skip('metadata setIf not provided')
        }
        expect(await store.getVersioned('cas', 'k')).toBeNull()
        expect(await store.setIf('cas', 'absent', { n: 0 }, 'no-such')).toEqual(
          {
            ok: false,
            reason: 'conflict',
          },
        )
        expect(await store.get('cas', 'absent')).toBeNull()

        const created = await store.setIf('cas', 'k', { n: 1 }, null)
        expect(created.ok).toBe(true)
        if (!created.ok) return
        expect((await store.getVersioned('cas', 'k'))?.revision).toBe(
          created.revision,
        )
        expect(await store.setIf('cas', 'k', { n: 9 }, null)).toEqual({
          ok: false,
          reason: 'conflict',
        })
        const current = await store.getVersioned('cas', 'k')
        expect(current?.value).toEqual({ n: 1 })
        const revision = current?.revision ?? null
        const updated = await store.setIf('cas', 'k', { n: 2 }, revision)
        expect(updated.ok).toBe(true)
        if (!updated.ok) return
        expect((await store.getVersioned('cas', 'k'))?.revision).toBe(
          updated.revision,
        )
        expect(await store.setIf('cas', 'k', { n: 3 }, revision)).toEqual({
          ok: false,
          reason: 'conflict',
        })
        expect(await store.get('cas', 'k')).toEqual({ n: 2 })

        // A plain `set` also moves the revision.
        const before = await store.getVersioned('cas', 'k')
        await store.set('cas', 'k', { n: 4 })
        const stale = before?.revision ?? null
        expect((await store.setIf('cas', 'k', { n: 5 }, stale)).ok).toBe(false)
        expect(await store.get('cas', 'k')).toEqual({ n: 4 })

        // A deleted revision is not reused, and it does not recreate the key.
        const last = await store.getVersioned('cas', 'k')
        const old = last?.revision ?? null
        await store.delete('cas', 'k')
        expect(await store.getVersioned('cas', 'k')).toBeNull()
        expect(await store.setIf('cas', 'k', { n: 7 }, old)).toEqual({
          ok: false,
          reason: 'conflict',
        })
        expect(await store.get('cas', 'k')).toBeNull()
        const recreated = await store.setIf('cas', 'k', { n: 6 }, null)
        expect(recreated.ok).toBe(true)
        if (!recreated.ok) return
        expect(recreated.revision).not.toBe(old)
        expect(await store.get('cas', 'k')).toEqual({ n: 6 })
      })
    })
  })
}
