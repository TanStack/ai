import { createCapability } from './capabilities'

export interface PendingTurnSnapshot {
  snapshot: () => Promise<void>
}

export const PendingTurnCapability =
  createCapability<PendingTurnSnapshot>()('pending-turn')

export const [getPendingTurn, providePendingTurn] = PendingTurnCapability
