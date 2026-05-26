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
  rpcStream,
  createChatClientOptions,
  type ConnectionAdapter,
  type ConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
  type RunAgentInputContext,
  type FetchConnectionOptions,
  type InferChatMessages,
} from '@tanstack/ai-client'
