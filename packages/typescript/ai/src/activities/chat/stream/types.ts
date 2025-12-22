/**
 * Stream Processor Types
 *
 * Unified types for stream processing used by both server and client.
 * The canonical chunk format is StreamChunk from @tanstack/ai types.
 */

import type {
  StreamChunk,
  ToolCall,
  ToolCallState,
  ToolResultState,
} from '../../../types'

// Re-export for backwards compatibility
export type { ToolCallState, ToolResultState }

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
