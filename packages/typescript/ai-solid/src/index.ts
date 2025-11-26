export { useChat } from "./use-chat";
export type {
  UseChatOptions,
  UseChatReturn,
  UIMessage,
  ChatRequestBody,
} from "./types";

// Re-export connection adapters from ai-client for convenience
export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
  type FetchConnectionOptions,
} from "@tanstack/ai-client";
