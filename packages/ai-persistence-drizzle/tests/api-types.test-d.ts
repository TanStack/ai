import { expectTypeOf } from 'vitest'
import { drizzlePersistence } from '../src/index'
import { sqlitePersistence } from '../src/sqlite'
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
import type { DrizzleTransactionExecutor } from '../src/index'

declare const d1Database: DrizzleD1Database
declare const transactionExecutor: DrizzleTransactionExecutor
const genericPersistence = drizzlePersistence(d1Database, {
  interrupts: transactionExecutor,
})
expectTypeOf(genericPersistence.stores.messages).toEqualTypeOf<MessageStore>()
expectTypeOf(genericPersistence.stores.runs).toEqualTypeOf<RunStore>()
expectTypeOf(
  genericPersistence.stores.interrupts,
).toEqualTypeOf<InterruptStore>()
expectTypeOf(genericPersistence.stores.metadata).toEqualTypeOf<MetadataStore>()
expectTypeOf(genericPersistence.stores.artifacts).toEqualTypeOf<ArtifactStore>()
expectTypeOf(genericPersistence.stores.blobs).toEqualTypeOf<BlobStore>()
expectTypeOf(genericPersistence.stores.locks).toEqualTypeOf<LockStore>()

const nonInterruptPersistence = drizzlePersistence(d1Database, {
  interrupts: false,
})
expectTypeOf(nonInterruptPersistence.stores.runs).toEqualTypeOf<RunStore>()
// @ts-expect-error an explicit non-interrupt factory has no interrupt store
nonInterruptPersistence.stores.interrupts

const missingExecutor = drizzlePersistence(d1Database)
expectTypeOf(missingExecutor).toEqualTypeOf<never>()

const sqlite = sqlitePersistence({ url: ':memory:', migrate: true })
expectTypeOf(sqlite.stores).toEqualTypeOf<typeof genericPersistence.stores>()
expectTypeOf(sqlite.close).toEqualTypeOf<() => void>()
