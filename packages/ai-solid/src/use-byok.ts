import { createSignal, onCleanup } from 'solid-js'
import type { ByokClient, ByokSnapshot } from '@tanstack/ai-client/byok'
import type { Accessor } from 'solid-js'

export function useByok(client: ByokClient): Accessor<ByokSnapshot> {
  const [snapshot, setSnapshot] = createSignal(client.getSnapshot())
  const unsubscribe = client.subscribe(() => {
    setSnapshot(client.getSnapshot())
  })
  onCleanup(unsubscribe)
  return snapshot
}
