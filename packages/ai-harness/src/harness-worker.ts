import { loggerOf, sweepOf } from './host'
import type { OrphanedLog } from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'
import type { HarnessUser } from './types'

/** The longest wait between two looks for work, in milliseconds. */
const MAX_POLL_MS = 30_000
/** The longest time that the worker skips a log that failed, in milliseconds. */
const MAX_FAILURE_BACKOFF_MS = 5 * 60_000

/** Options for {@link createHarnessWorker}. */
export interface HarnessWorkerPoolOptions<U extends HarnessUser = HarnessUser> {
  /** The host that runs the threads. */
  host: HarnessHost<U>
  /** The harnesses whose threads the worker runs, matched by name. */
  harnesses: ReadonlyArray<AnyHarness>
  /** At most how many threads the worker runs at the same time. Default 8. */
  concurrency?: number
  /** Stops the worker when it aborts, as `stop()` does. */
  signal?: AbortSignal
  /**
   * How long the worker waits after a look that found no work, in
   * milliseconds. The wait doubles after each look with no work, up to
   * 30 000, and gets a random part, so many workers do not look at the same
   * time. Default 1 000.
   */
  pollMs?: number
}

/**
 * Run the threads that no live host runs, on `host`. The worker looks for
 * logs with work and no live owner: inputs from `host.submit`, a host that
 * stopped, or a schedule or a `step.sleep` that is due. It takes each log,
 * opens its thread, recovers the work, runs the inputs that wait, and closes
 * the thread when its work ended. Many workers on many machines can run
 * against one log store: each log goes to one of them.
 *
 * Each thread opens in its own tenant, with no user. `await
 * worker.stop()` stops the looks, and waits until the threads that the
 * worker runs end their work and close. To stop the work at once, call
 * `host.close({ recoverable: true })`: the next host runs it again.
 *
 * Throws a `RangeError` when `concurrency` is not a whole number of 1 or
 * more.
 *
 * @example
 * ```ts
 * const host = createHarnessHost({ persistence })
 * const worker = createHarnessWorker({ host, harnesses: [assistant] })
 * process.on('SIGTERM', () => void worker.stop())
 * ```
 */
export function createHarnessWorker<U extends HarnessUser>({
  host,
  harnesses,
  concurrency = 8,
  signal,
  pollMs = 1_000,
}: HarnessWorkerPoolOptions<U>) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(
      `createHarnessWorker: concurrency must be a whole number of 1 or more, got ${concurrency}.`,
    )
  }
  const sweep = sweepOf(host)
  const logger = loggerOf(host)
  const byName = new Map(harnesses.map((harness) => [harness.name, harness]))
  const names = [...byName.keys()]
  const stopped = new AbortController()
  /** The threads that the worker runs, by store log id, until they close. */
  const running = new Map<string, Promise<void>>()
  /**
   * The logs whose take over failed, by store log id: how many times in a
   * row, and until when the worker skips them. So a log that always fails
   * does not take the place of the logs that can run.
   */
  const failures = new Map<string, { count: number; until: number }>()
  /** Ends the wait of the loop: a thread closed, or the worker stops. */
  let wake = () => {}

  /** Wait `ms`, or less when `wake` runs. */
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        wake = () => {}
        resolve()
      }
      const timer = setTimeout(done, ms)
      wake = done
    })

  /**
   * Take `orphan` over. Resolves `true` when this worker got the thread. The
   * thread stays in `running` until it closes.
   */
  const take = async (orphan: OrphanedLog, harness: AnyHarness) => {
    let release = () => {}
    const closed = new Promise<void>((resolve) => {
      release = resolve
    })
    running.set(orphan.logId, closed)
    const end = () => {
      running.delete(orphan.logId)
      release()
      wake()
    }
    try {
      const taken = await sweep.takeOver(orphan, harness, 'whenIdle')
      failures.delete(orphan.logId)
      if (!taken) {
        end()
        return false
      }
      void taken.released.finally(end)
      return true
    } catch (error) {
      const count = (failures.get(orphan.logId)?.count ?? 0) + 1
      const backoff = Math.min(MAX_FAILURE_BACKOFF_MS, pollMs * 2 ** count)
      failures.set(orphan.logId, { count, until: Date.now() + backoff })
      logger.error(
        `[@tanstack/ai-harness] The worker could not take the log ${JSON.stringify(orphan.logId)} over (failure ${count} in a row). It skips the log for ${backoff} ms.`,
        { error },
      )
      end()
      return false
    }
  }

  /** One look for work. Resolves `true` when the worker got a thread. */
  const look = async () => {
    const free = concurrency - running.size
    // The logs that this worker takes over now, and the logs that failed,
    // can still be listed: look past them.
    const orphans = await sweep.listLogsWithoutOwner({
      limit: free + running.size + failures.size,
      harnesses: names,
    })
    const now = Date.now()
    const listed = new Set(orphans.map((orphan) => orphan.logId))
    // A failed log that has no work now (another host ran it) is forgotten
    // after its backoff, so the map holds only the logs that still fail.
    for (const [logId, { until }] of failures) {
      if (until <= now && !listed.has(logId)) failures.delete(logId)
    }
    const skips = (logId: string) =>
      running.has(logId) || (failures.get(logId)?.until ?? 0) > now
    const takes = orphans
      .filter((orphan) => !skips(orphan.logId))
      .slice(0, free)
      .flatMap((orphan) => {
        const harness = byName.get(orphan.harness)
        return harness ? [take(orphan, harness)] : []
      })
    const results = await Promise.all(takes)
    return results.some(Boolean)
  }

  const loop = async () => {
    let emptyLooks = 0
    while (!stopped.signal.aborted) {
      if (running.size >= concurrency) {
        // Full: wait until a thread closes.
        await wait(MAX_POLL_MS)
        continue
      }
      let found = false
      try {
        found = await look()
      } catch (error) {
        logger.error('[@tanstack/ai-harness] The worker look failed.', {
          error,
        })
      }
      if (found) {
        emptyLooks = 0
        continue
      }
      if (stopped.signal.aborted) return
      const backoff = Math.min(MAX_POLL_MS, pollMs * 2 ** emptyLooks)
      emptyLooks += 1
      // Half to all of the backoff, so many workers spread out.
      await wait(backoff * (0.5 + Math.random() * 0.5))
    }
  }

  const looping = loop()
  let stopping: Promise<void> | undefined
  /**
   * Stop looking for work, and wait until the threads that this worker runs
   * end their work and close. A second call waits for the same stop.
   */
  const stop = () => {
    stopping ??= (async () => {
      stopped.abort()
      wake()
      await looping
      await Promise.allSettled(running.values())
    })()
    return stopping
  }
  if (signal?.aborted) void stop()
  signal?.addEventListener('abort', () => void stop(), { once: true })
  return { stop }
}
