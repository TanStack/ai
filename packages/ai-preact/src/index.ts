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
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  createChatClientOptions,
  type ConnectionAdapter,
  type ConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
  type RunAgentInputContext,
  type FetchConnectionOptions,
  type XhrConnectionOptions,
  type InferChatMessages,
} from '@tanstack/ai-client'
