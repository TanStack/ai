import type { LockStore, ModelMessage, TokenUsage } from '@tanstack/ai'

export type PersistenceMode = 'messages' | 'chat' | 'agent'

export type PersistenceFeature =
  | 'messages'
  | 'interrupts'
  | 'metadata'
  | 'locks'
  | 'artifacts'
  | 'blobs'

export interface MessageStore {
  loadThread: (threadId: string) => Promise<Array<ModelMessage>>
  saveThread: (threadId: string, messages: Array<ModelMessage>) => Promise<void>
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'interrupted'

export interface RunRecord {
  runId: string
  threadId: string
  status: RunStatus
  startedAt: number
  finishedAt?: number
  error?: string
  usage?: TokenUsage
}

export interface RunStore {
  createOrResume: (
    input: Pick<RunRecord, 'runId' | 'threadId'> & {
      status?: RunStatus
      startedAt: number
    },
  ) => Promise<RunRecord>
  update: (
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ) => Promise<void>
  get: (runId: string) => Promise<RunRecord | null>
}

export interface InterruptRecord {
  interruptId: string
  runId: string
  threadId: string
  status: 'pending' | 'resolved' | 'cancelled'
  requestedAt: number
  resolvedAt?: number
  payload: Record<string, unknown>
  response?: unknown
}

export interface InterruptStore {
  create: (record: Omit<InterruptRecord, 'resolvedAt'>) => Promise<void>
  resolve: (interruptId: string, response?: unknown) => Promise<void>
  cancel: (interruptId: string) => Promise<void>
  get: (interruptId: string) => Promise<InterruptRecord | null>
  list: (threadId: string) => Promise<Array<InterruptRecord>>
  listPending: (threadId: string) => Promise<Array<InterruptRecord>>
  listByRun: (runId: string) => Promise<Array<InterruptRecord>>
  listPendingByRun: (runId: string) => Promise<Array<InterruptRecord>>
}

export interface MetadataStore {
  get: (scope: string, key: string) => Promise<unknown | null>
  set: (scope: string, key: string, value: unknown) => Promise<void>
  delete: (scope: string, key: string) => Promise<void>
}

export interface ArtifactRecord {
  artifactId: string
  runId: string
  threadId: string
  name: string
  mimeType: string
  size: number
  bytes?: Uint8Array
  externalUrl?: string
  createdAt: number
}

export interface ArtifactStore {
  save: (record: ArtifactRecord) => Promise<void>
  get: (artifactId: string) => Promise<ArtifactRecord | null>
  list: (runId: string) => Promise<Array<ArtifactRecord>>
  delete?: (artifactId: string) => Promise<void>
  deleteForRun?: (runId: string) => Promise<void>
}

export type BlobBody =
  | ReadableStream<Uint8Array>
  | ArrayBuffer
  | ArrayBufferView
  | string
  | Blob
  | Uint8Array

export interface BlobRecord {
  key: string
  size?: number
  etag?: string
  contentType?: string
  customMetadata?: Record<string, string>
  createdAt?: number
  updatedAt?: number
}

export interface BlobObject extends BlobRecord {
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
  body?: ReadableStream<Uint8Array>
}

export interface BlobListPage {
  objects: Array<BlobRecord>
  cursor?: string
  truncated?: boolean
}

export interface BlobPutOptions {
  contentType?: string
  customMetadata?: Record<string, string>
}

export interface BlobListOptions {
  prefix?: string
  cursor?: string
  limit?: number
}

export interface BlobStore {
  put: (
    key: string,
    body: BlobBody,
    options?: BlobPutOptions,
  ) => Promise<BlobRecord>
  get: (key: string) => Promise<BlobObject | null>
  head: (key: string) => Promise<BlobRecord | null>
  delete: (key: string) => Promise<void>
  list: (options?: BlobListOptions) => Promise<BlobListPage>
}

export interface AIPersistence {
  stores: {
    messages?: MessageStore
    runs?: RunStore
    interrupts?: InterruptStore
    metadata?: MetadataStore
    locks?: LockStore
    artifacts?: ArtifactStore
    blobs?: BlobStore
  }
}

/** @deprecated Use AIPersistence. */
export type ChatPersistence = AIPersistence

const featureRequirements: Record<
  PersistenceFeature,
  Array<keyof AIPersistence['stores']>
> = {
  messages: ['messages'],
  interrupts: ['runs', 'interrupts'],
  metadata: ['metadata'],
  locks: ['locks'],
  artifacts: ['artifacts'],
  blobs: ['blobs'],
}

export function validatePersistenceFeatures(
  persistence: AIPersistence,
  features: Array<PersistenceFeature>,
): void {
  const missing = new Map<
    PersistenceFeature,
    Array<keyof AIPersistence['stores']>
  >()
  for (const feature of features) {
    const missingStores = featureRequirements[feature].filter(
      (store) => !persistence.stores[store],
    )
    if (missingStores.length > 0) {
      missing.set(feature, missingStores)
    }
  }
  if (missing.size === 0) return

  const details = [...missing]
    .map(
      ([feature, stores]) =>
        `${feature} requires ${stores.map((s) => `stores.${s}`).join(', ')}`,
    )
    .join('; ')
  throw new Error(`AIPersistence is missing required stores: ${details}`)
}

export function defineAIPersistence(persistence: AIPersistence): AIPersistence {
  return persistence
}

/**
 * @deprecated Use defineAIPersistence.
 * @alias
 */
export const defineChatPersistence = defineAIPersistence
