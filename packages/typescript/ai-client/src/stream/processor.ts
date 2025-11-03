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
 * Default parser - converts adapter StreamChunk format to processor format
 * Adapters emit chunks with types: "content", "tool_call", "done"
 * Processor expects chunks with types: "text", "tool-call-delta", "done"
 */
class DefaultStreamParser implements StreamParser {
  async *parse(stream: AsyncIterable<any>): AsyncIterable<StreamChunk> {
    for await (const chunk of stream) {
      // Pass through known processor format chunks
      if (
        chunk.type === "text" || 
        chunk.type === "tool-call-delta" || 
        chunk.type === "done" ||
        chunk.type === "approval-requested" ||
        chunk.type === "tool-input-available"
      ) {
        yield chunk as StreamChunk;
        continue;
      }

      // Convert adapter format: "content" to "text"
      if (chunk.type === "content" && chunk.content) {
        yield {
          type: "text",
          content: chunk.content,
        };
      }

      // Convert adapter format: "tool_call" to "tool-call-delta"
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
  private toolCalls: Map<string, InternalToolCallState> = new Map(); // Track by ID, not index
  private toolCallOrder: string[] = []; // Track order of tool call IDs

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
      
      case "done":
        // Response finished - just mark tool calls as complete
        // DON'T reset text - it might come after this event!
        this.completeAllToolCalls();
        break;
      
      case "approval-requested":
        this.handlers.onApprovalRequested?.(
          chunk.toolCallId!,
          chunk.toolName!,
          chunk.input!,
          chunk.approval!.id
        );
        break;
      
      case "tool-input-available":
        this.handlers.onToolInputAvailable?.(
          chunk.toolCallId!,
          chunk.toolName!,
          chunk.input!
        );
        break;
    }
  }

  /**
   * Handle a text content chunk
   */
  private handleTextChunk(content: string): void {
    // Text arriving means all current tool calls are complete
    this.completeAllToolCalls();

    // Don't accumulate - the content field already has the full text!
    // Just store it directly
    this.textContent = content;

    // Always emit - content is already accumulated
    this.emitTextUpdate();
  }

  /**
   * Handle a tool call delta chunk
   */
  private handleToolCallDelta(
    index: number,
    toolCall: { id: string; function: { name: string; arguments: string } }
  ): void {
    const toolCallId = toolCall.id;
    const existingToolCall = this.toolCalls.get(toolCallId);

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

      this.toolCalls.set(toolCallId, newToolCall);
      this.toolCallOrder.push(toolCallId); // Track order

      // Get actual index for this tool call (based on order)
      const actualIndex = this.toolCallOrder.indexOf(toolCallId);

      // Emit lifecycle event
      this.handlers.onToolCallStart?.(
        actualIndex,
        toolCall.id,
        toolCall.function.name
      );

      // Emit state change event
      this.handlers.onToolCallStateChange?.(
        actualIndex,
        toolCall.id,
        toolCall.function.name,
        initialState,
        toolCall.function.arguments,
        newToolCall.parsedArguments
      );

      // Emit initial delta
      if (toolCall.function.arguments) {
        this.handlers.onToolCallDelta?.(actualIndex, toolCall.function.arguments);
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

      // Get actual index for this tool call
      const actualIndex = this.toolCallOrder.indexOf(toolCallId);

      // Emit state change event
      this.handlers.onToolCallStateChange?.(
        actualIndex,
        existingToolCall.id,
        existingToolCall.name,
        existingToolCall.state,
        existingToolCall.arguments,
        existingToolCall.parsedArguments
      );

      // Emit delta
      if (toolCall.function.arguments) {
        this.handlers.onToolCallDelta?.(actualIndex, toolCall.function.arguments);
      }
    }
  }

  /**
   * Complete all tool calls except the specified ID
   */
  private completeToolCallsExcept(exceptId: string): void {
    this.toolCalls.forEach((toolCall, id) => {
      if (id !== exceptId && toolCall.state !== "input-complete") {
        const index = this.toolCallOrder.indexOf(id);
        this.completeToolCall(index, toolCall);
      }
    });
  }

  /**
   * Complete all tool calls
   */
  private completeAllToolCalls(): void {
    this.toolCalls.forEach((toolCall, id) => {
      if (toolCall.state !== "input-complete") {
        const index = this.toolCallOrder.indexOf(id);
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

    // Emit complete event
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
    this.handlers.onTextUpdate?.(this.textContent);
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
    this.toolCalls.clear();
    this.toolCallOrder = [];
    this.chunkStrategy.reset?.();
  }
}
