// Re-export test utilities from ai-client
import { renderHook } from '@solidjs/testing-library'
import { useChat } from '../src/use-chat'
import type { UseChatOptions } from '../src/types'

import type { ChatResumeSnapshotV2 } from '@tanstack/ai-client'

export {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
  type MockConnectionAdapterOptions,
} from '../../ai-client/tests/test-utils'

export function createInterruptResumeSnapshot(): ChatResumeSnapshotV2 {
  const pendingInterrupts = [
    {
      id: 'staged-interrupt',
      reason: 'confirmation',
      metadata: {
        'tanstack:interruptBinding': {
          kind: 'generic' as const,
          interruptId: 'staged-interrupt',
          interruptedRunId: 'run-1',
          generation: 1,
          responseSchemaHash: 'none',
        },
      },
    },
    {
      id: 'invalid-interrupt',
      reason: 'confirmation',
      metadata: {
        'tanstack:interruptBinding': {
          kind: 'generic' as const,
          interruptId: 'invalid-interrupt',
          interruptedRunId: 'run-1',
          generation: 1,
          responseSchemaHash: 'none',
        },
      },
    },
  ]
  return {
    schemaVersion: 2,
    resumeState: { threadId: 'thread-1', runId: 'run-1' },
    pendingInterrupts,
  }
}

/**
 * Render the useChat hook with testing utilities
 *
 * @example
 * ```typescript
 * const { result } = renderUseChat({
 *   connection: createMockConnectionAdapter({ chunks: [...] })
 * });
 *
 * await result.current.sendMessage("Hello");
 * ```
 */
export function renderUseChat(options?: UseChatOptions) {
  const rendered = renderHook(() => useChat(options))

  // Adapt SolidJS hook result to React-like API for test compatibility
  return {
    result: {
      get current() {
        const hook = rendered.result
        return {
          messages: hook.messages(),
          isLoading: hook.isLoading(),
          error: hook.error(),
          status: hook.status(),
          isSubscribed: hook.isSubscribed(),
          connectionStatus: hook.connectionStatus(),
          sessionGenerating: hook.sessionGenerating(),
          sendMessage: hook.sendMessage,
          append: hook.append,
          reload: hook.reload,
          stop: hook.stop,
          clear: hook.clear,
          setMessages: hook.setMessages,
          addToolResult: hook.addToolResult,
          addToolApprovalResponse: hook.addToolApprovalResponse,
        }
      },
    },
    rerender: (_newOptions?: UseChatOptions) => {
      // SolidJS doesn't have a rerender concept in the same way React does
      // The signals are already reactive, so we just return the same result
      return rendered
    },
    unmount: rendered.cleanup,
  }
}
