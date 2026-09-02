import type { ByokClient } from '@tanstack/ai-client/byok'
import type { Handle } from 'remix/ui'

/**
 * Subscribe to a BYOK snapshot in Remix setup.
 *
 * Call this from a component setup function. The returned getter reads the
 * latest snapshot. When the client changes, the helper calls `handle.update()`
 * so the component renders again. It unsubscribes when `handle.signal` aborts.
 *
 * @param handle Remix setup handle
 * @param client BYOK keyring
 */
export function createByok(
  handle: Pick<Handle, 'update' | 'signal'>,
  client: Pick<ByokClient, 'getSnapshot' | 'subscribe'>,
) {
  let snapshot = client.getSnapshot()
  const unsubscribe = client.subscribe(() => {
    snapshot = client.getSnapshot()
    void handle.update()
  })
  if (handle.signal.aborted) {
    unsubscribe()
  } else {
    handle.signal.addEventListener('abort', unsubscribe, { once: true })
  }
  return () => snapshot
}
