import { describe, expect, it } from 'vitest'
import type { RunStore } from '@tanstack/ai'

/** Factory for the store under test. A fresh one per case keeps them isolated. */
export type MakeRunStore = () => RunStore | Promise<RunStore>

async function expectFreshDurableFieldsUndefined(
  store: RunStore,
): Promise<void> {
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
  await store.update('fc-1', { detachedSince: undefined })
  const afterClear = await store.get('fc-1')
  expect(afterClear?.detachedSince).toBeUndefined()
  // Clearing detachedSince must not clobber the other durable fields.
  expect(afterClear?.sandboxKey).toBe('sandbox-abc')
  expect(afterClear?.cancelRequested).toBe(true)
  expect(afterClear?.driverEpoch).toBe(2)
}

async function expectExplicitCancelFalse(store: RunStore): Promise<void> {
  await store.update('fc-1', { cancelRequested: false })
  const afterExplicitFalse = await store.get('fc-1')
  expect(afterExplicitFalse?.cancelRequested).toBe(false)
  expect(afterExplicitFalse?.cancelRequested).not.toBeUndefined()
}

async function expectFullDurableFieldClear(store: RunStore): Promise<void> {
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
  })
}
