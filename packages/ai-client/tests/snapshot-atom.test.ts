import { describe, expect, it, vi } from 'vitest'
import {
  cloneSnapshotValue,
  createAtom,
  patchAtom,
  subscribeAtom,
} from '../src/snapshot-atom'

describe('snapshot-atom', () => {
  it('freezes object snapshots and keeps identity without a change', () => {
    const atom = createAtom({ count: 1 })
    const snapshot = atom.get()

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(atom.get()).toBe(snapshot)
  })

  it('patchAtom skips notify when every field is unchanged', () => {
    const atom = createAtom({ count: 1, label: 'a' })
    const listener = vi.fn()
    const stop = subscribeAtom(atom, listener)

    patchAtom(atom, { count: 1, label: 'a' })
    expect(listener).not.toHaveBeenCalled()
    expect(atom.get()).toEqual({ count: 1, label: 'a' })

    patchAtom(atom, { count: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(atom.get()).toEqual({ count: 2, label: 'a' })
    stop()
  })

  it('subscribeAtom adapts { unsubscribe } to a plain cleanup', () => {
    const atom = createAtom(0)
    const listener = vi.fn()
    const stop = subscribeAtom(atom, listener)

    atom.set(1)
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    atom.set(2)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('subscribeAtom calls the listener again for a change made inside it', () => {
    const atom = createAtom({ isLoading: true, status: 'generating' })
    const seen: Array<boolean> = []
    const stop = subscribeAtom(atom, () => {
      seen.push(atom.get().isLoading)
      // A Solid effect or Vue watcher that calls `stop()` from here.
      if (atom.get().status === 'idle' && atom.get().isLoading) {
        patchAtom(atom, { isLoading: false })
      }
    })

    patchAtom(atom, { status: 'idle' })
    expect(seen).toEqual([true, false])
    stop()
  })

  it('cloneSnapshotValue copies plain values and keeps other objects', () => {
    class Result {
      read() {
        return 'ok'
      }
    }
    const blob = new Blob(['x'])
    const map = new Map([['a', 1]])
    const instance = new Result()

    expect(cloneSnapshotValue(blob)).toBe(blob)
    expect(cloneSnapshotValue(map)).toBe(map)
    expect(cloneSnapshotValue(instance).read()).toBe('ok')

    const plain = { url: 'a' }
    const copy = cloneSnapshotValue(plain)
    expect(copy).toEqual(plain)
    expect(copy).not.toBe(plain)
    expect(Object.isFrozen(copy)).toBe(true)
  })
})
