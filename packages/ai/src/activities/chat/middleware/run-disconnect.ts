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
