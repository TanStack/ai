// Re-export test utilities from ai-client
import { renderHook } from '@testing-library/preact'
import { useChat } from '../src/use-chat'
import type { RenderHookResult } from '@testing-library/preact'
import type { UseChatOptions, UseChatReturn } from '../src/types'

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
export function renderUseChat(
  options: UseChatOptions = {} as UseChatOptions,
): RenderHookResult<UseChatReturn, UseChatOptions> {
  return renderHook(() => useChat(options))
}
