import { createAtom as createStoreAtom } from '@tanstack/store'
import type { Atom } from '@tanstack/store'

export type { Atom }

function freezeSnapshot<T>(value: T): T {
  return typeof value === 'object' && value !== null
    ? Object.freeze(value)
    : value
}

/**
 * Shallow copy, then freeze. Use for published snapshot fields that must not
 * alias client internals. Only plain objects and arrays are copied. Any other
 * object (Blob, Map, Date, class instance) is returned as it is, because a
 * spread copy loses its prototype.
 */
export function cloneSnapshotValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return Object.freeze([...value]) as T
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  return Object.freeze({ ...value })
}

/**
 * Freeze a copy of one message part, plus its `source`, its tool-call
 * `approval`, and its tool-result `content` parts.
 */
export function freezeSnapshotPart<TPart extends object>(part: TPart): TPart {
  return Object.freeze({
    ...part,
    ...('source' in part &&
    typeof part.source === 'object' &&
    part.source !== null
      ? { source: Object.freeze({ ...part.source }) }
      : {}),
    ...('type' in part &&
    part.type === 'tool-call' &&
    'approval' in part &&
    typeof part.approval === 'object' &&
    part.approval !== null
      ? { approval: Object.freeze({ ...part.approval }) }
      : {}),
    ...('type' in part &&
    part.type === 'tool-result' &&
    'content' in part &&
    Array.isArray(part.content)
      ? {
          content: Object.freeze(
            part.content.map((contentPart: unknown) =>
              typeof contentPart === 'object' && contentPart !== null
                ? freezeSnapshotPart(contentPart)
                : contentPart,
            ),
          ),
        }
      : {}),
  })
}

/**
 * Freeze a copy of each message and its parts. The client replaces a message
 * object when it changes, so `cache` gives an unchanged message the same
 * frozen copy. UI memo keys on message identity.
 */
export function freezeSnapshotMessages<
  TMessage extends { parts: ReadonlyArray<object> },
>(
  cache: WeakMap<TMessage, TMessage>,
  messages: ReadonlyArray<TMessage>,
): ReadonlyArray<TMessage> {
  return Object.freeze(
    messages.map((message) => {
      let frozen = cache.get(message)
      if (!frozen) {
        frozen = Object.freeze({
          ...message,
          parts: Object.freeze(message.parts.map(freezeSnapshotPart)),
        })
        cache.set(message, frozen)
      }
      return frozen
    }),
  )
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
  atom: Pick<Atom<T>, 'get' | 'subscribe'>,
  listener: () => void,
): () => void {
  const { unsubscribe } = atom.subscribe(() => {
    // Store calls this inside an effect. A change made while `listener`
    // runs (a Solid effect or Vue watcher that calls `stop()`) does not
    // notify this subscriber again, so call it again until the value stays.
    let seen: T
    do {
      seen = atom.get()
      listener()
    } while (atom.get() !== seen)
  })
  return unsubscribe
}
