import { createD1Stores } from './d1'
import { createDurableObjectLockStore } from './locks'
import { createR2ArtifactStore, createR2BlobStore } from './r2'
import type {
  AIPersistence,
  AIPersistenceStores,
  ArtifactStore,
  BlobStore,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'
import type { R2BucketBinding } from './bindings'
import type { DurableObjectLockStoreOptions } from './locks'

export { createD1InterruptStore, createD1Stores } from './d1'
export type { D1InterruptStoreOptions } from './d1'
export {
  CloudflareLockDurableObject,
  createDurableObjectLockStore,
} from './locks'
export { createR2ArtifactStore, createR2BlobStore } from './r2'
export { d1Migrations } from './migrations'
export type { D1Migration } from './migrations'
export type { DurableObjectLockStoreOptions } from './locks'
export type { R2StoreOptions } from './r2'
export type {
  DurableObjectNamespaceBinding,
  DurableObjectStubBinding,
  LockDurableObjectState,
  LockDurableObjectStorage,
  R2BucketBinding,
  R2HttpMetadata,
  R2ListOptionsBinding,
  R2ListResultBinding,
  R2ObjectBodyBinding,
  R2ObjectMetadataBinding,
  R2PutOptions,
} from './bindings'

export interface CloudflarePersistenceOptions {
  d1?: D1Database
  r2?: R2BucketBinding
  durableObjects?: DurableObjectNamespace
  artifactPrefix?: string
  blobPrefix?: string
  lockOptions?: DurableObjectLockStoreOptions
}

interface D1Stores {
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
}

interface R2Stores {
  artifacts: ArtifactStore
  blobs: BlobStore
}

interface DurableObjectStores {
  locks: LockStore
}

type BindingStores<
  TOptions,
  TKey extends PropertyKey,
  TStores,
> = TKey extends keyof TOptions
  ? undefined extends TOptions[TKey]
    ? Partial<TStores>
    : TStores
  : {}

type Simplify<T> = { [TKey in keyof T]: T[TKey] }

export type CloudflarePersistenceStores<TOptions> = Simplify<
  BindingStores<TOptions, 'd1', D1Stores> &
    BindingStores<TOptions, 'r2', R2Stores> &
    BindingStores<TOptions, 'durableObjects', DurableObjectStores>
>

/**
 * Compose only the stores backed by the supplied Cloudflare bindings.
 * Binding keys remain exact in the return type, including optional bindings.
 */
export function cloudflarePersistence<
  const TOptions extends CloudflarePersistenceOptions,
>(options: TOptions): AIPersistence<CloudflarePersistenceStores<TOptions>>
export function cloudflarePersistence(
  options: CloudflarePersistenceOptions,
): AIPersistence {
  const stores: AIPersistenceStores = {}
  if (options.d1) Object.assign(stores, createD1Stores(options.d1))
  if (options.r2) {
    stores.artifacts = createR2ArtifactStore(options.r2, {
      ...(options.artifactPrefix ? { prefix: options.artifactPrefix } : {}),
    })
    stores.blobs = createR2BlobStore(options.r2, {
      ...(options.blobPrefix ? { prefix: options.blobPrefix } : {}),
    })
  }
  if (options.durableObjects) {
    stores.locks = createDurableObjectLockStore(
      options.durableObjects,
      options.lockOptions,
    )
  }
  return { stores }
}
