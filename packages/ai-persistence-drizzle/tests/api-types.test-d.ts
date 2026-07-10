import { expectTypeOf } from 'vitest'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type {
  ArtifactStore,
  BlobStore,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'
import { drizzlePersistence } from '../src/index'
import { sqlitePersistence } from '../src/sqlite'

declare const d1Database: DrizzleD1Database
const d1Persistence = drizzlePersistence(d1Database)
expectTypeOf(d1Persistence.stores.messages).toEqualTypeOf<MessageStore>()
expectTypeOf(d1Persistence.stores.runs).toEqualTypeOf<RunStore>()
expectTypeOf(d1Persistence.stores.interrupts).toEqualTypeOf<InterruptStore>()
expectTypeOf(d1Persistence.stores.metadata).toEqualTypeOf<MetadataStore>()
expectTypeOf(d1Persistence.stores.artifacts).toEqualTypeOf<ArtifactStore>()
expectTypeOf(d1Persistence.stores.blobs).toEqualTypeOf<BlobStore>()
expectTypeOf(d1Persistence.stores.locks).toEqualTypeOf<LockStore>()

const sqlite = sqlitePersistence({ url: ':memory:', migrate: true })
expectTypeOf(sqlite.stores).toEqualTypeOf<typeof d1Persistence.stores>()
expectTypeOf(sqlite.close).toEqualTypeOf<() => void>()
