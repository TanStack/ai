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
import { prismaPersistence } from '../src/index'
import type {
  ArtifactDelegate,
  BlobDelegate,
  InterruptDelegate,
  MessageDelegate,
  MetadataDelegate,
  RunDelegate,
} from '../src/model-contract'

declare const prisma: PrismaClient
const persistence = prismaPersistence(prisma)

// The generated client's delegates must satisfy the structural delegate
// contract the stores are written against — this is what makes renamed
// delegates from a user-generated client interchangeable with canonical ones.
expectTypeOf(prisma.message).toExtend<MessageDelegate>()
expectTypeOf(prisma.run).toExtend<RunDelegate>()
expectTypeOf(prisma.interrupt).toExtend<InterruptDelegate>()
expectTypeOf(prisma.metadata).toExtend<MetadataDelegate>()
expectTypeOf(prisma.artifact).toExtend<ArtifactDelegate>()
expectTypeOf(prisma.blob).toExtend<BlobDelegate>()

const mapped = prismaPersistence(prisma, {
  models: { messages: 'chatMessage' },
})
expectTypeOf(mapped.stores).toEqualTypeOf<typeof persistence.stores>()

expectTypeOf(persistence.stores.messages).toEqualTypeOf<MessageStore>()
expectTypeOf(persistence.stores.runs).toEqualTypeOf<RunStore>()
expectTypeOf(persistence.stores.interrupts).toEqualTypeOf<InterruptStore>()
expectTypeOf(persistence.stores.metadata).toEqualTypeOf<MetadataStore>()
expectTypeOf(persistence.stores.artifacts).toEqualTypeOf<ArtifactStore>()
expectTypeOf(persistence.stores.blobs).toEqualTypeOf<BlobStore>()
// No `locks` store: this backend has no distributed lock (see prismaPersistence).
expectTypeOf(persistence.stores).not.toHaveProperty('locks')
