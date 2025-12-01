/**
 * Stream Processor Types
 *
 * Unified types for stream processing used by both server and client.
 * The canonical chunk format is StreamChunk from @tanstack/ai types.
 */

import type { StreamChunk, ToolCall } from '../types'

/**
 * Tool call states - track the lifecycle of a tool call
 */
export type ToolCallState =
  | 'awaiting-input' // Received start but no arguments yet
  | 'input-streaming' // Partial arguments received
  | 'input-complete' // All arguments received
  | 'approval-requested' // Waiting for user approval
  | 'approval-responded' // User has approved/denied

/**
 * Tool result states - track the lifecycle of a tool result
 */
export type ToolResultState =
  | 'streaming' // Placeholder for future streamed output
  | 'complete' // Result is complete
  | 'error' // Error occurred

/**
 * Internal state for a tool call being tracked
 */
export interface InternalToolCallState {
  id: string
  name: string
  arguments: string
  state: ToolCallState
  parsedArguments?: any
  index: number
}

/**
 * Strategy for determining when to emit text updates
 */
export interface ChunkStrategy {
  /**
   * Called for each text chunk received
   * @param chunk - The new chunk of text (delta)
   * @param accumulated - All text accumulated so far
   * @returns true if an update should be emitted now
   */
  shouldEmit: (chunk: string, accumulated: string) => boolean

  /**
   * Optional: Reset strategy state (called when streaming starts)
   */
  reset?: () => void
}

/**
 * Handlers for processed stream events
 */
export interface StreamProcessorHandlers {
  onTextUpdate?: (content: string) => void
  onThinkingUpdate?: (content: string) => void

  // Tool call lifecycle handlers
  onToolCallStart?: (index: number, id: string, name: string) => void
  onToolCallDelta?: (index: number, args: string) => void
  onToolCallComplete?: (
    index: number,
    id: string,
    name: string,
    args: string,
  ) => void
  onToolCallStateChange?: (
    index: number,
    id: string,
    name: string,
    state: ToolCallState,
    args: string,
    parsedArgs?: any,
  ) => void

  // Tool result handlers
  onToolResultStateChange?: (
    toolCallId: string,
    content: string,
    state: ToolResultState,
    error?: string,
  ) => void

  // Approval/client tool handlers
  onApprovalRequested?: (
    toolCallId: string,
    toolName: string,
    input: any,
    approvalId: string,
  ) => void
  onToolInputAvailable?: (
    toolCallId: string,
    toolName: string,
    input: any,
  ) => void

  // Stream lifecycle
  onStreamEnd?: (content: string, toolCalls?: Array<ToolCall>) => void
  onError?: (error: { message: string; code?: string }) => void
}

/**
 * Options for StreamProcessor
 */
export interface StreamProcessorOptions {
  chunkStrategy?: ChunkStrategy
  handlers?: StreamProcessorHandlers
  jsonParser?: {
    parse: (jsonString: string) => any
  }
  /** Enable recording for replay testing */
  recording?: boolean
}

/**
 * Result from processing a stream
 */
export interface ProcessorResult {
  content: string
  thinking?: string
  toolCalls?: Array<ToolCall>
  finishReason?: string | null
}

/**
 * Current state of the processor
 */
export interface ProcessorState {
  content: string
  thinking: string
  toolCalls: Map<string, InternalToolCallState>
  toolCallOrder: Array<string>
  finishReason: string | null
  done: boolean
}

/**
 * Recording format for replay testing
 */
export interface ChunkRecording {
  version: '1.0'
  timestamp: number
  model?: string
  provider?: string
  chunks: Array<{
    chunk: StreamChunk
    timestamp: number
    index: number
  }>
  result?: ProcessorResult
}
