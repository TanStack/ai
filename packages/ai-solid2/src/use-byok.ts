import { createSignal, onSettled, untrack } from 'solid-js'
import type { ByokClient, ByokSnapshot } from '@tanstack/ai-client/byok'
import type { Accessor } from 'solid-js'

export function useByok(client: ByokClient): Accessor<ByokSnapshot> {
  const [snapshot, setSnapshot] = createSignal(
    untrack(() => client.getSnapshot()),
  )
  onSettled(() => {
    const unsubscribe = client.subscribe(() => {
      setSnapshot(client.getSnapshot())
    })
    // Catch changes between the setup snapshot and subscription installation.
    setSnapshot(client.getSnapshot())
    return unsubscribe
  })
  return snapshot
}
