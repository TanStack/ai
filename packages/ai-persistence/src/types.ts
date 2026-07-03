import type {
  LockStore,
  ModelMessage,
  StreamChunk,
  TokenUsage,
} from '@tanstack/ai'

export type PersistenceMode = 'messages' | 'chat' | 'agent'

export type PersistenceFeature =
  | 'messages'
  | 'durable-replay'
  | 'interrupts'
  | 'internal-events'
  | 'metadata'
  | 'locks'
  | 'artifacts'
  | 'blobs'

export class AppendConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppendConflictError'
  }
}

export interface PersistedPublicEvent {
  seq: number
  event: StreamChunk
  cursor: string
}

export interface PersistedInternalEvent {
  seq: number
  namespace: string
  type: string
  payload: unknown
  cursor: string
}

/** @deprecated Use PersistedPublicEvent. */
export type PersistedEvent = PersistedPublicEvent

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

export interface PublicEventStore {
  append: (input: {
    runId: string
    expectedSeq: number
    event: StreamChunk
  }) => Promise<PersistedPublicEvent>
  read: (
    runId: string,
    opts?: { afterSeq?: number },
  ) => AsyncIterable<PersistedPublicEvent>
  hasRun: (runId: string) => Promise<boolean>
  latestSeq: (runId: string) => Promise<number>
}

export interface InternalEventStore {
  append: (input: {
    runId: string
    expectedSeq: number
    namespace: string
    type: string
    payload: unknown
  }) => Promise<PersistedInternalEvent>
  read: (
    runId: string,
    opts?: { namespace?: string; afterSeq?: number },
  ) => AsyncIterable<PersistedInternalEvent>
  latestSeq: (runId: string, namespace?: string) => Promise<number>
}

/** @deprecated Use PublicEventStore. */
export type EventLog = PublicEventStore

export interface DurableRunStream {
  publish: (runId: string, seq: number, event: StreamChunk) => Promise<void>
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

/** @deprecated Use InterruptRecord. */
export interface ApprovalRecord {
  approvalId: string
  runId: string
  threadId: string
  status: 'pending' | 'granted' | 'denied'
  requestedAt: number
  resolvedAt?: number
  payload: Record<string, unknown>
}

/** @deprecated Use InterruptStore. */
export interface ApprovalStore {
  create: (record: Omit<ApprovalRecord, 'resolvedAt'>) => Promise<void>
  resolve: (approvalId: string, granted: boolean) => Promise<void>
  get: (approvalId: string) => Promise<ApprovalRecord | null>
  decisionsForThread: (threadId: string) => Promise<Map<string, boolean>>
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
    publicEvents?: PublicEventStore
    internalEvents?: InternalEventStore
    interrupts?: InterruptStore
    metadata?: MetadataStore
    locks?: LockStore
    artifacts?: ArtifactStore
    blobs?: BlobStore
  }
  stream?: DurableRunStream
}

/** @deprecated Use AIPersistence. */
export type ChatPersistence = AIPersistence

const featureRequirements: Record<PersistenceFeature, Array<string>> = {
  messages: ['messages'],
  'durable-replay': ['runs', 'publicEvents'],
  interrupts: ['runs', 'publicEvents', 'interrupts'],
  'internal-events': ['internalEvents'],
  metadata: ['metadata'],
  locks: ['locks'],
  artifacts: ['artifacts'],
  blobs: ['blobs'],
}

export function validatePersistenceFeatures(
  persistence: AIPersistence,
  features: Array<PersistenceFeature>,
): void {
  const missing = new Map<PersistenceFeature, Array<string>>()
  for (const feature of features) {
    const missingStores = featureRequirements[feature].filter(
      (store) => !persistence.stores[store as keyof AIPersistence['stores']],
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
