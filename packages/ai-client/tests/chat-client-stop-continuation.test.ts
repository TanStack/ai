import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'

describe('stop() vs queued continuation', () => {
  it('does not auto-continue a legacy approval queued before stop()', async () => {
    const contexts: Array<RunAgentInputContext | undefined> = []
    let calls = 0
    let releaseFirstRun!: () => void
    const firstRunHold = new Promise<void>((resolve) => {
      releaseFirstRun = resolve
    })
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal, context) {
        contexts.push(context)
        calls += 1
        const runId = context?.runId ?? `run-${calls}`
        const threadId = context?.threadId ?? 'thread-1'
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        if (calls === 1) {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'tc-1',
            toolCallName: 'dangerous_tool',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'tc-1',
            delta: '{}',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'tc-1',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.CUSTOM,
            name: 'approval-requested',
            value: {
              toolCallId: 'tc-1',
              toolName: 'dangerous_tool',
              input: {},
              approval: { id: 'approval-1', needsApproval: true },
            },
            timestamp: Date.now(),
          }
          await firstRunHold
          if (abortSignal?.aborted) return
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            metadata: { tanstack: { finishReason: 'tool_calls' } },
          }
          return
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: `msg-${calls}`,
          role: 'assistant',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: `msg-${calls}`,
          delta: 'ok',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: `msg-${calls}`,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      },
    }

    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
    })

    const send = client.sendMessage('start')
    await vi.waitFor(() => {
      const hasApproval = client
        .getMessages()
        .some((message) =>
          message.parts.some(
            (part) =>
              part.type === 'tool-call' && part.approval?.id === 'approval-1',
          ),
        )
      expect(hasApproval).toBe(true)
      expect(client.getIsLoading()).toBe(true)
    })
    await client.addToolApprovalResponse({
      id: 'approval-1',
      approved: true,
    })
    client.stop()
    releaseFirstRun()
    await send
    await Promise.resolve()
    await Promise.resolve()

    expect(calls).toBe(1)
    expect(contexts).toHaveLength(1)

    await client.sendMessage('later')
    expect(calls).toBe(2)
    expect(contexts[1]?.parentRunId).toBeUndefined()
    expect(contexts[1]?.resume).toBeUndefined()
  })
})
