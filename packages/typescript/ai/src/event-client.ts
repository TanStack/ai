import { EventEmitter } from "events";
import type { StreamChunk, ChatCompletionResult, ChatCompletionOptions, Tool } from "./types";

/**
 * Event payloads for AI observability
 */
export interface AIEventMap {
  // Chat lifecycle events
  "chat:started": {
    type: "standalone" | "instance";
    timestamp: number;
    options: Omit<ChatCompletionOptions, "model" | "providerOptions" | "responseFormat"> & {
      model: string;
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
      providerOptions?: Record<string, any>;
    };
  };
  "chat:completed": {
    type: "standalone" | "instance";
    timestamp: number;
    options: Omit<ChatCompletionOptions, "model" | "providerOptions" | "responseFormat"> & {
      model: string;
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
      providerOptions?: Record<string, any>;
    };
    result: ChatCompletionResult;
    duration: number;
  };
  "chat:iteration": {
    type: "standalone" | "instance";
    timestamp: number;
    iteration: number;
    reason: string;
    model: string;
    messageCount: number;
  };

  // Stream lifecycle events
  "stream:started": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    options: Omit<ChatCompletionOptions, "model" | "providerOptions" | "responseFormat"> & {
      model: string;
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
      providerOptions?: Record<string, any>;
    };
  };
  "stream:ended": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    model: string;
    duration: number;
    totalChunks?: number;
  };

  // Stream chunk events - includes all chunk data
  "stream:chunk": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    chunk: StreamChunk;
  };

  // Specific chunk type events for convenience
  "stream:content": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    model: string;
    delta: string;
    accumulatedContent?: string;
  };
  "stream:tool-call": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    model: string;
    toolCallId: string;
    toolName: string;
    arguments: string;
  };
  "stream:tool-result": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    model: string;
    toolCallId: string;
    toolName: string;
    content: string;
  };
  "stream:done": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    model: string;
    finishReason: string | null;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
  "stream:error": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    model: string;
    error: {
      message: string;
      code?: string;
    };
  };

  // Tool events
  "tool:approval-requested": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    model: string;
    toolCallId: string;
    toolName: string;
    input: any;
    approvalId: string;
  };
  "tool:input-available": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId: string;
    model: string;
    toolCallId: string;
    toolName: string;
    input: any;
  };
  "tool:completed": {
    type: "standalone" | "instance";
    timestamp: number;
    model: string;
    toolCallId: string;
    toolName: string;
    result: any;
    duration: number;
  };

  // Token usage events (fired on completion)
  "usage:tokens": {
    type: "standalone" | "instance";
    timestamp: number;
    messageId?: string;
    model: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

/**
 * Type-safe event emitter for AI observability
 */
class AIEventClient extends EventEmitter {
  /**
   * Subscribe to AI events with type safety
   */
  on<K extends keyof AIEventMap>(
    event: K,
    listener: (data: AIEventMap[K]) => void
  ): this {
    return super.on(event, listener);
  }

  /**
   * Subscribe to AI events once with type safety
   */
  once<K extends keyof AIEventMap>(
    event: K,
    listener: (data: AIEventMap[K]) => void
  ): this {
    return super.once(event, listener);
  }

  /**
   * Emit AI events with type safety
   */
  emit<K extends keyof AIEventMap>(event: K, data: AIEventMap[K]): boolean {
    return super.emit(event, data);
  }

  /**
   * Remove event listener with type safety
   */
  off<K extends keyof AIEventMap>(
    event: K,
    listener: (data: AIEventMap[K]) => void
  ): this {
    return super.off(event, listener);
  }

  /**
   * Remove all listeners for an event or all events
   */
  removeAllListeners(event?: keyof AIEventMap): this {
    return super.removeAllListeners(event);
  }
}

/**
 * Global event client for AI observability and debugging
 * 
 * Subscribe to this event emitter to receive detailed information about:
 * - Chat completions (streaming and non-streaming)
 * - Stream chunks and content
 * - Tool calls and executions
 * - Token usage and costs
 * - Errors and finish reasons
 * 
 * @example
 * ```typescript
 * import { aiEventClient } from '@tanstack/ai/event-client';
 * 
 * // Listen to all stream chunks
 * aiEventClient.on('stream:chunk', (data) => {
 *   console.log('Chunk received:', data.chunk);
 * });
 * 
 * // Listen to token usage
 * aiEventClient.on('usage:tokens', (data) => {
 *   console.log('Tokens used:', data.usage.totalTokens);
 * });
 * 
 * // Listen to content deltas
 * aiEventClient.on('stream:content', (data) => {
 *   process.stdout.write(data.delta);
 * });
 * ```
 */
export const aiEventClient = new AIEventClient();

// Prevent too many listeners warning for observability use cases
aiEventClient.setMaxListeners(100);
