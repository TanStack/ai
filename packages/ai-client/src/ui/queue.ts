import type { QueuedMessage } from '../types'

/**
 * Copy each queued message and bind `cancelQueued` to that item's id.
 *
 * @param queue - Pending sends from the chat host.
 * @param cancelQueued - Host cancel that takes a queue id.
 */
export function bindChatUIQueue(
  queue: ReadonlyArray<QueuedMessage>,
  cancelQueued: (id: string) => void,
) {
  return queue.map((item) => ({
    ...item,
    cancelQueued: () => {
      cancelQueued(item.id)
    },
  }))
}
