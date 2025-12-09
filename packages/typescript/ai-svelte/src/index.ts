export { createChat } from './create-chat.svelte'
export type {
  CreateChatOptions,
  CreateChatReturn,
  UIMessage,
  ChatRequestBody,
} from './types'

// Re-export from ai-client for convenience
export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  createChatClientOptions,
  clientTools,
  type ConnectionAdapter,
  type FetchConnectionOptions,
  type InferChatMessages,
} from '@tanstack/ai-client'
