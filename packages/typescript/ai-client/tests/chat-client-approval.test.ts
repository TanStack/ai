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

/** Cast an event object to StreamChunk for type compatibility with EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

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
  chunks.push(
    asChunk({
      type: 'TEXT_MESSAGE_START',
      messageId: 'msg-1',
      role: 'assistant',
      timestamp,
    }),
  )

  for (const toolCall of toolCalls) {
    // 1. Tool Call Start
    chunks.push(
      asChunk({
        type: 'TOOL_CALL_START',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        model: 'test-model',
        timestamp,
      }),
    )

    // 2. Tool Call Args
    chunks.push(
      asChunk({
        type: 'TOOL_CALL_ARGS',
        toolCallId: toolCall.id,
        delta: toolCall.arguments,
        args: toolCall.arguments,
        model: 'test-model',
        timestamp,
      }),
    )

    // 3. Approval Requested (custom event)
    chunks.push(
      asChunk({
        type: 'CUSTOM',
        name: 'approval-requested',
        model: 'test-model',
        timestamp,
        value: {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: JSON.parse(toolCall.arguments),
          approval: {
            id: toolCall.approvalId,
            needsApproval: true,
          },
        },
      }),
    )
  }

  // Run Finished
  chunks.push(
    asChunk({
      type: 'RUN_FINISHED',
      runId: 'run-1',
      threadId: 'thread-1',
      model: 'test-model',
      timestamp,
      finishReason: 'tool_calls',
    }),
  )

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
