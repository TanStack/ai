// Shared conformance test-utils, mirroring the surface of `@tanstack/ai-react`'s
// own `tests/test-utils.ts`. The chunk/adapter helpers are vendored from
// ai-client (see `./_ai-client-test-utils`); `renderUseChat` is retargeted to
// octane's testing-library and the ported `useChat` hook.
export {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
} from './_ai-client-test-utils'

export function createInterruptResumeSnapshot() {
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
    resumeState: { threadId: 'thread-1', runId: 'run-1' },
    pendingInterrupts,
  }
}

import { renderHook, type RenderHookResult } from '@octanejs/testing-library'
import type { UseChatOptions, UseChatReturn } from '../../src/types'
import { useChat } from '../../src/use-chat.tsrx'

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
  // Defaulted rather than asserted with `options!`: `useChat` reads its options
  // eagerly, so a no-arg call would otherwise pass `undefined` straight through
  // and crash instead of failing at the type level.
  options: UseChatOptions = {},
): RenderHookResult<UseChatReturn, UseChatOptions> {
  return renderHook((hookOptions: UseChatOptions) => useChat(hookOptions), {
    initialProps: options,
  })
}
