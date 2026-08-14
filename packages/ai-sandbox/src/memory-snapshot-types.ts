import type {
  ModelMessage,
  RunRecord,
  RunStatus,
  RunStore,
  PersistedArtifactRef,
  TokenUsage,
} from '@tanstack/ai'

export interface MemoryMessageStore {
  loadThread: (threadId: string) => Promise<Array<ModelMessage>>
  saveThread: (threadId: string, messages: Array<ModelMessage>) => Promise<void>
}

export type MemoryRunRecord = RunRecord

export type MemoryRunStore = RunStore

export interface MemoryGenerationRunRecord {
  runId: string
  threadId: string
  activity: string
  provider: string
  model: string
  status: RunStatus
  startedAt: number
  finishedAt?: number
  error?: { message: string; code?: string }
  result?: unknown
  artifacts?: Array<PersistedArtifactRef>
  usage?: TokenUsage
}

export interface MemoryGenerationRunStore {
  createOrResume: (
    input: Pick<
      MemoryGenerationRunRecord,
      'runId' | 'threadId' | 'activity' | 'provider' | 'model' | 'startedAt'
    > & { status?: RunStatus },
  ) => Promise<MemoryGenerationRunRecord>
  update: (
    runId: string,
    patch: Partial<
      Pick<
        MemoryGenerationRunRecord,
        'status' | 'finishedAt' | 'error' | 'result' | 'artifacts' | 'usage'
      >
    >,
  ) => Promise<void>
  get: (runId: string) => Promise<MemoryGenerationRunRecord | null>
  findLatestForThread: (
    threadId: string,
  ) => Promise<MemoryGenerationRunRecord | null>
}

export interface MemoryInterruptRecord {
  interruptId: string
  runId: string
  threadId: string
  status: 'pending' | 'resolved' | 'cancelled'
  requestedAt: number
  resolvedAt?: number
  payload: Record<string, unknown>
  response?: unknown
}

export interface MemoryInterruptStore {
  create: (
    record: Omit<MemoryInterruptRecord, 'status' | 'resolvedAt'>,
  ) => Promise<void>
  resolve: (interruptId: string, response?: unknown) => Promise<void>
  cancel: (interruptId: string) => Promise<void>
  get: (interruptId: string) => Promise<MemoryInterruptRecord | null>
  list: (threadId: string) => Promise<Array<MemoryInterruptRecord>>
  listPending: (threadId: string) => Promise<Array<MemoryInterruptRecord>>
  listByRun: (runId: string) => Promise<Array<MemoryInterruptRecord>>
  listPendingByRun: (runId: string) => Promise<Array<MemoryInterruptRecord>>
}

export interface MemoryMetadataStore {
  get: (namespace: string, key: string) => Promise<unknown | null>
  set: (namespace: string, key: string, value: unknown) => Promise<void>
  delete: (namespace: string, key: string) => Promise<void>
}

export interface MemoryArtifactRecord {
  artifactId: string
  runId: string
  threadId: string
  blobKey?: string
  name: string
  mimeType: string
  size: number
  sourceUrl?: string
  createdAt: number
}

export interface MemoryArtifactStore {
  save: (record: MemoryArtifactRecord) => Promise<void>
  get: (artifactId: string) => Promise<MemoryArtifactRecord | null>
  list: (runId: string) => Promise<Array<MemoryArtifactRecord>>
  listForThread: (threadId: string) => Promise<Array<MemoryArtifactRecord>>
  delete: (artifactId: string) => Promise<void>
  deleteForRun: (runId: string) => Promise<void>
}

export type MemoryBlobBody =
  | ReadableStream<Uint8Array>
  | ArrayBuffer
  | ArrayBufferView
  | string
  | Blob
export interface MemoryBlobRecord {
  key: string
  size?: number
  etag?: string
  contentType?: string
  customMetadata?: Record<string, string>
  createdAt?: number
  updatedAt?: number
}
export interface MemoryBlobStore {
  put: (
    key: string,
    body: MemoryBlobBody,
    options?: {
      contentType?: string
      customMetadata?: Record<string, string>
      expectedLength?: number
    },
  ) => Promise<MemoryBlobRecord>
  get: (
    key: string,
    options?: { range?: { offset: number; length?: number } },
  ) => Promise<
    | (MemoryBlobRecord & {
        arrayBuffer: () => Promise<ArrayBuffer>
        text: () => Promise<string>
        body?: ReadableStream<Uint8Array>
        range?: { offset: number; length: number }
      })
    | null
  >
  head: (key: string) => Promise<MemoryBlobRecord | null>
  delete: (key: string) => Promise<void>
  list: (options?: {
    prefix?: string
    cursor?: string
    limit?: number
  }) => Promise<{
    objects: Array<MemoryBlobRecord>
    cursor?: string
    truncated?: boolean
  }>
}

export interface MemorySnapshotPersistence {
  stores: {
    messages: MemoryMessageStore
    runs: MemoryRunStore
    generationRuns: MemoryGenerationRunStore
    interrupts: MemoryInterruptStore
    metadata: MemoryMetadataStore
    artifacts: MemoryArtifactStore
    blobs: MemoryBlobStore
  }
}
