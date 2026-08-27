import type {
  StreamChunk,
  ToolCall,
  ToolCallState,
  ToolResultState,
} from '../../../types'

// Re-export for backwards compatibility
export type { ToolCallState, ToolResultState }

export interface InternalToolCallState {
  id: string
  name: string
  arguments: string
  state: ToolCallState
  parsedArguments?: any
  index: number
  metadata?: Record<string, unknown>
}

export interface ChunkStrategy {
  shouldEmit: (chunk: string, accumulated: string) => boolean

  reset?: () => void
}

export interface MessageStreamState {
  id: string
  role: 'user' | 'assistant' | 'system'
  totalTextContent: string
  currentSegmentText: string
  lastEmittedText: string
  hasSeenReasoningEvents: boolean
  thinkingSteps: Map<string, string>
  thinkingStepSignatures: Map<string, string>
  thinkingStepOrder: Array<string>
  currentThinkingStepId: string | null
  toolCalls: Map<string, InternalToolCallState>
  toolCallOrder: Array<string>
  hasToolCallsSinceTextStart: boolean
  isComplete: boolean
}

export interface ProcessorResult {
  content: string
  thinking?: string
  toolCalls?: Array<ToolCall>
  finishReason?: string | null
}

export interface ProcessorState {
  content: string
  thinking: string
  toolCalls: Map<string, InternalToolCallState>
  toolCallOrder: Array<string>
  finishReason: string | null
  done: boolean
}

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
