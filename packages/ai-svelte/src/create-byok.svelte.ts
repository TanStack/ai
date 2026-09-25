import { onDestroy } from 'svelte'
import type { ByokClient, ByokSnapshot } from '@tanstack/ai-client/byok'

export function createByok(client: ByokClient): {
  readonly snapshot: ByokSnapshot
} {
  let snapshot = $state(client.getSnapshot())
  const unsubscribe = client.subscribe(() => {
    snapshot = client.getSnapshot()
  })
  try {
    onDestroy(unsubscribe)
  } catch {
    // Svelte lifecycle hooks are only valid during component initialization.
  }

  return {
    get snapshot() {
      return snapshot
    },
  }
}
