import { describe, expect, it } from 'vitest'
import {
  InMemoryRunStore,
  defineRunStore,
  isRunStatus,
  isTerminalRunStatus,
} from '../src/index'
import type {
  RunError,
  RunRecord,
  RunStore,
  RunStatus,
  TerminalRunStatus,
} from '../src/index'

/**
 * Keys that exist on every object through `Object.prototype`, so a
 * prototype-chain `in` check answers `true` for each of them.
 *
 * `__proto__` is included deliberately: `JSON.parse` installs it as an OWN data
 * property (unlike an object literal, where it would set the prototype), which is
 * precisely how it reaches a store row.
 */
const PROTOTYPE_KEYS = [
  'toString',
  'constructor',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  '__proto__',
]

/**
 * A row as a user-implemented `RunStore` actually produces one.
 *
 * `JSON.parse` is `any`, and widening its result to `RunRecord` with no
 * validation is exactly what a real backend's deserializer does — JSON out of
 * D1, a Durable Object, or Postgres. Nothing in the type system checks what the
 * `status` column held, so reproducing that unsoundness here (rather than
 * casting around it) is what makes these fixtures faithful to the boundary the
 * guards below exist to defend.
 */
function rowFromJson(status: string): RunRecord {
  const record: RunRecord = JSON.parse(
    JSON.stringify({ runId: 'r1', threadId: 't1', startedAt: 1, status }),
  )
  return record
}

describe('isTerminalRunStatus', () => {
  it('treats completed/failed/aborted as terminal and running/interrupted as not', () => {
    expect(isTerminalRunStatus('completed')).toBe(true)
    expect(isTerminalRunStatus('failed')).toBe(true)
    expect(isTerminalRunStatus('aborted')).toBe(true)
    expect(isTerminalRunStatus('running')).toBe(false)
    // `interrupted` is a human-in-the-loop pause, NOT a terminal state.
    expect(isTerminalRunStatus('interrupted')).toBe(false)
  })

  it('narrows to TerminalRunStatus inside the guard', () => {
    // The assignment below is the assertion: it only compiles if the predicate
    // narrows `RunStatus` to `TerminalRunStatus`. A `boolean` return would make
    // this a type error. Do not replace it with a runtime-only check.
    const status: RunStatus = 'failed'
    let terminal: TerminalRunStatus | undefined
    if (isTerminalRunStatus(status)) {
      terminal = status
    }
    expect(terminal).toBe('failed')
  })

  // A malformed row is not hypothetical: EVERY value that reaches this guard
  // comes off a user-implemented `RunStore`, and nothing validates it there. A
  // `status` of `'toString'` inherits from `Object.prototype`, so a
  // prototype-chain `in` check answers `true` for it — and a false `true` here
  // is DESTRUCTIVE: `@tanstack/ai-sandbox`'s journal sweep DELETES the journal
  // of a run it believes terminal, making a LIVE run unresumable with no undo.
  // `attach-preflight` fails the attach as `'terminal-run'`, and core's resume
  // driver refuses to drive the run. Hence `Object.hasOwn`, never `in`.
  it('is not fooled by an Object.prototype key on a malformed store row', () => {
    for (const key of PROTOTYPE_KEYS) {
      expect(isTerminalRunStatus(rowFromJson(key).status)).toBe(false)
    }
  })
})

describe('isRunStatus', () => {
  it('accepts every RunStatus', () => {
    // Keyed by the union, so a new member is a compile error here until it is
    // added — the same exhaustiveness trick the implementation uses.
    const all: Record<RunStatus, true> = {
      running: true,
      interrupted: true,
      completed: true,
      failed: true,
      aborted: true,
    }
    for (const status of Object.keys(all)) {
      expect(isRunStatus(status)).toBe(true)
    }
  })

  it('rejects Object.prototype keys and non-strings alike', () => {
    for (const key of PROTOTYPE_KEYS) {
      expect(isRunStatus(key)).toBe(false)
    }
    for (const value of [undefined, null, 0, 1, true, {}, [], 'RUNNING', '']) {
      expect(isRunStatus(value)).toBe(false)
    }
  })

  it('narrows unknown to RunStatus, so a backend can validate a row', () => {
    // The assignment is the assertion: it only compiles if the predicate narrows
    // `unknown` to `RunStatus`. This is the boundary use — a deserializer
    // checking a JSON column before handing the record on.
    const fromColumn: unknown = 'interrupted'
    let status: RunStatus | undefined
    if (isRunStatus(fromColumn)) status = fromColumn
    expect(status).toBe('interrupted')
  })
})

describe('RunError', () => {
  it('carries a branchable code alongside the provider message', async () => {
    const store = new InMemoryRunStore()
    await store.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 })

    const error: RunError = {
      message: 'the model refused the request',
      code: 'content_filter',
    }
    await store.update('r1', { status: 'failed', finishedAt: 2, error })

    const got = await store.get('r1')
    expect(got?.error).toEqual(error)
    // `code` is what a consumer switches over; the message is provider prose.
    expect(got?.error?.code).toBe('content_filter')

    // `code` is optional: a provider that supplies no classification still
    // produces a valid record.
    await store.update('r1', { error: { message: 'boom' } })
    expect((await store.get('r1'))?.error).toEqual({ message: 'boom' })
  })
})

