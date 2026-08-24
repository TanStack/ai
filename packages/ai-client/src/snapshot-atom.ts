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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Deep-freeze plain JSON. Class instances stay as they are. */
function freezePlainData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezePlainData))
  }
  if (!isPlainObject(value)) return value
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    copy[key] = freezePlainData(value[key])
  }
  return Object.freeze(copy)
}

/**
 * Freeze a copy of one message part. Tool `input` / `output`, `source`,
 * `approval`, tool-result `content`, and subagent transcripts are copies.
 * A subagent `stop` function stays the live function.
 */
export function freezeSnapshotPart<TPart extends object>(
  part: TPart,
  cache?: WeakMap<object, object>,
): TPart {
  const record = part as Record<string, unknown>
  const copy: Record<string, unknown> = { ...record }
  if (isPlainObject(record.source)) {
    copy.source = Object.freeze({ ...record.source })
  }
  if (record.type === 'tool-call' && isPlainObject(record.approval)) {
    copy.approval = Object.freeze({ ...record.approval })
  }
  if (record.type === 'tool-result' && Array.isArray(record.content)) {
    copy.content = Object.freeze(
      record.content.map((contentPart: unknown) =>
        typeof contentPart === 'object' && contentPart !== null
          ? freezeSnapshotPart(contentPart, cache)
          : contentPart,
      ),
    )
  }
  if ('input' in record) copy.input = freezePlainData(record.input)
  if ('output' in record) copy.output = freezePlainData(record.output)
  if (record.type === 'subagent' && isPlainObject(record.subagent)) {
    const sub = record.subagent
    copy.subagent = Object.freeze({
      ...sub,
      ...(Array.isArray(sub.messages)
        ? {
            messages: freezeSnapshotMessages(
              (cache ?? new WeakMap()) as WeakMap<
                { parts: ReadonlyArray<object> },
                { parts: ReadonlyArray<object> }
              >,
              sub.messages as Array<{ parts: ReadonlyArray<object> }>,
            ),
          }
        : {}),
    })
  }
  return Object.freeze(copy) as TPart
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
          parts: Object.freeze(
            message.parts.map((part) =>
              freezeSnapshotPart(part, cache as WeakMap<object, object>),
            ),
          ),
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
const MAX_LISTENER_REENTRY = 8

export function subscribeAtom<T>(
  atom: Pick<Atom<T>, 'get' | 'subscribe'>,
  listener: () => void,
): () => void {
  const { unsubscribe } = atom.subscribe(() => {
    // Store calls this inside an effect. A change made while `listener`
    // runs (a Solid effect or Vue watcher that calls `stop()`) does not
    // notify this subscriber again, so call it again until the value stays.
    // One listener's throw must not skip the other subscribers, and must
    // not escape into the setter that published this snapshot.
    let seen: T
    let spins = 0
    do {
      seen = atom.get()
      try {
        listener()
      } catch (error) {
        console.error(error)
        return
      }
      spins++
    } while (atom.get() !== seen && spins < MAX_LISTENER_REENTRY)
  })
  return unsubscribe
}
