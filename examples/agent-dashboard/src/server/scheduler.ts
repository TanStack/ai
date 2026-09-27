/**
 * The dashboard's clock. A single server-side interval ticks the schedule table
 * and fires due schedules as injections. The schedule table is durable (see
 * store.ts); the interval itself is not — it re-arms on the first API hit after
 * boot, and a schedule that came due while the server was down fires once then.
 *
 * Booted lazily from the injection routes (idempotent). Because module-level
 * state persists across requests in the Nitro process, one interval is enough.
 */
import { nextFireAfter } from './cron'
import { runInjection, schedules } from './injection'
import type { Schedule } from './injection'

let timer: ReturnType<typeof setInterval> | undefined

/** The next fire time for a schedule, given its cron or fixed interval. */
export function computeNextFire(schedule: Schedule, fromMs: number): number | undefined {
  if (schedule.everySeconds) return fromMs + schedule.everySeconds * 1000
  if (schedule.cron) return nextFireAfter(schedule.cron, fromMs)
  return undefined
}

function tick(): void {
  const now = Date.now()
  for (const schedule of schedules.values()) {
    if (!schedule.enabled || !schedule.nextFire || schedule.nextFire > now) {
      continue
    }
    schedule.nextFire = computeNextFire(schedule, now)
    void runInjection({
      threadId: schedule.threadId,
      channelId: schedule.channelId,
      tool: schedule.tool,
      args: schedule.args,
      trigger: 'timer',
    })
  }
}

/** Start the clock once. Safe to call repeatedly. */
export function startScheduler(): void {
  if (timer) return
  timer = setInterval(tick, 1000)
  // Don't keep the process alive just for the demo clock.
  ;(timer as { unref?: () => void }).unref?.()
}
