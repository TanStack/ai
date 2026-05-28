/**
 * @tanstack/ai-isolate-daytona
 *
 * Daytona sandbox driver for TanStack AI Code Mode.
 * Execute LLM-generated code inside a caller-provided Daytona sandbox.
 *
 * @example
 * ```typescript
 * import { createDaytonaIsolateDriver } from '@tanstack/ai-isolate-daytona'
 *
 * const driver = createDaytonaIsolateDriver({ sandbox })
 * ```
 *
 * @packageDocumentation
 */

export {
  createDaytonaIsolateDriver,
  type DaytonaIsolateDriverConfig,
} from './isolate-driver'

export type {
  DaytonaCodeRunArtifacts,
  DaytonaCodeRunParams,
  DaytonaCodeRunResponse,
  DaytonaProcessLike,
  DaytonaSandboxLike,
} from './types'

export type {
  ExecutionResult,
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
  NormalizedError,
} from '@tanstack/ai-code-mode'
