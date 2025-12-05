import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useChat } from '../src/use-chat'
import type { UseChatOptions } from '../src/types'

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
      messages: hook.messages,
      isLoading: hook.isLoading,
      error: hook.error,
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
