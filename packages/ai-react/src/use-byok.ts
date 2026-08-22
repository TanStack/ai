import { useSyncExternalStore } from 'react'
import { EMPTY_BYOK_SNAPSHOT } from '@tanstack/ai-client/byok'
import type { ByokClient, ByokSnapshot } from '@tanstack/ai-client/byok'

export function useByok(client: ByokClient): ByokSnapshot {
  return useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    () => EMPTY_BYOK_SNAPSHOT,
  )
}
