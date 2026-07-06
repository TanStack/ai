export { useChat } from './use-chat'
export { useMcpAppBridge } from './use-mcp-app-bridge'
export type { UseMcpAppBridgeOptions } from './use-mcp-app-bridge'
export type {
  UseChatOptions,
  UseChatReturn,
  UIMessage,
  ChatRequestBody,
  QueuedMessage,
  WhenBusy,
  QueueConfig,
  QueueStrategy,
  QueueOption,
} from './types'

export {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  createChatClientOptions,
  createMcpAppBridge,
  type McpAppBridge,
  type CreateMcpAppBridgeOptions,
  type ConnectionAdapter,
  type ConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
  type RunAgentInputContext,
  type FetchConnectionOptions,
  type XhrConnectionOptions,
  type InferChatMessages,
} from '@tanstack/ai-client'
