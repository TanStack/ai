// Re-export types from ai-context for backward compatibility
export type {
  MessagePart,
  ToolCall,
  TokenUsage,
  Message,
  Chunk,
  Conversation,
  AIStoreState,
} from "./ai-context";

// Re-export the context and provider for components that need the full store
export { AIProvider, useAIStore } from "./ai-context";

