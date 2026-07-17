/// <reference types="@cloudflare/workers-types" />
import { expectTypeOf } from 'vitest'
import { composePersistence } from '@tanstack/ai-persistence'
import {
  CloudflareLockDurableObject,
  cloudflarePersistence,
} from '../src/index'
import type {
  ArtifactStore,
  BlobStore,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'

declare const d1: D1Database
declare const r2: R2Bucket
declare const durableObjects: DurableObjectNamespace
declare const durableObjectState: DurableObjectState

new CloudflareLockDurableObject(durableObjectState)

expectTypeOf(cloudflarePersistence({}).stores).toEqualTypeOf<{}>()
expectTypeOf(cloudflarePersistence({ d1 }).stores).toEqualTypeOf<{
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
}>()
expectTypeOf(cloudflarePersistence({ r2 }).stores).toEqualTypeOf<{
  artifacts: ArtifactStore
  blobs: BlobStore
}>()
expectTypeOf(cloudflarePersistence({ durableObjects }).stores).toEqualTypeOf<{
  locks: LockStore
}>()
expectTypeOf(
  cloudflarePersistence({ d1, r2, durableObjects }).stores,
).toEqualTypeOf<{
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
  artifacts: ArtifactStore
  blobs: BlobStore
  locks: LockStore
}>()

declare const optionalD1: D1Database | undefined
expectTypeOf(cloudflarePersistence({ d1: optionalD1 }).stores).toEqualTypeOf<{
  messages?: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
  metadata?: MetadataStore
}>()

const d1Persistence = cloudflarePersistence({ d1 })
declare const customInterrupts: InterruptStore
const replaced = composePersistence(d1Persistence, {
  overrides: { interrupts: customInterrupts },
})
expectTypeOf(replaced.stores.interrupts).toEqualTypeOf<InterruptStore>()
expectTypeOf(replaced.stores.runs).toEqualTypeOf<RunStore>()

const removed = composePersistence(d1Persistence, {
  overrides: { interrupts: false },
})
expectTypeOf(removed.stores).toEqualTypeOf<{
  messages: MessageStore
  runs: RunStore
  metadata: MetadataStore
}>()
