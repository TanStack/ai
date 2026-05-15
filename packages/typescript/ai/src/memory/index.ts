export type {
  MemoryScope,
  MemoryKind,
  MemoryRole,
  MemoryRecord,
  MemoryRecordPatch,
  MemoryHit,
  MemoryQuery,
  MemorySearchResult,
  MemoryListOptions,
  MemoryListResult,
  MemoryAdapter,
  MemoryEmbedder,
  MemoryOp,
  MemoryMiddlewareOptions,
} from './types'

export {
  scopeMatches,
  cosine,
  lexicalOverlap,
  recencyScore,
  isExpired,
  defaultRenderMemory,
  defaultScoreHit,
} from './helpers'

export { memoryMiddleware } from './middleware'
