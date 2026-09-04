import { createAtom as createStoreAtom } from '@tanstack/store'
import type { Atom } from '@tanstack/store'

export type { Atom }

function freezeSnapshot<T>(value: T): T {
  return typeof value === 'object' && value !== null
    ? Object.freeze(value)
    : value
}

/** Shallow copy, then freeze. Use for published snapshot fields that must not alias client internals. */
export function cloneSnapshotValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return Object.freeze(Array.isArray(value) ? [...value] : { ...value }) as T
}

export function createAtom<T>(initialValue: T): Atom<T> {
  const atom = createStoreAtom(freezeSnapshot(initialValue))
  const set = atom.set.bind(atom)
  atom.set = (updater) =>
    set((previous) =>
      freezeSnapshot(
        typeof updater === 'function'
          ? (updater as (value: T) => T)(previous)
          : updater,
      ),
    )
  return atom
}

/**
 * Merge a partial update into an object atom. Skips notify when every
 * provided field is `Object.is`-equal to the current value.
 */
export function patchAtom<T extends object>(
  atom: Atom<T>,
  patch: Partial<T>,
): void {
  atom.set((prev) => {
    let changed = false
    const next = { ...prev }
    for (const key of Object.keys(patch) as Array<keyof T>) {
      if (Object.is(prev[key], patch[key])) continue
      next[key] = patch[key] as T[keyof T]
      changed = true
    }
    return changed ? next : prev
  })
}

/**
 * Adapt a Store atom's `{ unsubscribe }` subscription to the
 * `() => void` unsubscribe that `useSyncExternalStore` expects.
 */
export function subscribeAtom<T>(
  atom: {
    subscribe: (listener: (value: T) => void) => { unsubscribe: () => void }
  },
  listener: () => void,
): () => void {
  const { unsubscribe } = atom.subscribe(() => {
    listener()
  })
  return unsubscribe
}
