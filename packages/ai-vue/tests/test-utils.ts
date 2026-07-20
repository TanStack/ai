import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useChat } from '../src/use-chat'
import type { UseChatOptions } from '../src/types'
import type { ChatResumeSnapshotV2 } from '@tanstack/ai-client'

// Re-export test utilities from ai-client
export {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
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
    interruptState: {
      recoveryState: {
        schemaVersion: 1,
        state: 'pending',
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 1,
        pendingInterrupts,
      },
      drafts: [
        {
          interruptId: 'staged-interrupt',
          response: {
            interruptId: 'staged-interrupt',
            status: 'resolved',
            payload: { answer: 42 },
          },
          status: 'staged',
        },
        {
          interruptId: 'invalid-interrupt',
          response: null,
          status: 'error',
          error: {
            scope: 'item',
            interruptId: 'invalid-interrupt',
            code: 'invalid-payload',
            message: 'Invalid persisted response',
            source: 'client',
            retryable: false,
            threadId: 'thread-1',
            interruptedRunId: 'run-1',
            generation: 1,
          },
        },
      ],
    },
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
  const TestComponent = defineComponent({
    setup() {
      return {
        ...useChat(options),
      }
    },
    template: '<div></div>',
  })

  const wrapper = mount(TestComponent)

  const createResult = () => {
    const hook = wrapper.vm
    return {
      // Asserting to fix "cannot be named without a reference" error
      messages: hook.messages,
      isLoading: hook.isLoading,
      error: hook.error,
      status: hook.status,
      isSubscribed: hook.isSubscribed,
      connectionStatus: hook.connectionStatus,
      sessionGenerating: hook.sessionGenerating,
      sendMessage: hook.sendMessage,
      append: hook.append,
      reload: hook.reload,
      stop: hook.stop,
      clear: hook.clear,
      setMessages: hook.setMessages,
      addToolResult: hook.addToolResult,
      addToolApprovalResponse: hook.addToolApprovalResponse,
      interrupts: hook.interrupts,
      pendingInterrupts: hook.pendingInterrupts,
      interruptErrors: hook.interruptErrors,
      resuming: hook.resuming,
      resolveInterrupts: hook.resolveInterrupts,
      cancelInterrupts: hook.cancelInterrupts,
      retryInterrupts: hook.retryInterrupts,
      resumeInterruptsUnsafe: hook.resumeInterruptsUnsafe,
    }
  }

  // Adapt Vue composable result to React-like API for test compatibility
  return {
    result: {
      get current() {
        return createResult()
      },
    },
    rerender: (_newOptions?: UseChatOptions) => {
      // Vue doesn't have a rerender concept in the same way React does
      // The refs are already reactive, so we just return the same result
      return createResult()
    },
    unmount: () => wrapper.unmount(),
  }
}
