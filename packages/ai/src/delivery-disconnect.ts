/**
 * Per-stream disconnect handlers. Keyed weakly by the stream object, so a stream
 * dropped without ever being consumed takes its entry with it.
 */
const disconnectHandlers = new WeakMap<object, () => void>()

/**
 * Publish `stream`'s disconnect handler. Called by `chat()` on the object it hands
 * back, once per stream.
 *
 * Wired on BOTH streaming paths — `runStreamingText` and
 * `runStreamingStructuredOutput` — since either can be handed to a durable
 * transport helper, matching `publishRunDetachedSignal`.
 *
 * @internal
 */
export function publishRunDisconnectHandler(
  stream: object,
  onDisconnect: () => void,
): void {
  disconnectHandlers.set(stream, onDisconnect)
}

/**
 * Tell the run behind `stream` that its delivery socket closed.
 *
 * A NO-OP for anything that never published a handler — a hand-rolled iterable, a
 * `chat()` from an older build, a non-object source — so an unknown stream simply
 * keeps today's behavior.
 *
 * NEVER THROWS and never returns a promise to await. This is called from
 * `ReadableStream.cancel()`, whose rejection would surface as an unhandled error
 * on a path where the consumer has already gone away; and the handler's own work
 * is tracked by the run (which awaits it before finishing), not by this call. A
 * throwing handler is swallowed for the same reason `wasRunDetached` swallows: the
 * disconnect path has no second channel to report on.
 *
 * @internal
 */
export function notifyRunDisconnected(stream: unknown): void {
  if (typeof stream !== 'object' || stream === null) return
  const handler = disconnectHandlers.get(stream)
  if (handler === undefined) return
  try {
    handler()
  } catch {
    // Intentionally empty: see above.
  }
}
