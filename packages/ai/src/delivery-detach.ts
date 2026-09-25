/**
 * The one-way channel from a chat run to the durable DELIVERY sink that is
 * persisting it.
 *
 * The sink (`durableStreamSource` in `./stream-to-response.ts`) has to answer one
 * question on the abort path: was this disconnect a DETACH — the agent keeps
 * running and a later attach will continue the log — or the end of the run? Only
 * the run's own middleware can answer it (`withSandbox`'s `onAbort` resolves both
 * out-of-band cancel bands and `detachOnDisconnect`), and the sink cannot reach
 * the middleware capability bus: it lives one layer up, in the transport, and is
 * handed nothing but the stream and a durability adapter.
 *
 * So the fact travels on the STREAM ITSELF, keyed by the exact object `chat()`
 * returned. That is the seam an application cannot forget to wire: passing the
 * stream to `toServerSentEventsResponse(stream, { durability })` is already
 * mandatory, and it is the same object both sides hold. The alternative — a
 * `detachable` flag on the response options — has to be re-wired correctly at
 * every durable call site, and a forgotten one silently terminalizes a healthy
 * detached run's log, which is the exact defect this channel exists to fix.
 *
 * The value is a THUNK, not a boolean: the verdict is only known during the run's
 * teardown, long after the response object was built.
 */

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
