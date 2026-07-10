import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  MetadataStore,
} from '@tanstack/ai-persistence'
import type { WorkspacePersistence } from '../src/workspace-persistence'

type DeletableArtifactStore = ArtifactStore &
  Required<Pick<ArtifactStore, 'delete'>>

declare const complete: AIPersistence<{
  metadata: MetadataStore
  artifacts: DeletableArtifactStore
  blobs: BlobStore
}>
const accepted: WorkspacePersistence = complete

declare const missingBlobs: AIPersistence<{
  metadata: MetadataStore
  artifacts: DeletableArtifactStore
}>
// @ts-expect-error - workspace persistence requires a BlobStore for file bytes
const rejected: WorkspacePersistence = missingBlobs

void accepted
void rejected
