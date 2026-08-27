/**
 * Per-stream detach predicates. Keyed weakly by the stream object, so a stream
 * that is dropped without ever being consumed takes its entry with it.
 */
const detachSignals = new WeakMap<object, () => boolean>()

/**
 * Publish `stream`'s detach predicate. Called by `chat()` on the object it hands
 * back, once per stream.
 *
 * Wired on BOTH streaming paths — `runStreamingText` and
 * `runStreamingStructuredOutput` — since either can be handed to a durable
 * transport helper. The non-streaming paths (`stream: false`, and the
 * `Promise<T>` structured-output variant) resolve a value rather than yielding a
 * stream, so there is no delivery sink to inform and nothing to publish.
 *
 * @internal
 */
export function publishRunDetachedSignal(
  stream: object,
  wasDetached: () => boolean,
): void {
  detachSignals.set(stream, wasDetached)
}

/**
 * Whether the run behind `stream` declared its abort a detach.
 *
 * `false` for anything that never published a predicate — a hand-rolled
 * iterable, a `chat()` from an older build, a non-object source — so an unknown
 * stream keeps the terminalize-and-close behavior rather than being spared it.
 *
 * A throwing predicate is also `false`, for the same reason: this is consulted on
 * a teardown path where the only safe default is to terminalize. Leaving a log
 * open because a probe threw would park every tailer forever.
 *
 * @internal
 */
export function wasRunDetached(stream: unknown): boolean {
  if (typeof stream !== 'object' || stream === null) return false
  const signal = detachSignals.get(stream)
  if (signal === undefined) return false
  try {
    return signal()
  } catch {
    return false
  }
}
