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
