import { expectTypeOf } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type {
  ArtifactStore,
  BlobStore,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'
import { prismaPersistence } from '../src/index'

declare const prisma: PrismaClient
const persistence = prismaPersistence(prisma)

expectTypeOf(persistence.stores.messages).toEqualTypeOf<MessageStore>()
expectTypeOf(persistence.stores.runs).toEqualTypeOf<RunStore>()
expectTypeOf(persistence.stores.interrupts).toEqualTypeOf<InterruptStore>()
expectTypeOf(persistence.stores.metadata).toEqualTypeOf<MetadataStore>()
expectTypeOf(persistence.stores.artifacts).toEqualTypeOf<ArtifactStore>()
expectTypeOf(persistence.stores.blobs).toEqualTypeOf<BlobStore>()
expectTypeOf(persistence.stores.locks).toEqualTypeOf<LockStore>()
