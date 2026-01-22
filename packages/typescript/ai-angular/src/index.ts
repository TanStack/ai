export { injectChat } from './inject-chat'
export type {
  InjectChatOptions,
  InjectChatReturn,
  UIMessage,
  ChatRequestBody,
} from './types'

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
