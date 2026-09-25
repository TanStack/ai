import { onScopeDispose, readonly, shallowRef } from 'vue'
import type { ByokClient, ByokSnapshot } from '@tanstack/ai-client/byok'
import type { DeepReadonly, ShallowRef } from 'vue'

export function useByok(
  client: ByokClient,
): DeepReadonly<ShallowRef<ByokSnapshot>> {
  const snapshot = shallowRef(client.getSnapshot())
  const unsubscribe = client.subscribe(() => {
    snapshot.value = client.getSnapshot()
  })
  onScopeDispose(unsubscribe)
  return readonly(snapshot)
}
