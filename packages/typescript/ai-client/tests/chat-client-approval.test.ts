import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { stream } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai'

function createMockConnectionAdapter(options: { chunks: StreamChunk[] }) {
  return stream(async function* () {
    for (const chunk of options.chunks) {
      yield chunk
    }
  })
}

function createApprovalToolCallChunks(
  toolCalls: Array<{
    id: string
    name: string
    arguments: string
    approvalId: string
  }>,
): StreamChunk[] {
  const chunks: StreamChunk[] = []
  const timestamp = Date.now()

  // Start assistant message
  chunks.push({
    type: 'content',
    id: 'msg-1',
    model: 'test-model',
    timestamp,
    delta: '',
    content: '',
    role: 'assistant',
  })

  for (const toolCall of toolCalls) {
    // 1. Tool Call Chunk
    chunks.push({
      type: 'tool_call',
      id: 'msg-1',
      model: 'test-model',
      timestamp,
      toolCall: {
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      },
      index: 0,
    })

    // 2. Approval Requested Chunk
    chunks.push({
      type: 'approval-requested',
      id: 'msg-1',
      model: 'test-model',
      timestamp,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: JSON.parse(toolCall.arguments),
      approval: {
        id: toolCall.approvalId,
        needsApproval: true,
      },
    } as any) // Cast to any if types are not perfectly aligned yet, or use correct type
  }

  // Done chunk
  chunks.push({
    type: 'done',
    id: 'msg-1',
    model: 'test-model',
    timestamp,
    finishReason: 'tool_calls',
  })

  return chunks
}

describe('ChatClient Approval Flow', () => {
  it('should execute client tool when approved', async () => {
    const toolName = 'delete_local_data'
    const toolCallId = 'call_123'
    const approvalId = 'approval_123'
    const input = { key: 'test-key' }

    const chunks = createApprovalToolCallChunks([
      {
        id: toolCallId,
        name: toolName,
        arguments: JSON.stringify(input),
        approvalId,
      },
    ])

    const adapter = createMockConnectionAdapter({ chunks })

    const execute = vi.fn().mockResolvedValue({ deleted: true })
    const clientTool = {
      name: toolName,
      description: 'Delete data',
      execute,
    }

    const client = new ChatClient({
      connection: adapter,
      tools: [clientTool],
    })

    // Start the flow
    await client.sendMessage('Delete data')

    // Wait for stream to finish (approval request should be pending)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify tool execution hasn't happened yet
    expect(execute).not.toHaveBeenCalled()

    // Approve the tool
    await client.addToolApprovalResponse({
      id: approvalId,
      approved: true,
    })

    // Wait for execution (this is where it currently hangs/fails)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Expect execute to have been called
    expect(execute).toHaveBeenCalledWith(input)
  })
})
