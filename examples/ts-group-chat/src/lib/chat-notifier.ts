import { RpcTarget } from 'capnweb'
import type { ChatNotification } from '../../chat-server/chat-api'

const handlers = new WeakMap<
  ChatNotifier,
  Set<(notification: ChatNotification) => void>
>()

/** Client-side RpcTarget the server calls to push chat notifications. */
export class ChatNotifier extends RpcTarget {
  addHandler(handler: (notification: ChatNotification) => void) {
    let set = handlers.get(this)
    if (!set) {
      set = new Set()
      handlers.set(this, set)
    }
    set.add(handler)
    return () => {
      set.delete(handler)
    }
  }

  /** @deprecated Prefer addHandler for multiple listeners */
  setHandler(handler: (notification: ChatNotification) => void) {
    handlers.set(this, new Set([handler]))
  }

  notify(notification: ChatNotification) {
    const set = handlers.get(this)
    if (!set) return
    for (const handler of set) {
      handler(notification)
    }
  }
}
