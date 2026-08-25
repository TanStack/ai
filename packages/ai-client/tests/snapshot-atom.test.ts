import { describe, expect, it, vi } from 'vitest'
import { createAtom, patchAtom, subscribeAtom } from '../src/snapshot-atom'

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
})
