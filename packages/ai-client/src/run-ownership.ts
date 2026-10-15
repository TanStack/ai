import type { GenerationDevtoolsBridge } from './devtools'
import type { GenerationClientState } from './generation-types'

/** True while `controller` is the client's current, unaborted run. */
export function ownsRun(
  current: AbortController | null,
  controller: AbortController,
): boolean {
  return !controller.signal.aborted && current === controller
}

/** True without a controller: that caller does not own a run. */
export function owns(
  current: AbortController | null,
  controller: AbortController | undefined,
): boolean {
  return !controller || ownsRun(current, controller)
}

/**
 * Run `steps` in order while `controller` owns the client. A step can run
 * user code, and that code can call `stop()` or start a new run. Returns
 * whether `controller` still owns the client.
 */
export function whileOwned(
  getCurrent: () => AbortController | null,
  controller: AbortController | undefined,
  ...steps: Array<() => unknown>
): boolean {
  for (const step of steps) {
    if (!owns(getCurrent(), controller)) return false
    step()
  }
  return owns(getCurrent(), controller)
}

/** Close a stopped run in devtools with the status it had when stopped. */
export function finishStoppedRun(
  bridge: Pick<GenerationDevtoolsBridge<unknown>, 'finishRun'>,
  runId: string | null,
  status: GenerationClientState,
  error: Error | undefined,
): void {
  if (!runId) return
  if (status === 'success') {
    bridge.finishRun(runId, 'run:completed', 'completed')
  } else if (status === 'error') {
    bridge.finishRun(runId, 'run:errored', 'errored', error?.message)
  } else {
    bridge.finishRun(runId, 'run:cancelled', 'cancelled')
  }
}
