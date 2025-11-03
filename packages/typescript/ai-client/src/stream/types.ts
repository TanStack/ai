/**
 * Stream Processor Types
 *
 * Core types for the stream processing system that handles:
 * - Tool call lifecycle tracking with states
 * - Text content chunking strategies
 * - Parallel tool call support
 * - Partial JSON parsing for incomplete tool arguments
 */

import type { ToolCallState as ToolState, ToolResultState } from "../types";

/**
 * Raw events that come from the stream
 */
export interface StreamChunk {
  type: "text" | "tool-call-delta" | "done" | "approval-requested" | "tool-input-available";
  content?: string;
  toolCallIndex?: number;
  toolCall?: {
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  };
  // For approval-requested
  approval?: {
    id: string;
    needsApproval: boolean;
  };
  // For tool-input-available and approval-requested
  toolCallId?: string;
  toolName?: string;
  input?: any;
}

/**
 * Processed events emitted by the StreamProcessor
 */
export type ProcessedEvent =
  | { type: "text-chunk"; content: string }
  | { type: "text-update"; content: string } // Emitted based on chunk strategy
  | {
      type: "tool-call-start";
      index: number;
      id: string;
      name: string;
    }
  | {
      type: "tool-call-delta";
      index: number;
      arguments: string;
    }
  | {
      type: "tool-call-complete";
      index: number;
      id: string;
      name: string;
      arguments: string;
    }
  | { type: "stream-end"; finalContent: string; toolCalls?: any[] };

/**
 * Strategy for determining when to emit text updates
 */
export interface ChunkStrategy {
  /**
   * Called for each text chunk received
   * @param chunk - The new chunk of text
   * @param accumulated - All text accumulated so far
   * @returns true if an update should be emitted now
   */
  shouldEmit(chunk: string, accumulated: string): boolean;

  /**
   * Optional: Reset strategy state (called when streaming starts)
   */
  reset?(): void;
}

/**
 * Handlers for processed stream events
 */
export interface StreamProcessorHandlers {
  onTextUpdate?: (content: string) => void;
  
  // Enhanced tool call handlers with state tracking
  onToolCallStateChange?: (
    index: number,
    id: string,
    name: string,
    state: ToolState,
    args: string,
    parsedArgs?: any
  ) => void;
  
  onToolResultStateChange?: (
    toolCallId: string,
    content: string,
    state: ToolResultState,
    error?: string
  ) => void;
  
  // Additional handlers for detailed lifecycle events
  onToolCallStart?: (index: number, id: string, name: string) => void;
  onToolCallDelta?: (index: number, args: string) => void;
  onToolCallComplete?: (
    index: number,
    id: string,
    name: string,
    args: string
  ) => void;
  onApprovalRequested?: (
    toolCallId: string,
    toolName: string,
    input: any,
    approvalId: string
  ) => void;
  onToolInputAvailable?: (
    toolCallId: string,
    toolName: string,
    input: any
  ) => void;
  onStreamEnd?: (content: string, toolCalls?: any[]) => void;
}

/**
 * Custom stream parser interface
 * Allows users to provide their own parsing logic if needed
 */
export interface StreamParser {
  parse(stream: AsyncIterable<any>): AsyncIterable<StreamChunk>;
}

/**
 * Options for StreamProcessor
 */
export interface StreamProcessorOptions {
  chunkStrategy?: ChunkStrategy;
  parser?: StreamParser;
  handlers: StreamProcessorHandlers;
  jsonParser?: {
    parse(jsonString: string): any;
  };
}

/**
 * Internal state for a tool call being tracked
 */
export interface InternalToolCallState {
  id: string;
  name: string;
  arguments: string;
  state: ToolState;
  parsedArguments?: any; // Parsed (potentially incomplete) JSON
}
