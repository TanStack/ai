import { describe, expect, it, vi } from 'vitest'
import {
  cloneSnapshotValue,
  createAtom,
  freezeSnapshotMessages,
  patchAtom,
  subscribeAtom,
} from '../src/snapshot-atom'

describe('snapshot-atom', () => {
  it('patchAtom freezes the patched snapshot and keeps identity without a change', () => {
    const atom = createAtom({ count: 1 })
    patchAtom(atom, { count: 2 })
    const snapshot = atom.get()

    expect(Object.isFrozen(snapshot)).toBe(true)
    patchAtom(atom, { count: 2 })
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

  it('isolates a throwing listener from the next subscriber', () => {
    const atom = createAtom(0)
    const second = vi.fn()
    const stopFirst = subscribeAtom(atom, () => {
      throw new Error('listener failed')
    })
    const stopSecond = subscribeAtom(atom, second)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    atom.set(1)

    expect(second).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()
    stopFirst()
    stopSecond()
    error.mockRestore()
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

  it('stops calling a listener that changes the atom on every call', () => {
    const atom = createAtom({ count: 0 })
    let calls = 0
    const stop = subscribeAtom(atom, () => {
      calls++
      patchAtom(atom, { count: atom.get().count + 1 })
    })

    patchAtom(atom, { count: 1 })

    expect(calls).toBe(8)
    stop()
  })

  it('reuses the frozen copy of an unchanged message and part', () => {
    const cache = new WeakMap<object, object>()
    const text = { type: 'text', content: 'hi' }
    const tool = { type: 'tool-call', input: { q: 'a' } }
    const first = { id: 'm1', parts: [text, tool] }

    const [frozenFirst] = freezeSnapshotMessages(cache, [first])
    // The processor replaces the message and the changed part only.
    const second = { ...first, parts: [{ ...text, content: 'hi!' }, tool] }
    const [frozenSecond] = freezeSnapshotMessages(cache, [second])

    expect(frozenSecond).not.toBe(frozenFirst)
    expect(frozenSecond?.parts[1]).toBe(frozenFirst?.parts[1])
    expect(frozenSecond?.parts[0]).not.toBe(frozenFirst?.parts[0])
    expect(freezeSnapshotMessages(cache, [second])[0]).toBe(frozenSecond)
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
