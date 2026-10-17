import { EXIT } from './print'
import type { HarnessSession } from '@tanstack/ai-harness'

/** The signals that stop the CLI. */
export type StopSignal = 'SIGINT' | 'SIGTERM'

/**
 * Where the CLI hears SIGINT and SIGTERM. `process` is one. An
 * `EventEmitter` is one too, so a test can emit the signals.
 */
export interface SignalSource {
  on: (signal: StopSignal, handler: () => void) => unknown
  off: (signal: StopSignal, handler: () => void) => unknown
}

/** The exit code of a process that a signal stopped: 128 plus its number. */
const EXIT_CODES = { SIGINT: EXIT.cancelled, SIGTERM: 143 }

/**
 * Listen for SIGINT and SIGTERM on `source` while a CLI mode runs.
 *
 * A signal first calls `cancel`, which stops the running turn and returns
 * `true`. When `cancel` returns `false` (no turn runs, or a signal cancelled
 * this turn already), the signal stops the mode: the listeners go, `signal`
 * aborts, and `stopped` resolves with the exit code, 130 for SIGINT or 143
 * for SIGTERM. A signal after that gets the default action of `process`, so
 * a close that does not end can still be killed.
 */
export function stopOnSignals(source: SignalSource, cancel: () => boolean) {
  const controller = new AbortController()
  let resolveStopped: (code: number) => void = () => {}
  const stopped = new Promise<number>((resolve) => {
    resolveStopped = resolve
  })
  let last: StopSignal | undefined
  const receive = (signal: StopSignal) => {
    if (controller.signal.aborted) return
    last = signal
    if (cancel()) return
    dispose()
    controller.abort()
    resolveStopped(EXIT_CODES[signal])
  }
  const onInterrupt = () => receive('SIGINT')
  const onTerminate = () => receive('SIGTERM')
  function dispose() {
    source.off('SIGINT', onInterrupt)
    source.off('SIGTERM', onTerminate)
  }
  source.on('SIGINT', onInterrupt)
  source.on('SIGTERM', onTerminate)
  return {
    /** Aborts when a signal stops the mode. */
    signal: controller.signal,
    /** Resolves with the exit code when a signal stops the mode. */
    stopped,
    /** The exit code of the last signal. `undefined` before a signal. */
    exitCode: () => (last === undefined ? undefined : EXIT_CODES[last]),
    /** Handle `signal` as if `source` sent it. */
    receive,
    /** Stop listening. */
    dispose,
  }
}

/**
 * The `cancel` of `stopOnSignals` for a session: cancel its running turn.
 * Returns `false` when no turn runs, or when it cancelled this turn
 * already, so a second signal stops a turn that does not end.
 */
export function cancelTurn(session: HarnessSession) {
  let cancelled: string | undefined
  return () => {
    const turn = session
      .snapshot()
      .activeOperations.find((operation) => operation.kind === 'chat')
    if (turn === undefined || turn.id === cancelled) return false
    cancelled = turn.id
    // When the cancel fails, the turn runs on, and the next signal closes.
    void session.cancel({ operationId: turn.id }).catch(() => {})
    return true
  }
}
