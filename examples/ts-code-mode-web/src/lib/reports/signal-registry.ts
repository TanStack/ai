import type { SignalRegistry } from './types'

/**
 * Creates a signal registry for tracking component subscriptions to signals.
 * Uses bidirectional maps for efficient lookup in both directions.
 */
export function createSignalRegistry(): SignalRegistry {
  // signal name → component IDs
  const signalToComponents = new Map<string, Set<string>>()
  // component ID → signal names
  const componentToSignals = new Map<string, Set<string>>()

  return {
    subscribe(componentId: string, signal: string) {
      // Add to signal → components map
      if (!signalToComponents.has(signal)) {
        signalToComponents.set(signal, new Set())
      }
      signalToComponents.get(signal)!.add(componentId)

      // Add to component → signals map
      if (!componentToSignals.has(componentId)) {
        componentToSignals.set(componentId, new Set())
      }
      componentToSignals.get(componentId)!.add(signal)
    },

    unsubscribe(componentId: string, signal: string) {
      signalToComponents.get(signal)?.delete(componentId)
      componentToSignals.get(componentId)?.delete(signal)
    },

    unsubscribeAll(componentId: string) {
      const signals = componentToSignals.get(componentId)
      if (signals) {
        for (const signal of signals) {
          signalToComponents.get(signal)?.delete(componentId)
        }
        componentToSignals.delete(componentId)
      }
    },

    getSubscribers(signal: string): string[] {
      return Array.from(signalToComponents.get(signal) || [])
    },

    getSubscriptions(componentId: string): string[] {
      return Array.from(componentToSignals.get(componentId) || [])
    },

    isSubscribed(componentId: string, signal: string): boolean {
      return signalToComponents.get(signal)?.has(componentId) ?? false
    },
  }
}
