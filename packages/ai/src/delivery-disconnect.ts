/**
 * The one-way channel from the durable DELIVERY sink back to the chat run: "your
 * viewer is gone, but you are not."
 *
 * This is the MIRROR of `./delivery-detach.ts`. That module answers a question the
 * sink asks the run (was this abort a detach?); this one delivers a fact the sink
 * learns first and the run cannot observe at all — the response body was
 * cancelled. Both are keyed weakly by the exact stream object `chat()` returned,
 * for the same reason: passing that object to
 * `toServerSentEventsResponse(stream, { durability })` is already mandatory, so it
 * is the one seam an application cannot forget to wire.
 *
 * WHY THE RUN CANNOT JUST WATCH AN ABORT SIGNAL. Before this channel existed, the
 * only way a disconnect reached a run's middleware was for the application to
 * mirror `request.signal` into `chat()`'s `abortController` — which ABORTS THE RUN.
 * For a durable run that is precisely wrong, and wrong in the most expensive
 * direction: `chat()` returns at its `isCancelled()` check immediately after
 * middleware setup, so the harness adapter's `chatStream` is never called and the
 * agent in the freshly-created sandbox is NEVER LAUNCHED. The user re-attaches to
 * an empty log belonging to a run that did nothing, and no takeover can recover it
 * because there is no journal to replay. The application was forced to choose
 * between "the middleware learns about the disconnect" and "the run survives it".
 *
 * So the disconnect travels as a NOTIFICATION rather than a cancellation. The run
 * hands it to whatever subscribed through `RunDisconnectCapability` — bookkeeping
 * only, no teardown — and keeps producing into its still-open durable log, which
 * is exactly what a re-attaching client tails to catch up.
 *
 * DISPATCHED FROM THE TRANSPORT, NOT FROM THE RUN'S UNWINDING. That is what makes
 * it prompt. A run suspended inside a minutes-wide `setup` (cloning a repo into a
 * sandbox) cannot dispatch anything from its own `finally`, because the `finally`
 * is reached only once the generator unwinds — which is what made `detachedSince`
 * land three minutes late instead of immediately.
 */

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
