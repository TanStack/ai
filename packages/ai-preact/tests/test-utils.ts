// Re-export test utilities from ai-client
import { renderHook } from '@testing-library/preact'
import { useChat } from '../src/use-chat'
import type { RenderHookResult } from '@testing-library/preact'
import type { UseChatOptions, UseChatReturn } from '../src/types'

import type { ChatResumeSnapshotV2 } from '@tanstack/ai-client'

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
