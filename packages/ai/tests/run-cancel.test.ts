import { describe, expect, it } from 'vitest'
import {
  DetachableRunCapability,
  InMemoryRunStore,
  RUN_CANCEL_REASON,
  RunDetachedCapability,
  getDetachableRun,
  isCancelRequestedReason,
  isTerminalRunStatus,
  provideDetachableRun,
  provideRunDetached,
  requestRunCancel,
  wasCancelRequested,
} from '../src/index'
import { CapabilityRegistry } from '../src/activities/chat/middleware/capabilities'
import type { RunStatus, RunStore, TerminalRunStatus } from '../src/index'

/** Unique per execution, so no test can observe another's record. */
const runId = (): string => `r-${crypto.randomUUID()}`

async function seeded(): Promise<{ runs: InMemoryRunStore; id: string }> {
  const runs = new InMemoryRunStore()
  const id = runId()
  await runs.createOrResume({ runId: id, threadId: 't1', startedAt: 1 })
  return { runs, id }
}

describe('RUN_CANCEL_REASON', () => {
  it('is a namespaced sentinel a caller cannot collide with by accident', () => {
    expect(RUN_CANCEL_REASON).toBe('tanstack-ai:cancel-requested')
  })

  it('recognizes only the exact sentinel', () => {
    expect(isCancelRequestedReason(RUN_CANCEL_REASON)).toBe(true)
    expect(isCancelRequestedReason('cancel-requested')).toBe(false)
    expect(isCancelRequestedReason('user aborted')).toBe(false)
    expect(isCancelRequestedReason('')).toBe(false)
    expect(isCancelRequestedReason(undefined)).toBe(false)
  })

  it('does NOT match a reason that merely contains the sentinel', () => {
    // A substring match would let an arbitrary provider error string be read as
    // an explicit cancel, which is exactly the intent-inference the design bans.
    expect(isCancelRequestedReason(`prefix ${RUN_CANCEL_REASON}`)).toBe(false)
    expect(isCancelRequestedReason(`${RUN_CANCEL_REASON} suffix`)).toBe(false)
    expect(
      isCancelRequestedReason(
        `fetch failed: upstream said "${RUN_CANCEL_REASON}"`,
      ),
    ).toBe(false)
  })

  it('does NOT match a near-miss that differs only in case or separator', () => {
    expect(isCancelRequestedReason('tanstack-ai:cancel_requested')).toBe(false)
    expect(isCancelRequestedReason('TanStack-AI:Cancel-Requested')).toBe(false)
    expect(isCancelRequestedReason('tanstack-ai:cancel-requeste')).toBe(false)
  })
})

describe('requestRunCancel / wasCancelRequested', () => {
  it('sets cancelRequested on an existing record and reads it back', async () => {
    const { runs, id } = await seeded()
    expect(await wasCancelRequested(runs, id)).toBe(false)
    await requestRunCancel(runs, id)
    expect(await wasCancelRequested(runs, id)).toBe(true)
    expect((await runs.get(id))?.status).toBe('running')
  })

  it('leaves the status alone — cancelling is a REQUEST, not a transition', async () => {
    // The driver is what terminalizes the run; a cancel route only records
    // intent, because the driver may live on another host.
    const { runs, id } = await seeded()
    await requestRunCancel(runs, id)
    const record = await runs.get(id)
    expect(record?.status).toBe('running')
    expect(record?.finishedAt).toBeUndefined()
  })

  it('patches cancelRequested and NOTHING else', async () => {
    // Asserted on the patch itself, not just the resulting record: a status
    // write here would tell every reader the run is over while the agent is
    // still burning tokens.
    const patches: Array<Record<string, unknown>> = []
    const runs: RunStore = {
      createOrResume: () => Promise.reject(new Error('unused')),
      update: (_runId, patch) => {
        patches.push({ ...patch })
        return Promise.resolve()
      },
      get: () => Promise.resolve(null),
    }
    await requestRunCancel(runs, 'r1')
    const [only, ...rest] = patches
    expect(rest).toEqual([])
    expect(only).toEqual({ cancelRequested: true })
    // Key-level, so a status write cannot hide behind a deep-equal on a subset.
    expect(Object.keys(only ?? {})).toEqual(['cancelRequested'])
  })

  it("is a no-op for an unknown run, matching update()'s documented invariant", async () => {
    const runs = new InMemoryRunStore()
    const missing = runId()
    await expect(requestRunCancel(runs, missing)).resolves.toBeUndefined()
    expect(await runs.get(missing)).toBeNull()
    expect(await wasCancelRequested(runs, missing)).toBe(false)
  })

  it('reports false when the backend cannot answer, rather than throwing', async () => {
    // A reaper/middleware calls this on the abort path, where throwing would
    // replace the user's own reason for stopping with a store error.
    const runs: RunStore = {
      createOrResume: () => Promise.reject(new Error('unused')),
      update: () => Promise.resolve(),
      get: () => Promise.reject(new Error('store down')),
    }
    await expect(wasCancelRequested(runs, 'r1')).resolves.toBe(false)
  })

  it('reports false when get throws SYNCHRONOUSLY too', async () => {
    const runs: RunStore = {
      createOrResume: () => Promise.reject(new Error('unused')),
      update: () => Promise.resolve(),
      get: () => {
        throw new Error('store down')
      },
    }
    await expect(wasCancelRequested(runs, 'r1')).resolves.toBe(false)
  })

  it('does not treat a falsy-but-present cancelRequested as a cancel', async () => {
    const { runs, id } = await seeded()
    await runs.update(id, { cancelRequested: false })
    expect(await wasCancelRequested(runs, id)).toBe(false)
  })
})

