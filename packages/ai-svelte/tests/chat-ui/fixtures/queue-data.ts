import { createChatUI } from '../../../src/chat-ui/create-ui'
import {
  chatOptions,
  createSvelteChatResult,
} from '../../../../ai-client/tests/ui-fixtures'
import QueueLayout from './queue-layout.svelte'
import QueueItem from './queue-item.svelte'
import Message from './message.svelte'
import Fallback from './fallback.svelte'
import Empty from './empty.svelte'

export const cancelled: Array<string> = []

export const ui = createChatUI(chatOptions, {
  components: {
    layout: QueueLayout,
    message: Message,
    queue: QueueItem,
  },
  partsComponents: { fallback: Fallback },
  toolsComponents: {
    getWeather: Empty,
    purchaseItem: Empty,
  },
  interruptsComponents: { generic: { choosePlan: Empty, fallback: Empty } },
})
export const chat: ReturnType<typeof createSvelteChatResult> =
  createSvelteChatResult([], [], {
    queue: [{ id: 'q1', content: 'later', createdAt: 1 }],
    cancelQueued: (id) => {
      cancelled.push(id)
    },
  })
