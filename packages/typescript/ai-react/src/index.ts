export { useChat } from './use-chat'
export { useRealtimeChat } from './use-realtime-chat'
export type {
  UseChatOptions,
  UseChatReturn,
  UIMessage,
  ChatRequestBody,
} from './types'
export type {
  UseRealtimeChatOptions,
  UseRealtimeChatReturn,
} from './realtime-types'

// Re-export from ai-client for convenience
export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  createChatClientOptions,
  type ConnectionAdapter,
  type FetchConnectionOptions,
  type InferChatMessages,
} from '@tanstack/ai-client'
