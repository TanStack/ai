// Re-export test utilities from ai-client
export {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
  type MockConnectionAdapterOptions,
} from "../../ai-client/tests/test-utils";

import { renderHook, type RenderHookResult } from "@testing-library/react";
import type { UseChatOptions, UseChatReturn } from "../src/types";
import { useChat } from "../src/use-chat";

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
  options?: UseChatOptions
): RenderHookResult<UseChatReturn, UseChatOptions> {
  return renderHook(() => useChat(options));
}

