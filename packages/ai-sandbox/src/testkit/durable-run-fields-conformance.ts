/**
 * Conformance for the DURABLE-RUN fields on a `RunStore`.
 *
 * These four fields (`sandboxKey`, `detachedSince`, `cancelRequested`,
 * `driverEpoch`) exist for durable sandboxed runs: detach on disconnect, takeover
 * by a later host, and the reaper. A chat-only app never writes them, so proving
 * them is NOT part of `runPersistenceConformance` in `@tanstack/ai-persistence`.
 * They live here, next to the takeover and reaper suites that depend on them.
 *
 * Run this when your app wires `withSandbox(sandbox, { runs, durability })`. The
 * fields round-trip through the REQUIRED `update`/`get` pair, so a backend can
 * pass every persistence case while silently dropping one of them, and the
 * failure then shows up as a run that looks permanently detached or a takeover
 * that cannot fence a superseded host.
 *
 * ```ts
 * import { runDurableRunFieldsConformance } from '@tanstack/ai-sandbox/testkit'
 * import { myPersistence } from './persistence'
 *
 * runDurableRunFieldsConformance('my postgres runs', () => myPersistence().stores.runs)
 * ```
 */
import { describe, expect, it } from 'vitest'
import type { RunStore } from '@tanstack/ai'

/** Factory for the store under test. A fresh one per case keeps them isolated. */
export type MakeRunStore = () => RunStore | Promise<RunStore>

async function expectFreshDurableFieldsUndefined(
  store: RunStore,
): Promise<void> {
  // A fresh run that was never patched with these fields must read
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
}

async function expectDurableFieldsRoundTrip(store: RunStore): Promise<void> {
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
}

async function expectDriverEpochOverwrite(store: RunStore): Promise<void> {
  // A monotonic driverEpoch bump overwrites, it is not ignored (a
  // takeover host bumping the fencing token must actually stick).
  await store.update('fc-1', { driverEpoch: 2 })
  const afterEpochBump = await store.get('fc-1')
  expect(afterEpochBump?.driverEpoch).toBe(2)
  // Sibling fields untouched by an update that only names driverEpoch.
  expect(afterEpochBump?.sandboxKey).toBe('sandbox-abc')
  expect(afterEpochBump?.cancelRequested).toBe(true)
}

async function expectDetachedSinceClear(store: RunStore): Promise<void> {
  // update({ detachedSince: undefined }) actually CLEARS the field.
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
}

async function expectExplicitCancelFalse(store: RunStore): Promise<void> {
  // cancelRequested: false written EXPLICITLY must round-trip as
  // `false`, distinct from the fresh-run `undefined` checked in step 0.
  // A backend storing this boolean in an integer/NULL-able column has
  // to preserve the false/undefined distinction in both directions,
  // not just collapse both to falsy.
  await store.update('fc-1', { cancelRequested: false })
  const afterExplicitFalse = await store.get('fc-1')
  expect(afterExplicitFalse?.cancelRequested).toBe(false)
  expect(afterExplicitFalse?.cancelRequested).not.toBeUndefined()
}

async function expectFullDurableFieldClear(store: RunStore): Promise<void> {
  // An explicit `undefined` clears EVERY durable field, not just
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
}

export function runDurableRunFieldsConformance(
  name: string,
  makeStore: MakeRunStore,
): void {
  describe(`durable run fields conformance: ${name}`, () => {
    // One case, because the four fields share one failure mode: a backend that
    // filters `undefined` out of its `SET` clause, or coerces an absent column to
    // a falsy default, passes every other assertion while breaking detach and
    // takeover. Splitting it per field would hide that they must all behave the
    // same way through one `update`.
    it('round-trips the durable run fields, overwrites driverEpoch, and clears every one of them on explicit undefined', async () => {
      const store = await makeStore()

      await store.createOrResume({
        runId: 'fc-1',
        threadId: 'fc-t',
        startedAt: 1,
      })

      await expectFreshDurableFieldsUndefined(store)
      await expectDurableFieldsRoundTrip(store)
      await expectDriverEpochOverwrite(store)
      await expectDetachedSinceClear(store)
      await expectExplicitCancelFalse(store)
      await expectFullDurableFieldClear(store)
    })

    // `findActiveRun` is REQUIRED on the RunStore contract — every backend that
    // provides a `runs` store must satisfy these invariants (most-recent-running
    // wins, thread-scoped, null when idle). Reconnect is built on it, and a
    // backend that always answers `null` disables reconnect indistinguishably
    // from one that is merely idle, so this must never degrade to a skip.
  })
}
