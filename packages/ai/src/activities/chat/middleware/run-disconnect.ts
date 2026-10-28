/**
 * Internal seam the chat engine PROVIDES so middleware can learn that the
 * DELIVERY socket closed while the run is still going — and, crucially, learn it
 * WITHOUT the run being cancelled.
 *
 * WHY THIS EXISTS. Before it, the only way a disconnect reached middleware was for
 * the application to mirror `request.signal` into `chat()`'s `abortController`,
 * which ABORTS THE RUN. For a durable run that is precisely wrong, and wrong in
 * the most expensive direction: `chat()` returns at its `isCancelled()` check
 * immediately after middleware `setup`, so the harness adapter's `chatStream` is
 * never called and the agent in the sandbox that `setup` just spent minutes
 * creating is NEVER LAUNCHED. The user switched away during "starting the
 * sandbox", came back, and found an empty log belonging to a run that had done
 * nothing — with no takeover able to recover it, because an agent that never
 * started wrote no journal to replay. Applications were forced to choose between
 * "the middleware learns about the disconnect" and "the run survives it".
 *
 * So a disconnect is delivered as a NOTIFICATION. `withSandbox` uses it to stamp
 * `detachedSince`/`sandboxKey` and publish the detach verdict while the run keeps
 * producing into its still-open durable log — which is exactly what a re-attaching
 * client tails to catch up.
 *
 * A SUBSCRIPTION RATHER THAN A MIDDLEWARE HOOK, deliberately. `ChatMiddleware` is
 * public API and a new lifecycle hook there is a permanent commitment — including
 * the obligation to explain that it is the one hook that is NOT terminal. This
 * concern has exactly one consumer in the tree (`withSandbox`) and it reaches it
 * through the same internal channel the sandbox layer already uses for its runtime
 * (`SandboxRuntimeCapability`), so it ships with no public surface at all.
 *
 * DISPATCHED FROM THE TRANSPORT, NOT FROM THE RUN'S UNWINDING. That is what makes
 * it prompt. A run suspended inside a minutes-wide `setup` cannot dispatch anything
 * from its own `finally`, because the `finally` is reached only once the generator
 * unwinds — which is what made `detachedSince` land three minutes late.
 */
import { createCapability } from './capabilities'

/**
 * Registry of disconnect listeners for one run.
 *
 * Listeners must do BOOKKEEPING ONLY. The run is still executing, so releasing
 * anything it depends on — stopping a file watcher, destroying a sandbox — breaks
 * a healthy run. Teardown belongs in the terminal hooks, which still run exactly
 * once afterwards.
 *
 * A listener may return a promise; the engine awaits all of them before the run
 * finishes, so bookkeeping cannot be lost to a race with the run's own completion.
 */
export interface RunDisconnect {
  /**
   * Register `listener`, called at most once per run when the delivery socket
   * closes. Registering after the socket has ALREADY closed calls `listener`
   * immediately — otherwise a middleware whose `setup` was still running during
   * the disconnect would silently never hear about it, which is the exact window
   * the common disconnect lands in.
   */
  subscribe: (listener: () => void | Promise<void>) => void
}

export const RunDisconnectCapability =
  createCapability<RunDisconnect>()('run-disconnect')

export const [getRunDisconnect, provideRunDisconnect] = RunDisconnectCapability
