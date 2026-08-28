import { createChatUI } from '../../src/create-ui'
import {
  chatOptions,
  createSvelteChatResult,
  messageWithToolResults,
} from '../../../ai-client/tests/ui-fixtures'
import Layout from './layout.svelte'
import Message from './message.svelte'
import Weather from './weather.svelte'
import Fallback from './fallback.svelte'
import Empty from './empty.svelte'

export const ui = createChatUI(chatOptions, {
  layout: Layout,
  message: Message,
  parts: { fallback: Fallback },
  tools: {
    getWeather: Weather,
    purchaseItem: Empty,
  },
  interrupts: { generic: { choosePlan: Empty, fallback: Empty } },
})
export const chat: ReturnType<typeof createSvelteChatResult> =
  createSvelteChatResult([messageWithToolResults])
export const components = ui.components
