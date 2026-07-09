/**
 * Prisma-backed **state** persistence for TanStack AI.
 *
 * Bring your own `PrismaClient`: add the model fragment shipped in this
 * package's `prisma/schema.prisma` to your own Prisma schema, run
 * `prisma migrate` through your normal workflow, then pass the generated
 * client to {@link prismaPersistence}. This wires the `AIPersistence` stores
 * (messages, runs, interrupts, metadata, artifacts, blobs) over it.
 *
 * The Prisma schema mirrors `@tanstack/ai-persistence-drizzle`'s exported
 * schema column-for-column — see coupling `persistence-schema-dual-source`.
 * Any change to one schema MUST be mirrored in the other, with regenerated
 * migrations for both ORMs and the shared conformance suite re-run.
 *
 * Locks are not part of the SQL schema — an in-memory lock is provided as a dev
 * default so the returned persistence is complete. Swap in a distributed lock
 * for multi-process deployments.
 */
import { InMemoryLockStore } from '@tanstack/ai'
import {
  createArtifactStore,
  createBlobStore,
  createInterruptStore,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './stores'
import type { PrismaClient } from '@prisma/client'
import type { AIPersistence } from '@tanstack/ai-persistence'

/** Wire the AIPersistence stores over an existing Prisma `PrismaClient`. */
export function prismaPersistence(prisma: PrismaClient): AIPersistence {
  return {
    stores: {
      messages: createMessageStore(prisma),
      runs: createRunStore(prisma),
      interrupts: createInterruptStore(prisma),
      metadata: createMetadataStore(prisma),
      artifacts: createArtifactStore(prisma),
      blobs: createBlobStore(prisma),
      locks: new InMemoryLockStore(),
    },
  }
}
