import type {
  ModelMessage,
  PersistedArtifactRef,
  RunStatus,
  RunStore,
  Scope,
  TokenUsage,
} from '@tanstack/ai'

export type { Scope }

export interface MessageStore {
  loadThread: (threadId: string) => Promise<Array<ModelMessage>>
  saveThread: (threadId: string, messages: Array<ModelMessage>) => Promise<void>
}

export type {
  RunStatus,
  TerminalRunStatus,
  RunRecord,
  RunStore,
} from '@tanstack/ai'
export { isTerminalRunStatus, defineRunStore } from '@tanstack/ai'

export type GenerationRunStatus = RunStatus

export interface GenerationRunRecord {
  runId: string
  threadId: string
  /** `'image' | 'audio' | 'tts' | 'video' | 'transcription'`. */
  activity: string
  provider: string
  model: string
  status: GenerationRunStatus
  startedAt: number
  finishedAt?: number
  error?: { message: string; code?: string }
  /** Terminal result metadata (ids, model, urls). Never the media bytes. */
  result?: unknown
  /** Durable artifact references, when an artifacts + blobs backend is used. */
  artifacts?: Array<PersistedArtifactRef>
  usage?: TokenUsage
}

export interface GenerationRunStore {
  createOrResume: (
    input: Pick<
      GenerationRunRecord,
      'runId' | 'threadId' | 'activity' | 'provider' | 'model' | 'startedAt'
    > & { status?: GenerationRunStatus },
  ) => Promise<GenerationRunRecord>
  update: (
    runId: string,
    patch: Partial<
      Pick<
        GenerationRunRecord,
        'status' | 'finishedAt' | 'error' | 'result' | 'artifacts' | 'usage'
      >
    >,
  ) => Promise<void>
  /** Return the run record for `runId`, or `null` if none exists. */
  get: (runId: string) => Promise<GenerationRunRecord | null>
  findLatestForThread: (threadId: string) => Promise<GenerationRunRecord | null>
}

/** Lifecycle status of a human-in-the-loop interrupt. */
export type InterruptStatus = 'pending' | 'resolved' | 'cancelled'

export interface InterruptRecord {
  interruptId: string
  runId: string
  threadId: string
  status: InterruptStatus
  requestedAt: number
  resolvedAt?: number
  payload: Record<string, unknown>
  response?: unknown
}

/** A terminal interrupt write for {@link InterruptStore.commitBatch}. */
export type InterruptCommitEntry =
  | {
      interruptId: string
      status: 'resolved'
      response?: unknown
    }
  | {
      interruptId: string
      status: 'cancelled'
    }

/** Durable store for human-in-the-loop interrupts. */
export interface InterruptStore {
  create: (
    record: Omit<InterruptRecord, 'status' | 'resolvedAt'>,
  ) => Promise<void>
  resolve: (interruptId: string, response?: unknown) => Promise<void>
  cancel: (interruptId: string) => Promise<void>
  commitBatch?: (entries: ReadonlyArray<InterruptCommitEntry>) => Promise<void>
  /** Return the interrupt for `interruptId`, or `null` if none exists. */
  get: (interruptId: string) => Promise<InterruptRecord | null>
  list: (threadId: string) => Promise<Array<InterruptRecord>>
  /** Pending interrupts for a thread, ordered by `requestedAt` ascending. */
  listPending: (threadId: string) => Promise<Array<InterruptRecord>>
  /** All interrupts for a run, ordered by `requestedAt` ascending. */
  listByRun: (runId: string) => Promise<Array<InterruptRecord>>
  /** Pending interrupts for a run, ordered by `requestedAt` ascending. */
  listPendingByRun: (runId: string) => Promise<Array<InterruptRecord>>
}

export interface MetadataStore {
  get: (namespace: string, key: string) => Promise<unknown | null>
  /** Insert or overwrite the value for `(namespace, key)`. */
  set: (namespace: string, key: string, value: unknown) => Promise<void>
  delete: (namespace: string, key: string) => Promise<void>
}

/** Type a {@link MessageStore} implementation inline. */
export function defineMessageStore(store: MessageStore): MessageStore {
  return store
}
/** Type an {@link InterruptStore} implementation inline. */
export function defineInterruptStore(store: InterruptStore): InterruptStore {
  return store
}
/** Type a {@link MetadataStore} implementation inline. */
export function defineMetadataStore(store: MetadataStore): MetadataStore {
  return store
}
/** Type a {@link GenerationRunStore} implementation inline. */
export function defineGenerationRunStore(
  store: GenerationRunStore,
): GenerationRunStore {
  return store
}
/** Type an {@link ArtifactStore} implementation inline. */
export function defineArtifactStore(store: ArtifactStore): ArtifactStore {
  return store
}
/** Type a {@link BlobStore} implementation inline. */
export function defineBlobStore(store: BlobStore): BlobStore {
  return store
}

