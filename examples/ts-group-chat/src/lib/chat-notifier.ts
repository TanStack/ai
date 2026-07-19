import { RpcTarget } from 'capnweb'
import type { ChatNotification } from '../../chat-server/chat-api'

const handlers = new WeakMap<ChatNotifier, (notification: ChatNotification) => void>()

/** Client-side RpcTarget the server calls to push chat notifications. */
export class ChatNotifier extends RpcTarget {
  setHandler(handler: (notification: ChatNotification) => void) {
    handlers.set(this, handler)
  }

  notify(notification: ChatNotification) {
    handlers.get(this)?.(notification)
  }
}
