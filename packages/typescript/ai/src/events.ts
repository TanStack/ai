import { aiEventClient } from "./event-client.js";

/**
 * Abstract base class for AI event emission
 */
export abstract class AIEventEmitter {
  /**
   * Protected abstract method for emitting events
   * Implementations should handle adding timestamp
   */
  protected abstract emitEvent(
    eventName: string,
    data?: Record<string, any>
  ): void;

  /**
   * Emit chat started event
   */
  chatStarted(data: {
    requestId: string;
    model: string;
    messageCount: number;
    hasTools: boolean;
    streaming: boolean;
  }): void {
    this.emitEvent("chat:started", data);
  }

  /**
   * Emit stream started event
   */
  streamStarted(data: {
    streamId: string;
    model: string;
    provider: string;
  }): void {
    this.emitEvent("stream:started", data);
  }

  /**
   * Emit stream chunk content event
   */
  streamChunkContent(data: {
    streamId: string;
    messageId?: string;
    content: string;
    delta?: string;
  }): void {
    this.emitEvent("stream:chunk:content", data);
  }

  /**
   * Emit stream chunk tool call event
   */
  streamChunkToolCall(data: {
    streamId: string;
    messageId?: string;
    toolCallId: string;
    toolName: string;
    index: number;
    arguments: string;
  }): void {
    this.emitEvent("stream:chunk:tool-call", data);
  }

  /**
   * Emit stream chunk tool result event
   */
  streamChunkToolResult(data: {
    streamId: string;
    messageId?: string;
    toolCallId: string;
    result: string;
  }): void {
    this.emitEvent("stream:chunk:tool-result", data);
  }

  /**
   * Emit stream chunk done event
   */
  streamChunkDone(data: {
    streamId: string;
    messageId?: string;
    finishReason: string | null;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }): void {
    this.emitEvent("stream:chunk:done", data);
  }

  /**
   * Emit stream chunk error event
   */
  streamChunkError(data: {
    streamId: string;
    messageId?: string;
    error: string;
  }): void {
    this.emitEvent("stream:chunk:error", data);
  }

  /**
   * Emit chat iteration event
   */
  chatIteration(data: {
    requestId: string;
    iterationNumber: number;
    messageCount: number;
    toolCallCount: number;
  }): void {
    this.emitEvent("chat:iteration", data);
  }

  /**
   * Emit stream approval requested event
   */
  streamApprovalRequested(data: {
    streamId: string;
    messageId?: string;
    toolCallId: string;
    toolName: string;
    input: any;
    approvalId: string;
  }): void {
    this.emitEvent("stream:approval-requested", data);
  }

  /**
   * Emit stream tool input available event
   */
  streamToolInputAvailable(data: {
    streamId: string;
    toolCallId: string;
    toolName: string;
    input: any;
  }): void {
    this.emitEvent("stream:tool-input-available", data);
  }

  /**
   * Emit tool call completed event
   */
  toolCallCompleted(data: {
    streamId: string;
    toolCallId: string;
    toolName: string;
    result: any;
    duration: number;
  }): void {
    this.emitEvent("tool:call-completed", data);
  }

  /**
   * Emit stream ended event
   */
  streamEnded(data: {
    streamId: string;
    totalChunks: number;
    duration: number;
  }): void {
    this.emitEvent("stream:ended", data);
  }

  /**
   * Emit chat completed event
   */
  chatCompleted(data: {
    requestId: string;
    model: string;
    content: string;
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }): void {
    this.emitEvent("chat:completed", data);
  }

  /**
   * Emit usage tokens event
   */
  usageTokens(data: {
    requestId: string;
    model: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }): void {
    this.emitEvent("usage:tokens", data);
  }
}

/**
 * Default implementation of AIEventEmitter
 */
export class DefaultAIEventEmitter extends AIEventEmitter {
  /**
   * Emit an event with automatic timestamp
   */
  protected emitEvent(
    eventName: string,
    data?: Record<string, any>
  ): void {
    aiEventClient.emit(eventName as any, {
      ...data,
      timestamp: Date.now(),
    });
  }
}

