export interface ClientAssistantPlaceholderInput {
  role: string
  source: 'client' | 'server'
  content?: string
  toolCalls?: Array<unknown>
  parts?: Array<unknown>
}

export interface ClientToolCallMessageInput {
  messageId: string
  toolCallId: string
  toolName: string
  arguments: string
  state: string
  timestamp: number
  source: 'client' | 'server'
  requestId?: string
  approvalRequired?: boolean
  approvalId?: string
  approvalApproved?: boolean
}

export function createClientToolCallMessage(input: ClientToolCallMessageInput) {
  return {
    id: input.messageId,
    role: 'assistant' as const,
    content: '',
    timestamp: input.timestamp,
    parts: [],
    toolCalls: [
      {
        id: input.toolCallId,
        name: input.toolName,
        arguments: input.arguments,
        state: input.state,
        ...(input.approvalRequired !== undefined
          ? { approvalRequired: input.approvalRequired }
          : {}),
        ...(input.approvalId ? { approvalId: input.approvalId } : {}),
        ...(input.approvalApproved !== undefined
          ? { approvalApproved: input.approvalApproved }
          : {}),
      },
    ],
    source: input.source,
    ...(input.requestId ? { requestId: input.requestId } : {}),
  }
}

export function shouldSkipClientAssistantPlaceholder(
  message: ClientAssistantPlaceholderInput,
): boolean {
  return (
    message.role === 'assistant' &&
    message.source === 'client' &&
    !message.content &&
    (!message.toolCalls || message.toolCalls.length === 0) &&
    (!message.parts || message.parts.length === 0)
  )
}
