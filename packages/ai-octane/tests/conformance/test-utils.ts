// Shared conformance test-utils, mirroring the surface of `@tanstack/ai-react`'s
// own `tests/test-utils.ts`. The chunk/adapter helpers are vendored from
// ai-client (see `./_ai-client-test-utils`); `renderUseChat` is retargeted to
// octane's testing-library and the ported `useChat` hook.
export {
	createMockConnectionAdapter,
	createTextChunks,
	createToolCallChunks,
} from './_ai-client-test-utils';

import { renderHook, type RenderHookResult } from '@octanejs/testing-library';
import type { UseChatOptions, UseChatReturn } from '../../src/types';
import { useChat } from '../../src/use-chat.tsrx';

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
	options?: UseChatOptions,
): RenderHookResult<UseChatReturn, UseChatOptions> {
	return renderHook((hookOptions: UseChatOptions) => useChat(hookOptions), {
		initialProps: options!,
	});
}
