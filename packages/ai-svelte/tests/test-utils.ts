// Re-export test utilities from ai-client
import type { ChatResumeSnapshotV2 } from '@tanstack/ai-client'

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
  }
}
