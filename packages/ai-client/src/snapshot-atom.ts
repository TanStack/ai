import type { Atom } from '@tanstack/store'

export { createAtom } from '@tanstack/store'
export type { Atom }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Shallow copy, then freeze. Use for published snapshot fields that must not
 * alias client internals. Only plain objects and arrays are copied. Any other
 * object (Blob, Map, Date, class instance) is returned as it is, because a
 * spread copy loses its prototype.
 */
export function cloneSnapshotValue<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze([...value]) as T
  return isPlainObject(value) ? (Object.freeze({ ...value }) as T) : value
}

/**
 * Report an error thrown by a listener without stopping the caller. The
 * browser's `reportError` reaches `window.onerror` and error trackers. Other
 * runtimes log it.
 */
export function reportListenerError(error: unknown): void {
  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(error)
  } else {
    console.error(error)
  }
}

/** Call every listener. One listener's throw does not skip the others. */
export function notifyListeners<TArgs extends Array<unknown>>(
  listeners: Iterable<(...args: TArgs) => void>,
  ...args: TArgs
): void {
  for (const listener of listeners) {
    try {
      listener(...args)
    } catch (error) {
      reportListenerError(error)
    }
  }
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
  cache: WeakMap<object, object> = new WeakMap(),
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
    copy.subagent = Object.freeze(
      Array.isArray(sub.messages)
        ? {
            ...sub,
            messages: freezeSnapshotMessages(
              cache,
              sub.messages as Array<{ parts: ReadonlyArray<object> }>,
            ),
          }
        : { ...sub },
    )
  }
  return Object.freeze(copy) as TPart
}

function cached<T extends object>(
  cache: WeakMap<object, object>,
  value: T,
  freeze: (value: T) => T,
): T {
  let frozen = cache.get(value) as T | undefined
  if (!frozen) {
    frozen = freeze(value)
    cache.set(value, frozen)
  }
  return frozen
}

/**
 * Freeze a copy of each message and its parts. The client replaces a message
 * or a part object when it changes, so `cache` gives an unchanged message or
 * part the same frozen copy. UI memo keys on message identity, and a streamed
 * token copies only the part that changed.
 */
export function freezeSnapshotMessages<
  TMessage extends { parts: ReadonlyArray<object> },
>(
  cache: WeakMap<object, object>,
  messages: ReadonlyArray<TMessage>,
): ReadonlyArray<TMessage> {
  return Object.freeze(
    messages.map((message) =>
      cached(cache, message, () =>
        Object.freeze({
          ...message,
          parts: Object.freeze(
            message.parts.map((part) =>
              cached(cache, part, () => freezeSnapshotPart(part, cache)),
            ),
          ),
        }),
      ),
    ),
  )
}

/**
 * Merge a partial update into an object atom and freeze the result. Skips
 * notify when every provided field is `Object.is`-equal to the current value.
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
    return changed ? Object.freeze(next) : prev
  })
}

const MAX_LISTENER_REENTRY = 8

/**
 * Subscribe to an atom with the `() => void` unsubscribe that framework
 * stores expect.
 */
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
        reportListenerError(error)
      }
      spins++
    } while (atom.get() !== seen && spins < MAX_LISTENER_REENTRY)
  })
  return unsubscribe
}
