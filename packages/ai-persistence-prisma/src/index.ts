/**
 * Prisma-backed state persistence for TanStack AI.
 *
 * Add the provider-neutral {@link prismaModels} fragment to a Prisma multi-file
 * schema, run Prisma's normal migration workflow for your selected provider,
 * then pass the generated client to {@link prismaPersistence}.
 */
import { InMemoryLockStore } from '@tanstack/ai'
import { resolveDelegates } from './model-contract'
import {
  createArtifactStore,
  createBlobStore,
  createInterruptStore,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './stores'
import type { PrismaModelMap } from './model-contract'
import type { RunInterruptTransaction } from './stores'
import type { LockStore } from '@tanstack/ai'
import type { PrismaClient } from '@prisma/client'

export { prismaModels, prismaModelsFilename } from './models'
export { PrismaModelError } from './model-contract'
export type { PrismaModelMap } from './model-contract'

export interface PrismaPersistenceOptions {
  /**
   * Rename the TanStack AI models in your copy of the fragment — for example
   * to avoid a collision with an existing `Message` or `Run` model — and map
   * each store to the renamed client delegate here. Values are the camelCase
   * client accessor names: `model ChatMessage` → `{ messages: 'chatMessage' }`.
   * Keep the field names and types from the fragment; database table and
   * column names are already yours via `@@map` / `@map`.
   */
  models?: PrismaModelMap
}

/** Wire TanStack AI persistence stores over a migrated Prisma client. */
export function prismaPersistence(
  prisma: PrismaClient,
  options?: PrismaPersistenceOptions,
) {
  const delegates = resolveDelegates(prisma, options?.models)
  const runInterruptTransaction: RunInterruptTransaction = (operation) =>
    prisma.$transaction((transaction) =>
      operation(resolveDelegates(transaction, options?.models)),
    )
  const locks: LockStore = new InMemoryLockStore()
  return {
    stores: {
      messages: createMessageStore(delegates),
      runs: createRunStore(delegates),
      interrupts: createInterruptStore(delegates, runInterruptTransaction),
      metadata: createMetadataStore(delegates),
      artifacts: createArtifactStore(delegates),
      blobs: createBlobStore(delegates),
      locks,
    },
  }
}
