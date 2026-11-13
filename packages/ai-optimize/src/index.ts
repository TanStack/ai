// Public API — deterministic, optimization-driven tool-result context projection.

// Projection combinators — the only way to build a FieldProjection.
export {
  truncateHead,
  truncateTail,
  truncateHeadTail,
  dropWithRef,
  aboveTokens,
} from './builders'
export type { StrategyOptions } from './builders'

export { optimize } from './optimize'
export type { OptimizeResult } from './optimize'

export { createContextRuntime } from './runtime'
export type { ContextRuntime } from './runtime'

export { createRetrieveTool, RETRIEVE_TOOL_NAME } from './retrieve-tool'

export { PolicyResolver } from './policies'
export type { PolicyTool } from './policies'

// Pure projection engine (exported for testing + advanced reuse).
export {
  projectToolResult,
  projectToolCallArgs,
  truncateValue,
} from './project'
export type { ToolResultState } from './project'

export { createStash, makeRef } from './stash'
export type { Stash, StashEntry } from './stash'

export {
  estimateTokens,
  estimateChars,
  TEXT_DIVISOR,
  JSON_DIVISOR,
} from './estimate'

export { OPTIMIZE_RECORD_TYPE, optimizeRecord } from './record'
export type { OptimizeRecord } from './record'

export type {
  OptimizationEvent,
  OptimizeConfig,
  OptimizeDefaults,
  OptimizeToolOverride,
  ResolvedFieldProjection,
  ResolvedResultPolicy,
  ResolvedArgsPolicy,
  FieldProjection,
} from './types'

// Re-export the core optimization types for convenience.
export type { TruncateStrategy, ToolContextPolicy } from '@tanstack/ai'
