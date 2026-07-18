import { expectTypeOf } from 'vitest'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type {
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '@tanstack/ai-persistence'
import { drizzlePersistence, schema } from '../src/index'
import { sqlitePersistence } from '../src/sqlite'
import { schema as emittedSchema } from '../src/assets/tanstack-ai-schema'
import { variantSchema } from './variant-schema'
import type { TanstackAiSqliteSchema } from '../src/index'

declare const d1Database: DrizzleD1Database
const d1Persistence = drizzlePersistence(d1Database)
expectTypeOf(d1Persistence.stores.messages).toEqualTypeOf<MessageStore>()
expectTypeOf(d1Persistence.stores.runs).toEqualTypeOf<RunStore>()
expectTypeOf(d1Persistence.stores.interrupts).toEqualTypeOf<InterruptStore>()
expectTypeOf(d1Persistence.stores.metadata).toEqualTypeOf<MetadataStore>()
// No `locks` store: this backend has no distributed lock (see drizzlePersistence).
expectTypeOf(d1Persistence.stores).not.toHaveProperty('locks')

const sqlite = sqlitePersistence({ url: ':memory:', migrate: true })
expectTypeOf(sqlite.stores).toEqualTypeOf<typeof d1Persistence.stores>()
expectTypeOf(sqlite.close).toEqualTypeOf<() => void>()

// The bundled schema, the emitted schema asset, and a renamed/extended variant
// must all satisfy the injectable schema contract.
expectTypeOf(schema).toExtend<TanstackAiSqliteSchema>()
expectTypeOf(emittedSchema).toExtend<TanstackAiSqliteSchema>()
expectTypeOf(variantSchema).toExtend<TanstackAiSqliteSchema>()

const customPersistence = drizzlePersistence(d1Database, {
  schema: variantSchema,
})
expectTypeOf(customPersistence.stores).toEqualTypeOf<
  typeof d1Persistence.stores
>()
