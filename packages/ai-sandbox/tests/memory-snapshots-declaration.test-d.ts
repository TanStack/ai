import { expectTypeOf } from 'vitest'
import type { MemorySandboxSnapshots } from '../src'
import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  GenerationRunStore,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '@tanstack/ai-persistence'

type MemoryPersistenceStores = {
  messages: MessageStore
  runs: RunStore
  generationRuns: GenerationRunStore
  interrupts: InterruptStore
  metadata: MetadataStore
  artifacts: ArtifactStore
  blobs: BlobStore
}

declare const snapshots: MemorySandboxSnapshots
expectTypeOf(snapshots.persistence).toMatchTypeOf<
  AIPersistence<MemoryPersistenceStores>
>()
expectTypeOf(snapshots.save).toBeFunction()
expectTypeOf(snapshots.fork).toBeFunction()
expectTypeOf(snapshots.readArtifact).toBeFunction()
// @ts-expect-error immutable identity fields are not patchable
snapshots.persistence.stores.generationRuns.update('run', { threadId: 'other' })
