/**
 * DevTools accumulator for the `skills:snapshot` event. Pure reducers so the
 * mapping is unit-testable without a Solid store.
 *
 * Keyed by hookId (the chat client that received the CUSTOM chunk). The Skills
 * tab resolves the active hook and reads that snapshot.
 */

export interface SkillCatalogEntry {
  name: string
  description: string
}

export interface SkillsSnapshot {
  catalog: Array<SkillCatalogEntry>
  activated: Array<string>
  updatedAt: number
}

export interface SkillsRegistryState {
  snapshots: Record<string, SkillsSnapshot>
}

export function createSkillsRegistryState(): SkillsRegistryState {
  return { snapshots: {} }
}

export function clearSkillsRegistry(state: SkillsRegistryState): void {
  state.snapshots = {}
}

export function applySkillsSnapshot(
  state: SkillsRegistryState,
  payload: {
    hookId?: string
    catalog?: Array<SkillCatalogEntry>
    activated?: Array<string>
    timestamp?: number
  },
): void {
  const key = payload.hookId && payload.hookId.length > 0 ? payload.hookId : '_default'
  const catalog = Array.isArray(payload.catalog) ? payload.catalog : []
  const activated = Array.isArray(payload.activated) ? payload.activated : []
  state.snapshots[key] = {
    catalog,
    activated,
    updatedAt: payload.timestamp ?? Date.now(),
  }
}
