export { useChat } from './use-chat'
export type {
  UseChatOptions,
  UseChatReturn,
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
