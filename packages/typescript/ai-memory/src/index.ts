export { inMemoryMemoryAdapter } from './adapters/in-memory'

export {
  redisMemoryAdapter,
  nodeRedisAsRedisLike,
  type RedisMemoryAdapterOptions,
  type RedisLike,
  type NodeRedisLike,
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
