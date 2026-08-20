type TouchRun = (runId: string) => Promise<void>

const inFlightCallbacks = new WeakMap<object, Map<string, number>>()

function increment(owner: object, runId: string): void {
  let runs = inFlightCallbacks.get(owner)
  if (!runs) {
    runs = new Map()
    inFlightCallbacks.set(owner, runs)
  }
  runs.set(runId, (runs.get(runId) ?? 0) + 1)
}

function decrement(owner: object, runId: string): void {
  const runs = inFlightCallbacks.get(owner)
  if (!runs) return
  const count = runs.get(runId) ?? 0
  if (count > 1) {
    runs.set(runId, count - 1)
    return
  }
  runs.delete(runId)
  if (runs.size === 0) inFlightCallbacks.delete(owner)
}

export function hasInFlightCallback(owner: object, runId: string): boolean {
  return (inFlightCallbacks.get(owner)?.get(runId) ?? 0) > 0
}

export async function runWithCallbackActivity<T>(
  owner: object,
  runId: string,
  touch: TouchRun,
  operation: () => Promise<T>,
): Promise<T> {
  increment(owner, runId)
  try {
    // Failure here proves liveness could not be persisted, so do not execute the
    // callback operation.
    await touch(runId)
    try {
      return await operation()
    } finally {
      // This is best-effort bookkeeping after an operation has produced its
      // result or error. It must never replace that original outcome.
      try {
        await touch(runId)
      } catch (error) {
        console.error(
          `[sandbox-coordinator] completion activity touch failed for run ${runId}:`,
          error,
        )
      }
    }
  } finally {
    decrement(owner, runId)
  }
}
