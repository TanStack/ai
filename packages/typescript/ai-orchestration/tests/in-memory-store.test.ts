/**
 * Unit tests for `inMemoryRunStore` — pins the split state/log interface
 * and the optimistic-CAS contract `appendStep` must enforce. These pin
 * the *store* contract so a future swap to Postgres / Redis / etc.
 * implementations can be validated against the same expectations.
 */
import { describe, expect, it } from 'vitest'
import { inMemoryRunStore } from '../src/run-store/in-memory'
import { LogConflictError } from '../src/types'
import type { RunState, StepRecord } from '../src/types'

const baseRunState: RunState = {
  runId: 'run-1',
  status: 'running',
  workflowName: 'test',
  input: { msg: 'hi' },
  state: {},
  createdAt: 1,
  updatedAt: 1,
}

const stepRecord = (over: Partial<StepRecord> = {}): StepRecord => ({
  index: 0,
  kind: 'agent',
  name: 'agent-a',
  result: { ok: true },
  startedAt: 10,
  finishedAt: 20,
  ...over,
})

describe('inMemoryRunStore — state surface', () => {
  it('round-trips run state through setRunState / getRunState', async () => {
    const store = inMemoryRunStore()
    expect(await store.getRunState('run-1')).toBeUndefined()

    await store.setRunState('run-1', baseRunState)
    expect(await store.getRunState('run-1')).toEqual(baseRunState)
  })

  it('clears state and log on deleteRun', async () => {
    const store = inMemoryRunStore()
    await store.setRunState('run-1', baseRunState)
    await store.appendStep('run-1', 0, stepRecord())

    await store.deleteRun('run-1', 'finished')

    expect(await store.getRunState('run-1')).toBeUndefined()
    expect(await store.getSteps('run-1')).toEqual([])
  })
})

describe('inMemoryRunStore — step log surface', () => {
  it('returns the empty array for a run with no appends', async () => {
    const store = inMemoryRunStore()
    expect(await store.getSteps('never-ran')).toEqual([])
  })

  it('appends records in positional order and getSteps returns them ordered', async () => {
    const store = inMemoryRunStore()
    await store.appendStep('run-1', 0, stepRecord({ name: 'a' }))
    await store.appendStep('run-1', 1, stepRecord({ name: 'b' }))
    await store.appendStep('run-1', 2, stepRecord({ name: 'c' }))

    const log = await store.getSteps('run-1')
    expect(log.map((r) => r.name)).toEqual(['a', 'b', 'c'])
    expect(log.map((r) => r.index)).toEqual([0, 1, 2])
  })

  it('normalizes the record index to the actual position', async () => {
    // Caller passes a stale index field — the store fixes it to the
    // real position so the log is internally consistent.
    const store = inMemoryRunStore()
    await store.appendStep('run-1', 0, stepRecord({ index: 999, name: 'a' }))
    const log = await store.getSteps('run-1')
    expect(log[0]?.index).toBe(0)
  })

  it('throws LogConflictError when expectedNextIndex does not match', async () => {
    const store = inMemoryRunStore()
    await store.appendStep('run-1', 0, stepRecord({ name: 'a' }))

    // Wrong index — the log already has one entry at 0; next valid
    // index is 1, not 0.
    await expect(
      store.appendStep('run-1', 0, stepRecord({ name: 'b' })),
    ).rejects.toBeInstanceOf(LogConflictError)
  })

  it('LogConflictError carries the existing record so the engine can dedupe', async () => {
    const store = inMemoryRunStore()
    const winner = stepRecord({ name: 'winner', signalId: 'sig-1' })
    await store.appendStep('run-1', 0, winner)

    try {
      await store.appendStep('run-1', 0, stepRecord({ name: 'loser' }))
      expect.unreachable('appendStep should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LogConflictError)
      const conflict = err as LogConflictError
      expect(conflict.runId).toBe('run-1')
      expect(conflict.attemptedIndex).toBe(0)
      expect(conflict.existing?.name).toBe('winner')
      expect(conflict.existing?.signalId).toBe('sig-1')
    }
  })

  it('rejects appends that skip ahead of the next index', async () => {
    const store = inMemoryRunStore()
    // First entry must go at 0, not 1.
    await expect(
      store.appendStep('run-1', 1, stepRecord()),
    ).rejects.toBeInstanceOf(LogConflictError)
  })

  it('returns a snapshot — mutating it does not mutate the store', async () => {
    const store = inMemoryRunStore()
    await store.appendStep('run-1', 0, stepRecord({ name: 'a' }))

    const snap = await store.getSteps('run-1')
    ;(snap as Array<StepRecord>).push(stepRecord({ name: 'forged' }))

    const fresh = await store.getSteps('run-1')
    expect(fresh.map((r) => r.name)).toEqual(['a'])
  })

  it('isolates log between runs', async () => {
    const store = inMemoryRunStore()
    await store.appendStep('run-a', 0, stepRecord({ name: 'a0' }))
    await store.appendStep('run-b', 0, stepRecord({ name: 'b0' }))
    await store.appendStep('run-a', 1, stepRecord({ name: 'a1' }))

    expect((await store.getSteps('run-a')).map((r) => r.name)).toEqual([
      'a0',
      'a1',
    ])
    expect((await store.getSteps('run-b')).map((r) => r.name)).toEqual(['b0'])
  })
})
