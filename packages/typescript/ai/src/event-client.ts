import { EventClient } from '@tanstack/devtools-event-client'

/**
 * Tool call states - track the lifecycle of a tool call
 * Must match @tanstack/ai-client ToolCallState
 */
type ToolCallState =
  | 'awaiting-input' // Received start but no arguments yet
  | 'input-streaming' // Partial arguments received
  | 'input-complete' // All arguments received
  | 'approval-requested' // Waiting for user approval
  | 'approval-responded' // User has approved/denied

/**
 * Tool result states - track the lifecycle of a tool result
 * Must match @tanstack/ai-client ToolResultState
 */
type ToolResultState =
  | 'streaming' // Placeholder for future streamed output
  | 'complete' // Result is complete
  | 'error' // Error occurred

export interface AIDevtoolsEventMap {
  // AI Stream events - from @tanstack/ai package
  'tanstack-ai-devtools:stream:started': {
    streamId: string
    model: string
    provider: string
    timestamp: number
    clientId?: string
  }
  'tanstack-ai-devtools:stream:chunk:content': {
    streamId: string
    messageId?: string
    content: string
    delta?: string
    timestamp: number
  }
  'tanstack-ai-devtools:stream:chunk:tool-call': {
    streamId: string
    messageId?: string
    toolCallId: string
    toolName: string
    index: number
    arguments: string
    timestamp: number
  }
  'tanstack-ai-devtools:stream:chunk:tool-result': {
    streamId: string
    messageId?: string
    toolCallId: string
    result: string
    timestamp: number
  }
  'tanstack-ai-devtools:stream:chunk:done': {
    streamId: string
    messageId?: string
    finishReason: string | null
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
    timestamp: number
  }
  'tanstack-ai-devtools:stream:chunk:error': {
    streamId: string
    messageId?: string
    error: string
    timestamp: number
  }
  'tanstack-ai-devtools:stream:chunk:thinking': {
    streamId: string
    messageId?: string
    content: string
    delta?: string
    timestamp: number
  }
  'tanstack-ai-devtools:stream:approval-requested': {
    streamId: string
    messageId?: string
    toolCallId: string
    toolName: string
    input: any
    approvalId: string
    timestamp: number
  }
  'tanstack-ai-devtools:stream:tool-input-available': {
    streamId: string
    messageId?: string
    toolCallId: string
    toolName: string
    input: any
    timestamp: number
  }
  'tanstack-ai-devtools:tool:call-completed': {
    requestId: string
    streamId: string
    messageId?: string
    toolCallId: string
    toolName: string
    result: any
    duration: number
    timestamp: number
  }
  'tanstack-ai-devtools:stream:ended': {
    requestId: string
    streamId: string
    totalChunks: number
    duration: number
    timestamp: number
  }
  'tanstack-ai-devtools:text:started': {
    requestId: string
    streamId: string
    provider: string
    model: string
    messageCount: number
    hasTools: boolean
    streaming: boolean
    timestamp: number
    clientId?: string
    toolNames?: Array<string>
    options?: Record<string, unknown>
    modelOptions?: Record<string, unknown>
  }
  'tanstack-ai-devtools:text:completed': {
    requestId: string
    streamId: string
    model: string
    content: string
    messageId?: string
    finishReason?: string
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
    timestamp: number
  }
  'tanstack-ai-devtools:text:iteration': {
    requestId: string
    streamId: string
    iterationNumber: number
    messageCount: number
    toolCallCount: number
    timestamp: number
  }
  'tanstack-ai-devtools:usage:tokens': {
    requestId: string
    streamId: string
    model: string
    messageId?: string
    usage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
    timestamp: number
  }

  // Summarize events
  'tanstack-ai-devtools:summarize:started': {
    requestId: string
    model: string
    inputLength: number
    timestamp: number
    clientId?: string
  }
  'tanstack-ai-devtools:summarize:completed': {
    requestId: string
    model: string
    inputLength: number
    outputLength: number
    duration: number
    timestamp: number
  }

  // Text Client events - from @tanstack/ai-client package
  'tanstack-ai-devtools:client:created': {
    clientId: string
    initialMessageCount: number
    timestamp: number
  }
  'tanstack-ai-devtools:client:message-appended': {
    clientId: string
    messageId: string
    role: 'user' | 'assistant' | 'system' | 'tool'
    contentPreview: string
    timestamp: number
  }
  'tanstack-ai-devtools:client:message-sent': {
    clientId: string
    messageId: string
    content: string
    timestamp: number
  }
  'tanstack-ai-devtools:client:loading-changed': {
    clientId: string
    isLoading: boolean
    timestamp: number
  }
  'tanstack-ai-devtools:client:error-changed': {
    clientId: string
    error: string | null
    timestamp: number
  }
  'tanstack-ai-devtools:client:messages-cleared': {
    clientId: string
    timestamp: number
  }
  'tanstack-ai-devtools:client:reloaded': {
    clientId: string
    fromMessageIndex: number
    timestamp: number
  }
  'tanstack-ai-devtools:client:stopped': {
    clientId: string
    timestamp: number
  }
  'tanstack-ai-devtools:tool:result-added': {
    clientId: string
    toolCallId: string
    toolName: string
    output: any
    state: 'output-available' | 'output-error'
    timestamp: number
  }
  'tanstack-ai-devtools:tool:approval-responded': {
    clientId: string
    approvalId: string
    toolCallId: string
    approved: boolean
    timestamp: number
  }
  'tanstack-ai-devtools:processor:text-updated': {
    streamId: string
    content: string
    timestamp: number
  }
  'tanstack-ai-devtools:processor:tool-call-state-changed': {
    streamId: string
    toolCallId: string
    toolName: string
    state: ToolCallState
    arguments: any
    timestamp: number
  }
  'tanstack-ai-devtools:processor:tool-result-state-changed': {
    streamId: string
    toolCallId: string
    content: any
    state: ToolResultState
    error?: string
    timestamp: number
  }
  'tanstack-ai-devtools:client:assistant-message-updated': {
    clientId: string
    messageId: string
    content: string
    timestamp: number
  }
  'tanstack-ai-devtools:client:tool-call-updated': {
    clientId: string
    messageId: string
    toolCallId: string
    toolName: string
    state: ToolCallState
    arguments: any
    timestamp: number
  }
  'tanstack-ai-devtools:client:approval-requested': {
    clientId: string
    messageId: string
    toolCallId: string
    toolName: string
    input: any
    approvalId: string
    timestamp: number
  }
}

class AiEventClient extends EventClient<AIDevtoolsEventMap> {
  constructor() {
    super({
      pluginId: 'tanstack-ai-devtools',
    })
  }
}

const aiEventClient = new AiEventClient()

export { aiEventClient }
