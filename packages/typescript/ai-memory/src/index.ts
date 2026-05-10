export { inMemoryMemoryAdapter } from './adapters/in-memory'

export {
  redisMemoryAdapter,
  type RedisMemoryAdapterOptions,
  type RedisLike,
} from './adapters/redis'

export type {
  MemoryAdapter,
  MemoryRecord,
  MemoryRecordPatch,
  MemoryScope,
  MemoryQuery,
  MemoryHit,
  MemoryKind,
  MemoryRole,
  MemoryEmbedder,
  MemoryOp,
  MemorySearchResult,
  MemoryListOptions,
  MemoryListResult,
} from '@tanstack/ai/memory'
