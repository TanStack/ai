export { injectChat } from './inject-chat'
export type {
  InjectChatOptions,
  InjectChatReturn,
  UIMessage,
  ChatRequestBody,
} from './types'

export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  createChatClientOptions,
  type ConnectionAdapter,
  type FetchConnectionOptions,
  type InferChatMessages,
} from '@tanstack/ai-client'
