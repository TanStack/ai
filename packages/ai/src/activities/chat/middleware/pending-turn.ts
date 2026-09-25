/**
 * Internal seam that lets a SLOW middleware ask the persistence layer to store
 * the user's pending turn NOW, before that middleware starts its slow work.
 *
 * WHY THIS EXISTS. Chat persistence stores the pending turn from `onStart`, which
 * is the earliest hook that holds the merged message list. `onStart` runs after
 * EVERY middleware `setup`, and that is normally a few milliseconds. `withSandbox`
 * breaks the assumption: its `setup` creates a sandbox and clones a repository,
 * which takes minutes. For that whole window the thread holds nothing, so a reload
 * — or a second device — asks the server for the conversation and is told it is
 * empty. The user sees no sign of the message they just sent.
 *
 * The provider owns the rule for WHAT to store. A caller must not rebuild that
 * rule: `saveThread` replaces the whole thread, so a caller that stored only the
 * newly-sent message would delete the history. Asking the owner to store the turn
 * keeps the merge in one place.
 *
 * OPT-IN, so nothing changes for a fast run. Persistence offers this seam on every
 * durable run; only a middleware that is about to be slow calls it. A run with no
 * such middleware never calls it, and the `onStart` store stays the only one.
 *
 * A SEAM RATHER THAN A NEW MIDDLEWARE HOOK, deliberately. A lifecycle hook that
 * runs before `setup` would be public API, and it would have to explain itself to
 * every middleware author. This concern has one provider (`withPersistence`) and
 * one caller (`withSandbox`), and it reaches across packages through the same
 * internal channel the sandbox layer already uses for its runtime.
 */
import { createCapability } from './capabilities'

export interface PendingTurnSnapshot {
  /**
   * Store the user's pending turn now.
   *
   * Idempotent: the later `onStart` store replaces the thread with the same or a
   * more complete list, so calling this changes what is visible EARLIER without
   * changing what is visible at the end.
   *
   * Rejects only if the store itself fails. Callers treat that as non-fatal — a
   * run that cannot pre-store its turn is still a run worth doing.
   */
  snapshot: () => Promise<void>
}

export const PendingTurnCapability =
  createCapability<PendingTurnSnapshot>()('pending-turn')

export const [getPendingTurn, providePendingTurn] = PendingTurnCapability
