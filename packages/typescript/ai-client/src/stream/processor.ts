/**
 * Stream Processor
 *
 * Core stream processing engine with state machine for handling:
 * - Parallel tool calls
 * - Tool call lifecycle (start, streaming, complete)
 * - Configurable text chunking strategies
 * - Custom stream parsers
 */

import type {
  StreamChunk,
  StreamProcessorOptions,
  StreamProcessorHandlers,
  InternalToolCallState,
  ChunkStrategy,
  StreamParser,
} from "./types";
import type { ToolCallState } from "../types";
import { ImmediateStrategy } from "./chunk-strategies";
import { defaultJSONParser } from "../loose-json-parser";

/**
 * Default parser - expects chunks in the format emitted by processStream
 * Supports both new format (StreamChunk) and legacy format (from stream.ts)
 */
class DefaultStreamParser implements StreamParser {
  async *parse(stream: AsyncIterable<any>): AsyncIterable<StreamChunk> {
    for await (const chunk of stream) {
      // Already in StreamChunk format - pass through
      if (chunk.type === "text" || chunk.type === "tool-call-delta") {
        yield chunk as StreamChunk;
        continue;
      }

      // Legacy format: Convert "content" to "text"
      if (chunk.type === "content" && chunk.content) {
        yield {
          type: "text",
          content: chunk.content,
        };
      }

      // Legacy format: Convert "tool_call" to "tool-call-delta"
      if ((chunk.type === "tool_call" || chunk.type === "tool-call-delta") && chunk.toolCall) {
        yield {
          type: "tool-call-delta",
          toolCallIndex: chunk.index ?? chunk.toolCallIndex,
          toolCall: chunk.toolCall,
        };
      }
    }
  }
}

/**
 * StreamProcessor - State machine for processing AI response streams
 *
 * State tracking:
 * - Text content accumulation
 * - Multiple parallel tool calls
 * - Tool call completion detection
 *
 * Tool call completion is detected when:
 * 1. A new tool call starts at a different index
 * 2. Text content arrives
 * 3. Stream ends
 */
export class StreamProcessor {
  private chunkStrategy: ChunkStrategy;
  private parser: StreamParser;
  private handlers: StreamProcessorHandlers;
  private jsonParser: { parse(jsonString: string): any };

  // State
  private textContent: string = "";
  private pendingTextChunks: string = "";
  private toolCalls: Map<number, InternalToolCallState> = new Map();
  private lastToolCallIndex: number = -1;

  constructor(options: StreamProcessorOptions) {
    this.chunkStrategy = options.chunkStrategy || new ImmediateStrategy();
    this.parser = options.parser || new DefaultStreamParser();
    this.handlers = options.handlers;
    this.jsonParser = options.jsonParser || defaultJSONParser;
  }

  /**
   * Process a stream and emit events through handlers
   */
  async process(stream: AsyncIterable<any>): Promise<{
    content: string;
    toolCalls?: any[];
  }> {
    // Reset state
    this.reset();

    // Parse and process each chunk
    const parsedStream = this.parser.parse(stream);

    for await (const chunk of parsedStream) {
      this.processChunk(chunk);
    }

    // Stream ended - finalize everything
    this.finalizeStream();

    const toolCalls = this.getCompletedToolCalls();
    return {
      content: this.textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Process a single chunk from the stream
   */
  private processChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case "text":
        this.handleTextChunk(chunk.content!);
        break;

      case "tool-call-delta":
        this.handleToolCallDelta(chunk.toolCallIndex!, chunk.toolCall!);
        break;
    }
  }

  /**
   * Handle a text content chunk
   */
  private handleTextChunk(content: string): void {
    // Text arriving means all current tool calls are complete
    this.completeAllToolCalls();

    // Accumulate text
    this.textContent += content;
    this.pendingTextChunks += content;

    // Check if we should emit based on strategy
    if (this.chunkStrategy.shouldEmit(content, this.textContent)) {
      this.emitTextUpdate();
    }
  }

