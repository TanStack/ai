import type { InterruptSubmissionError } from '../interrupts'
import type { ContentPart, StreamChunk, ToolOutputState } from '../types'

/**
 * Adapter / engine yield before normalize. Public StreamChunk is spec-only.
 * This type still allows the old extra fields.
 */
export type AdapterYieldChunk = StreamChunk & {
  model?: string
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  // `any` so TokenUsage adapter yields stay assignable after public usage[]
  usage?: any
  // Leftover text-message `content` is a string. ACTIVITY_SNAPSHOT.content is
  // a structured object. The leftover bag intersects every StreamChunk variant.
  content?: string | Record<string, any>
  args?: string
  toolName?: string
  toolCallName?: string
  index?: number
  input?: unknown
  output?: unknown
  result?: string | Array<ContentPart>
  state?: ToolOutputState | Record<string, unknown>
  stepId?: string
  stepType?: string
  delta?: string | ReadonlyArray<unknown>
  signature?: string
  error?: { message: string; code?: string }
  'tanstack:interruptErrors'?: ReadonlyArray<InterruptSubmissionError>
  threadId?: string
  runId?: string
}
