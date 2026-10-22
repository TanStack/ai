import type { MCPEventStore, MCPEventSubscription } from './types'

/**
 * In-process event subscription store. For development and tests only.
 * Callers receive structured clones, so they cannot mutate stored state.
 *
 * @experimental
 *
 * @example
 * ```ts
 * import { inMemoryMCPEventStore } from '@tanstack/ai-mcp/events'
 *
 * const store = inMemoryMCPEventStore()
 * ```
 */
export function inMemoryMCPEventStore(): MCPEventStore {
  const byKey = new Map<string, MCPEventSubscription>()
  const byId = new Map<string, string>()

  function index(record: MCPEventSubscription) {
    if (typeof record.id === 'string') byId.set(record.id, record.key)
  }

  function unindex(record: MCPEventSubscription | undefined) {
    if (record?.id !== undefined) byId.delete(record.id)
  }

  return {
    async get(key) {
      const stored = byKey.get(key)
      return stored === undefined ? undefined : structuredClone(stored)
    },
    async getById(id) {
      const key = byId.get(id)
      if (key === undefined) return undefined
      const stored = byKey.get(key)
      return stored === undefined ? undefined : structuredClone(stored)
    },
    async set(subscription) {
      const previous = byKey.get(subscription.key)
      if (previous?.id !== undefined && previous.id !== subscription.id) {
        byId.delete(previous.id)
      }
      const stored = structuredClone(subscription)
      byKey.set(stored.key, stored)
      index(stored)
    },
    async update(key, patch) {
      const stored = byKey.get(key)
      if (stored === undefined) return
      if (
        patch.id !== undefined &&
        stored.id !== undefined &&
        patch.id !== stored.id
      ) {
        byId.delete(stored.id)
      }
      Object.assign(stored, patch)
      index(stored)
    },
    async delete(key) {
      unindex(byKey.get(key))
      byKey.delete(key)
    },
    async *list() {
      for (const stored of byKey.values()) {
        yield structuredClone(stored)
      }
    },
  }
}