  /**
   * Handle a tool call delta chunk
   */
  private handleToolCallDelta(
    index: number,
    toolCall: { id: string; function: { name: string; arguments: string } }
  ): void {
    // If we're starting a new tool call at a different index, complete previous ones
    if (index !== this.lastToolCallIndex && this.lastToolCallIndex !== -1) {
      // New tool call index means previous tool calls at other indices are complete
      this.completeToolCallsExcept(index);
    }

    this.lastToolCallIndex = index;

    const existingToolCall = this.toolCalls.get(index);

    if (!existingToolCall) {
      // New tool call starting
      const initialState: ToolCallState = toolCall.function.arguments
        ? "input-streaming"
        : "awaiting-input";

      const newToolCall: InternalToolCallState = {
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        state: initialState,
        parsedArguments: undefined,
      };

      // Try to parse the arguments
      if (toolCall.function.arguments) {
        newToolCall.parsedArguments = this.jsonParser.parse(
          toolCall.function.arguments
        );
      }

      this.toolCalls.set(index, newToolCall);

      // Emit start event (legacy)
      this.handlers.onToolCallStart?.(
        index,
        toolCall.id,
        toolCall.function.name
      );

      // Emit state change event
      this.handlers.onToolCallStateChange?.(
        index,
        toolCall.id,
        toolCall.function.name,
        initialState,
        toolCall.function.arguments,
        newToolCall.parsedArguments
      );

      // Emit initial delta (legacy)
      if (toolCall.function.arguments) {
        this.handlers.onToolCallDelta?.(index, toolCall.function.arguments);
      }
    } else {
      // Continuing existing tool call
      const wasAwaitingInput = existingToolCall.state === "awaiting-input";
      
      existingToolCall.arguments += toolCall.function.arguments;
      
      // Update state
      if (wasAwaitingInput && toolCall.function.arguments) {
        existingToolCall.state = "input-streaming";
      }

      // Try to parse the updated arguments
      existingToolCall.parsedArguments = this.jsonParser.parse(
        existingToolCall.arguments
      );

      // Emit state change event
      this.handlers.onToolCallStateChange?.(
        index,
        existingToolCall.id,
        existingToolCall.name,
        existingToolCall.state,
        existingToolCall.arguments,
        existingToolCall.parsedArguments
      );

      // Emit delta (legacy)
      if (toolCall.function.arguments) {
        this.handlers.onToolCallDelta?.(index, toolCall.function.arguments);
      }
    }
  }

  /**
   * Complete all tool calls except the specified index
   */
  private completeToolCallsExcept(exceptIndex: number): void {
    this.toolCalls.forEach((toolCall, index) => {
      if (index !== exceptIndex && toolCall.state !== "input-complete") {
        this.completeToolCall(index, toolCall);
      }
    });
  }

  /**
   * Complete all tool calls
   */
  private completeAllToolCalls(): void {
    this.toolCalls.forEach((toolCall, index) => {
      if (toolCall.state !== "input-complete") {
        this.completeToolCall(index, toolCall);
      }
    });
  }

  /**
   * Mark a tool call as complete and emit event
   */
  private completeToolCall(index: number, toolCall: InternalToolCallState): void {
    toolCall.state = "input-complete";

    // Try final parse
    toolCall.parsedArguments = this.jsonParser.parse(toolCall.arguments);

    // Emit state change event
    this.handlers.onToolCallStateChange?.(
      index,
      toolCall.id,
      toolCall.name,
      "input-complete",
      toolCall.arguments,
      toolCall.parsedArguments
    );

    // Emit complete event (legacy)
    this.handlers.onToolCallComplete?.(
      index,
      toolCall.id,
      toolCall.name,
      toolCall.arguments
    );
  }

  /**
   * Emit pending text update
   */
  private emitTextUpdate(): void {
    if (this.pendingTextChunks) {
      this.handlers.onTextUpdate?.(this.textContent);
      this.pendingTextChunks = "";
    }
  }

  /**
   * Finalize the stream - complete all pending operations
   */
  private finalizeStream(): void {
    // Complete any remaining tool calls
    this.completeAllToolCalls();

    // Emit any pending text
    this.emitTextUpdate();

    // Emit stream end
    const toolCalls = this.getCompletedToolCalls();
    this.handlers.onStreamEnd?.(
      this.textContent,
      toolCalls.length > 0 ? toolCalls : undefined
    );
  }

  /**
   * Get completed tool calls in API format
   */
  private getCompletedToolCalls(): any[] {
    return Array.from(this.toolCalls.values())
      .filter((tc) => tc.state === "input-complete")
      .map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      }));
  }

  /**
   * Reset processor state
   */
  private reset(): void {
    this.textContent = "";
    this.pendingTextChunks = "";
    this.toolCalls.clear();
    this.lastToolCallIndex = -1;
    this.chunkStrategy.reset?.();
  }
}