describe('defineRunStore', () => {
  it('preserves the implementation type so optional methods stay known-present', async () => {
    const store = defineRunStore({
      createOrResume: (input) =>
        Promise.resolve({
          runId: input.runId,
          threadId: input.threadId,
          startedAt: input.startedAt,
          status: input.status ?? 'running',
        } satisfies RunRecord),
      update: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      findActiveRun: (_threadId: string) =>
        Promise.resolve<RunRecord | null>(null),
    })

    // The assertion is that this compiles WITHOUT `?.` or a feature-detect
    // guard: `defineRunStore` must return the argument's own type, not the
    // `RunStore` interface (on which `findActiveRun` is optional). If the
    // signature regresses to `(store: RunStore): RunStore`, this line errors.
    expect(await store.findActiveRun('t1')).toBeNull()

    // Still assignable to the interface it implements.
    const asInterface: RunStore = store
    expect(typeof asInterface.createOrResume).toBe('function')
  })
})

describe('InMemoryRunStore', () => {
  it('createOrResume is idempotent and does not mutate an existing record', async () => {
    const store = new InMemoryRunStore()
    const first = await store.createOrResume({
      runId: 'r1',
      threadId: 't1',
      startedAt: 100,
    })
    expect(first.status).toBe('running')

    const second = await store.createOrResume({
      runId: 'r1',
      threadId: 't1',
      startedAt: 999,
      status: 'completed',
    })
    expect(second.startedAt).toBe(100)
    expect(second.status).toBe('running')
  })

  it('update patches mutable fields and no-ops for an unknown run', async () => {
    const store = new InMemoryRunStore()
    await store.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 })
    await store.update('r1', { status: 'completed', finishedAt: 2 })
    const got = await store.get('r1')
    expect(got?.status).toBe('completed')
    expect(got?.finishedAt).toBe(2)

    await expect(
      store.update('nope', { status: 'failed' }),
    ).resolves.toBeUndefined()
    expect(await store.get('nope')).toBeNull()
  })

  it('lists runs by thread in start order', async () => {
    const store = new InMemoryRunStore()
    await store.createOrResume({ runId: 'a', threadId: 't1', startedAt: 2 })
    await store.createOrResume({ runId: 'b', threadId: 't1', startedAt: 1 })
    await store.createOrResume({ runId: 'c', threadId: 't2', startedAt: 3 })
    const listed = await store.listByThread('t1')
    expect(listed.map((r) => r.runId)).toEqual(['b', 'a'])
  })

  // `listReclaimable` must surface only runs where ALL THREE hold:
  // `status === 'running'`, `detachedSince` is set, and
  // `detachedSince <= now - ttlMs` (INCLUSIVE cutoff). Each fixture below pins
  // exactly one of those conditions, mirroring the shared conformance suite in
  // `packages/ai-persistence/src/testkit/conformance.ts`. Do NOT weaken this
  // case — collapsing the fixtures, dropping the boundary run, or swapping the
  // exact-set assertion for `toContain` is precisely the gap this case was
  // written to close (the previous version passed even with the `status`
  // check deleted and with `<=` flipped to `<`).
  it('lists reclaimable runs: running, detached, at or past the ttl cutoff', async () => {
    const store = new InMemoryRunStore()
    const now = 10_000
    const ttlMs = 5_000
    const cutoff = now - ttlMs // 5_000

    // Included: running, detached well before the cutoff.
    await store.createOrResume({
      runId: 'included',
      threadId: 't1',
      startedAt: 1,
    })
    await store.update('included', { detachedSince: 1_000 })

    // Included, BOUNDARY: detachedSince exactly equals the cutoff. Pins the
    // inclusive `<=` — a strict `<` wrongly excludes this run.
    await store.createOrResume({
      runId: 'boundary',
      threadId: 't1',
      startedAt: 1,
    })
    await store.update('boundary', { detachedSince: cutoff })

    // Excluded: detached one ms too recently. Pins the comparison itself — an
    // implementation returning every detached run would include this.
    await store.createOrResume({
      runId: 'too-recent',
      threadId: 't1',
      startedAt: 1,
    })
    await store.update('too-recent', { detachedSince: cutoff + 1 })

    // Excluded: detached long ago, but already terminal. Pins the
    // `status === 'running'` check — dropping it would include this.
    await store.createOrResume({
      runId: 'terminal-detached',
      threadId: 't1',
      startedAt: 1,
    })
    await store.update('terminal-detached', {
      detachedSince: 1_000,
      status: 'completed',
      finishedAt: 2_000,
    })

    // Excluded: running, but never detached. Pins the
    // `detachedSince !== undefined` check — treating a missing value as 0 (or
    // as "always reclaimable") would include this.
    await store.createOrResume({
      runId: 'never-detached',
      threadId: 't1',
      startedAt: 1,
    })

    const reclaimable = await store.listReclaimable({ now, ttlMs })
    // Ordering is not part of the contract, so sort and compare exact sets.
    expect(reclaimable.map((r) => r.runId).sort()).toEqual([
      'boundary',
      'included',
    ])
  })

  it('findActiveRun returns the newest running run for the thread only', async () => {
    const store = new InMemoryRunStore()
    await store.createOrResume({ runId: 'old', threadId: 't1', startedAt: 1 })
    await store.createOrResume({ runId: 'new', threadId: 't1', startedAt: 5 })
    await store.createOrResume({ runId: 'other', threadId: 't2', startedAt: 9 })

    // Highest `startedAt` among the thread's running runs wins — and a run on a
    // different thread never leaks in, even when it started later.
    expect((await store.findActiveRun('t1'))?.runId).toBe('new')
    expect((await store.findActiveRun('t2'))?.runId).toBe('other')

    // No running run for the thread → null (terminal and unknown threads alike).
    await store.update('old', { status: 'completed' })
    await store.update('new', { status: 'aborted' })
    expect(await store.findActiveRun('t1')).toBeNull()
    expect(await store.findActiveRun('nope')).toBeNull()
  })
})