export interface ArtifactRecord {
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

/** Durable store for artifact metadata records. */
export interface ArtifactStore {
  /** Insert or overwrite the artifact metadata record. */
  save: (record: ArtifactRecord) => Promise<void>
  /** Return the artifact for `artifactId`, or `null` if none exists. */
  get: (artifactId: string) => Promise<ArtifactRecord | null>
  list: (runId: string) => Promise<Array<ArtifactRecord>>
  listForThread: (threadId: string) => Promise<Array<ArtifactRecord>>
  delete: (artifactId: string) => Promise<void>
  deleteForRun: (runId: string) => Promise<void>
}

export type BlobBody =
  | ReadableStream<Uint8Array>
  | ArrayBuffer
  | ArrayBufferView
  | string
  | Blob

export interface BlobRecord {
  key: string
  size?: number
  etag?: string
  contentType?: string
  customMetadata?: Record<string, string>
  createdAt?: number
  updatedAt?: number
}

export interface BlobRange {
  offset: number
  length?: number
}

/** Options for {@link BlobStore.get}. */
export interface BlobGetOptions {
  range?: BlobRange
}

/** A stored blob's metadata plus lazy accessors for its bytes. */
export interface BlobObject extends BlobRecord {
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
  body?: ReadableStream<Uint8Array>
  range?: { offset: number; length: number }
}

export interface BlobListPage {
  objects: Array<BlobRecord>
  cursor?: string
  truncated?: boolean
}

export interface BlobPutOptions {
  contentType?: string
  customMetadata?: Record<string, string>
  expectedLength?: number
}

export interface BlobListOptions {
  prefix?: string
  cursor?: string
  limit?: number
}

/** Durable object/blob store (byte-storing or reference-only backends). */
export interface BlobStore {
  /** Insert or overwrite the object at `key`, returning its metadata. */
  put: (
    key: string,
    body: BlobBody,
    options?: BlobPutOptions,
  ) => Promise<BlobRecord>
  get: (key: string, options?: BlobGetOptions) => Promise<BlobObject | null>
  /** Return only the metadata for `key`, or `null`. */
  head: (key: string) => Promise<BlobRecord | null>
  /** Remove the object at `key`. A no-op if absent. */
  delete: (key: string) => Promise<void>
  list: (options?: BlobListOptions) => Promise<BlobListPage>
}

export interface AIPersistenceStores {
  messages?: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
  metadata?: MetadataStore
  generationRuns?: GenerationRunStore
  artifacts?: ArtifactStore
  blobs?: BlobStore
}

export interface ChatTranscriptStores {
  messages: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
  metadata?: MetadataStore
}

export interface ChatPersistenceStores {
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
}

export interface ChatWithInterruptsStores {
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata?: MetadataStore
}

export interface AIPersistence<
  TStores extends AIPersistenceStores = AIPersistenceStores,
> {
  stores: ExactStoreKeys<TStores>
}

/** {@link AIPersistence} for {@link ChatTranscriptStores}. */
export type ChatTranscriptPersistence = AIPersistence<ChatTranscriptStores>

/** {@link AIPersistence} for {@link ChatPersistenceStores}. */
export type ChatPersistence = AIPersistence<ChatPersistenceStores>

/** {@link AIPersistence} for {@link ChatWithInterruptsStores}. */
export type ChatWithInterruptsPersistence =
  AIPersistence<ChatWithInterruptsStores>

type StoreKey = keyof AIPersistenceStores
type ExactStoreKeys<TStores> =
  Exclude<keyof TStores, StoreKey> extends never
    ? TStores
    : TStores & Record<Exclude<keyof TStores, StoreKey>, never>

export type AIPersistenceOverrides = {
  [TKey in StoreKey]?: AIPersistenceStores[TKey] | false
}

type BaseStoreValue<
  TBase extends AIPersistenceStores,
  TKey extends StoreKey,
> = TKey extends keyof TBase ? TBase[TKey] : never

type OverrideStoreValue<
  TOverrides extends AIPersistenceOverrides,
  TKey extends StoreKey,
> = TKey extends keyof TOverrides ? TOverrides[TKey] : never

type ResolvedStoreValue<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
  TKey extends StoreKey,
> = TKey extends keyof TOverrides
  ?
      | Exclude<OverrideStoreValue<TOverrides, TKey>, false | undefined>
      | (undefined extends OverrideStoreValue<TOverrides, TKey>
          ? Exclude<BaseStoreValue<TBase, TKey>, undefined>
          : never)
  : Exclude<BaseStoreValue<TBase, TKey>, undefined>

type BaseStoreIsRequired<
  TBase extends AIPersistenceStores,
  TKey extends StoreKey,
> = TKey extends keyof TBase
  ? object extends Pick<TBase, TKey>
    ? false
    : true
  : false

type ResolvedStoreIsRequired<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
  TKey extends StoreKey,
> = TKey extends keyof TOverrides
  ? false extends OverrideStoreValue<TOverrides, TKey>
    ? false
    : undefined extends OverrideStoreValue<TOverrides, TKey>
      ? BaseStoreIsRequired<TBase, TKey>
      : true
  : BaseStoreIsRequired<TBase, TKey>

type ResolvedRequiredKeys<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
> = {
  [TKey in StoreKey]-?: [ResolvedStoreValue<TBase, TOverrides, TKey>] extends [
    never,
  ]
    ? never
    : ResolvedStoreIsRequired<TBase, TOverrides, TKey> extends true
      ? TKey
      : never
}[StoreKey]

type ResolvedOptionalKeys<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
> = {
  [TKey in StoreKey]-?: [ResolvedStoreValue<TBase, TOverrides, TKey>] extends [
    never,
  ]
    ? never
    : ResolvedStoreIsRequired<TBase, TOverrides, TKey> extends true
      ? never
      : TKey
}[StoreKey]

type Simplify<T> = { [TKey in keyof T]: T[TKey] }

export type ComposedAIPersistenceStores<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
> = Simplify<
  {
    [TKey in ResolvedRequiredKeys<TBase, TOverrides>]: ResolvedStoreValue<
      TBase,
      TOverrides,
      TKey
    >
  } & {
    [TKey in ResolvedOptionalKeys<TBase, TOverrides>]?: ResolvedStoreValue<
      TBase,
      TOverrides,
      TKey
    >
  }
>

const storeKeys = [
  'messages',
  'runs',
  'generationRuns',
  'interrupts',
  'metadata',
  'artifacts',
  'blobs',
] satisfies Array<StoreKey>

const storeKeySet = new Set<string>(storeKeys)

function assertKnownStoreKeys(stores: object, location: string): void {
  const keys = Object.keys(stores)
  for (const key of keys) {
    if (!storeKeySet.has(key)) {
      throw new Error(`Unknown AIPersistence ${location} key: ${key}`)
    }
  }
}

export function validatePersistenceStoreKeys(persistence: AIPersistence): void {
  assertKnownStoreKeys(persistence.stores, 'store')
}

export function validateChatPersistenceStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  if (!persistence.stores.messages) {
    throw new Error('Chat persistence requires stores.messages.')
  }
  const interruptsNeedRuns =
    persistence.stores.interrupts && !persistence.stores.runs
  if (interruptsNeedRuns) {
    throw new Error('Chat persistence stores.interrupts requires stores.runs.')
  }
}

