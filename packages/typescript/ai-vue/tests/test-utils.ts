import type { UIMessage } from '@tanstack/ai-client'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import type { UseChatOptions } from '../src/types'
import { useChat } from '../src/use-chat'

// Re-export test utilities from ai-client
export {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
} from '../../ai-client/tests/test-utils'

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
      messages: hook.messages as Array<UIMessage>,
      isLoading: hook.isLoading,
      error: hook.error,
      status: hook.status,
      sendMessage: hook.sendMessage,
      append: hook.append,
      reload: hook.reload,
      stop: hook.stop,
      clear: hook.clear,
      setMessages: hook.setMessages,
      addToolResult: hook.addToolResult,
      addToolApprovalResponse: hook.addToolApprovalResponse,
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
