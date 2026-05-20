import { waitForSignal } from './wait-for-signal'
import type { StepGenerator } from '../types'

/**
 * Reserved signal name for time-driven wakeups. Hosts that schedule
 * sleeps deliver wakes with this name and an empty payload.
 */
export const TIMER_SIGNAL_NAME = '__timer'

/**
 * Durable pause until `timestamp` (UTC ms). Survives process restart:
 * the engine persists the deadline as `waitingFor.deadline`, hosts
 * schedule the wake however they like, and the run resumes when the
 * host delivers the `__timer` signal.
 *
 *     yield* sleepUntil(Date.now() + 60_000)
 *
 * Past-deadline wakes resolve immediately when the host delivers — no
 * "skip sleep" semantics. If the wake is delivered before the deadline
 * (e.g., a host that doesn't honor the timer hint), the run still
 * resumes; the deadline is advisory.
 */
export function sleepUntil(timestamp: number): StepGenerator<void> {
  return waitForSignal<void>(TIMER_SIGNAL_NAME, { deadline: timestamp })
}

/**
 * Durable pause for `ms` milliseconds. Sugar for
 * `sleepUntil(Date.now() + ms)`.
 *
 *     yield* sleep(60_000) // wake in 60s
 */
export function sleep(ms: number): StepGenerator<void> {
  return sleepUntil(Date.now() + ms)
}
