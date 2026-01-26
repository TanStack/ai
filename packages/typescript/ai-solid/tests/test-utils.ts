// Re-export test utilities from ai-client
export {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
  type MockConnectionAdapterOptions,
} from '../../ai-client/tests/test-utils'

import { renderHook } from '@solidjs/testing-library'
import type { UseChatOptions } from '../src/types'
import { useChat } from '../src/use-chat'

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
    rerender: (newOptions?: UseChatOptions) => {
      // SolidJS doesn't have a rerender concept in the same way React does
      // The signals are already reactive, so we just return the same result
      return rendered
    },
    unmount: rendered.cleanup,
  }
}