export function validateGenerationPersistenceStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  const hasArtifacts = persistence.stores.artifacts !== undefined
  const hasBlobs = persistence.stores.blobs !== undefined
  if (hasArtifacts !== hasBlobs) {
    throw new Error(
      'Generation artifact persistence requires both stores.artifacts and stores.blobs.',
    )
  }
  if (!persistence.stores.generationRuns) {
    throw new Error('Generation persistence requires stores.generationRuns.')
  }
}

export function validateReconstructChatStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  if (!persistence.stores.messages) {
    throw new Error('reconstructChat requires stores.messages.')
  }
}

export function validateReconstructGenerationStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  if (!persistence.stores.generationRuns) {
    throw new Error('reconstructGeneration requires stores.generationRuns.')
  }
}

export function defineAIPersistence<TStores extends AIPersistenceStores>(
  persistence: AIPersistence<ExactStoreKeys<TStores>>,
): AIPersistence<TStores> {
  validatePersistenceStoreKeys(persistence)
  return persistence
}

export function composePersistence<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
>(
  base: AIPersistence<TBase>,
  config: {
    overrides: ExactStoreKeys<TOverrides>
  },
): AIPersistence<ComposedAIPersistenceStores<TBase, TOverrides>>
export function composePersistence(
  base: AIPersistence,
  config: { overrides: AIPersistenceOverrides },
): AIPersistence {
  validatePersistenceStoreKeys(base)
  assertKnownStoreKeys(config.overrides, 'override')

  const stores: AIPersistenceStores = { ...base.stores }
  for (const key of storeKeys) {
    if (!Object.prototype.hasOwnProperty.call(config.overrides, key)) continue
    const override = config.overrides[key]
    if (override === false) {
      delete stores[key]
    } else if (override !== undefined) {
      setStore(stores, key, override)
    }
  }
  return { stores }
}

function setStore<TKey extends StoreKey>(
  stores: AIPersistenceStores,
  key: TKey,
  value: NonNullable<AIPersistenceStores[TKey]>,
): void {
  stores[key] = value
}
