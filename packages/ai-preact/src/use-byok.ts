import { useSyncExternalStore } from 'preact/compat'
import type { ByokClient, ByokSnapshot } from '@tanstack/ai-client/byok'

export function useByok(client: ByokClient): ByokSnapshot {
  return useSyncExternalStore(client.subscribe, client.getSnapshot)
}