describe('status vocabulary agreement', () => {
  // Exhaustiveness-checked: adding a member to TerminalRunStatus (or to
  // RunStatus) is a compile error in these two Records until it is listed, so
  // this suite cannot silently fall behind the unions it asserts agreement with.
  const terminalCoverage: Record<TerminalRunStatus, true> = {
    completed: true,
    failed: true,
    aborted: true,
  }
  const nonTerminalCoverage: Record<
    Exclude<RunStatus, TerminalRunStatus>,
    true
  > = {
    running: true,
    interrupted: true,
  }
  // Typed lists, so no `as` cast is needed to call the predicate.
  const terminal: Array<TerminalRunStatus> = ['completed', 'failed', 'aborted']
  const nonTerminal: Array<Exclude<RunStatus, TerminalRunStatus>> = [
    'running',
    'interrupted',
  ]

  it('answers true for exactly the members of TerminalRunStatus', () => {
    expect(terminal.slice().sort()).toEqual(
      Object.keys(terminalCoverage).sort(),
    )
    for (const status of terminal) {
      expect(isTerminalRunStatus(status)).toBe(true)
    }
  })

  it('answers false for every non-terminal status', () => {
    expect(nonTerminal.slice().sort()).toEqual(
      Object.keys(nonTerminalCoverage).sort(),
    )
    for (const status of nonTerminal) {
      expect(isTerminalRunStatus(status)).toBe(false)
    }
  })

  it("'aborted' is terminal and 'interrupted' is not", () => {
    // The predicate was never the bug — the WRITER choosing 'interrupted' for an
    // abort was. Pinned here so the question is not re-opened.
    expect(isTerminalRunStatus('aborted')).toBe(true)
    expect(isTerminalRunStatus('completed')).toBe(true)
    expect(isTerminalRunStatus('failed')).toBe(true)
    expect(isTerminalRunStatus('interrupted')).toBe(false)
    expect(isTerminalRunStatus('running')).toBe(false)
  })
})

describe('RunRecord.driverEpoch', () => {
  it('round-trips through update, so a fencing token is durable', async () => {
    const { runs, id } = await seeded()
    expect((await runs.get(id))?.driverEpoch).toBeUndefined()
    await runs.update(id, { driverEpoch: 3 })
    expect((await runs.get(id))?.driverEpoch).toBe(3)
  })

  it('is patchable through the RunStore INTERFACE, not just the class', async () => {
    // Typed as the interface on purpose. The field has to be in BOTH `Pick<…>`
    // unions — `RunStore.update`'s and `InMemoryRunStore.update`'s — and a test
    // that only ever touches the concrete class compiles fine when the interface
    // is missing it, so every backend would reject the patch at its own type.
    const store: RunStore = new InMemoryRunStore()
    const id = runId()
    await store.createOrResume({ runId: id, threadId: 't1', startedAt: 1 })
    await store.update(id, { driverEpoch: 7 })
    expect((await store.get(id))?.driverEpoch).toBe(7)
  })

  it('is monotonically overwritable and survives an unrelated patch', async () => {
    const { runs, id } = await seeded()
    await runs.update(id, { driverEpoch: 1 })
    await runs.update(id, { driverEpoch: 2 })
    await runs.update(id, { cancelRequested: true })
    const record = await runs.get(id)
    expect(record?.driverEpoch).toBe(2)
    expect(record?.cancelRequested).toBe(true)
  })
})

describe('DetachableRunCapability', () => {
  it('reads absent as "not detachable" instead of throwing', () => {
    const ctx = { capabilities: new CapabilityRegistry() }
    expect(getDetachableRun(ctx, { optional: true })).toBeUndefined()
  })

  it('round-trips the marker a sandbox provides and persistence reads', () => {
    const ctx = { capabilities: new CapabilityRegistry() }
    provideDetachableRun(ctx, true)
    expect(getDetachableRun(ctx, { optional: true })).toBe(true)
    expect(DetachableRunCapability.capabilityName).toBe('detachable-run')
  })

  // ABSENCE is the negative, so `false` must not be representable. A capability
  // typed `boolean` lets `provide…(ctx, false)` compile, and a consumer that
  // tests PRESENCE (`getDetachableRun(ctx, { optional: true }) !== undefined`)
  // rather than the value would read that published `false` as "detachable".
  // Both capabilities are `createCapability<true>()` so the mistake cannot be
  // written down. The `@ts-expect-error`s below FAIL the typecheck if either
  // widens back to `boolean`.
  it('cannot publish a negative — absence is the only negative', () => {
    const ctx = { capabilities: new CapabilityRegistry() }
    // @ts-expect-error `false` is not a valid detachable-run marker
    provideDetachableRun(ctx, false)
    // @ts-expect-error `false` is not a valid run-detached marker
    provideRunDetached(ctx, false)
    // @ts-expect-error a plain `boolean` cannot be published either
    provideDetachableRun(ctx, Math.random() > 0.5)
    expect(DetachableRunCapability.capabilityName).toBe('detachable-run')
    expect(RunDetachedCapability.capabilityName).toBe('run-detached')
  })
})
