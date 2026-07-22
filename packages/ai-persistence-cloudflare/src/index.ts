import { createD1Stores } from './d1'
import { createDurableObjectLockStore } from './locks'
import type {
  AIPersistence,
  AIPersistenceStores,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai-persistence'
import type { DurableObjectLockStoreOptions } from './locks'

export { createD1Stores } from './d1'
export {
  CloudflareLockDurableObject,
  createDurableObjectLockStore,
} from './locks'
export { d1Migrations } from './migrations'
export type { D1Migration } from './migrations'
export type { DurableObjectLockStoreOptions } from './locks'
export type {
  DurableObjectNamespaceBinding,
  DurableObjectStubBinding,
  LockDurableObjectState,
  LockDurableObjectStorage,
} from './bindings'

export interface CloudflarePersistenceOptions {
  d1?: D1Database
  durableObjects?: DurableObjectNamespace
  lockOptions?: DurableObjectLockStoreOptions
}

interface D1Stores {
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
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
  if (options.durableObjects) {
    stores.locks = createDurableObjectLockStore(
      options.durableObjects,
      options.lockOptions,
    )
  }
  return { stores }
}
