/**
 * Stream Processor Types
 *
 * Core types for the stream processing system that handles:
 * - Tool call lifecycle tracking
 * - Text content chunking strategies
 * - Parallel tool call support
 */

/**
 * Raw events that come from the stream
 */
export interface StreamChunk {
  type: "text" | "tool-call-delta";
  content?: string;
  toolCallIndex?: number;
  toolCall?: {
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  };
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
  onToolCallStart?: (index: number, id: string, name: string) => void;
  onToolCallDelta?: (index: number, args: string) => void;
  onToolCallComplete?: (
    index: number,
    id: string,
    name: string,
    args: string
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
}

/**
 * Internal state for a tool call being tracked
 */
export interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  complete: boolean;
}
