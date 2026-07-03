/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare backend. D1 (SQLite-compatible) backs the shared SQL stores; an
 * optional Durable Object namespace can back the distributed lock.
 *
 * COMPILE-VERIFIED ONLY: this package type-checks against real `@cloudflare`
 * types but is not runtime-verified here (it needs a Workers runtime). The D1
 * driver itself is unit-tested against a fake D1 so the adapter logic is
 * covered.
 */
import { createSqlPersistence } from '@tanstack/ai-persistence-sql'
import type {
  SqlDriver,
  SqlPersistence,
  SqlRow,
} from '@tanstack/ai-persistence-sql'
import type { PersistenceMode } from '@tanstack/ai-persistence'
import type {
  ArtifactRecord,
  ArtifactStore,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'

const DEFAULT_R2_ARTIFACT_PREFIX = 'tanstack-ai/artifacts/'

export interface R2ArtifactStoreOptions {
  /** Prefix for all artifact metadata, run indexes, and blob objects. */
  prefix?: string
}

type R2ArtifactMetadata = Omit<ArtifactRecord, 'bytes'> & {
  blobKey?: string
}

function normalizeR2Prefix(prefix?: string): string {
  const normalized = (prefix ?? DEFAULT_R2_ARTIFACT_PREFIX).replace(/^\/+/, '')
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function keyPart(value: string): string {
  return encodeURIComponent(value)
}

function metadataFor(
  record: ArtifactRecord,
  blobKey?: string,
): R2ArtifactMetadata {
  const { bytes: _bytes, ...metadata } = record
  return blobKey ? { ...metadata, blobKey } : metadata
}

async function readMetadata(
  bucket: R2Bucket,
  key: string,
): Promise<R2ArtifactMetadata | null> {
  const object = await bucket.get(key)
  if (!object) return null
  return JSON.parse(await object.text()) as R2ArtifactMetadata
}

function recordFromMetadata(metadata: R2ArtifactMetadata): ArtifactRecord {
  const { blobKey: _blobKey, ...record } = metadata
  return record
}

function withBytes(
  metadata: R2ArtifactMetadata,
  bytes: Uint8Array,
): ArtifactRecord {
  return { ...recordFromMetadata(metadata), bytes }
}

/** Build an R2-backed artifact store with metadata indexes separated from blob bytes. */
export function createR2ArtifactStore(
  bucket: R2Bucket,
  options?: R2ArtifactStoreOptions,
): ArtifactStore {
  const prefix = normalizeR2Prefix(options?.prefix)
  const idKey = (artifactId: string) =>
    `${prefix}by-id/${keyPart(artifactId)}/metadata.json`
  const runKey = (runId: string, artifactId: string) =>
    `${prefix}by-run/${keyPart(runId)}/${keyPart(artifactId)}.json`
  const runPrefix = (runId: string) => `${prefix}by-run/${keyPart(runId)}/`
  const blobKey = (artifactId: string) => `${prefix}blobs/${keyPart(artifactId)}`

  return {
    async save(record) {
      const existing = await readMetadata(bucket, idKey(record.artifactId))
      const nextBlobKey = record.bytes ? blobKey(record.artifactId) : undefined
      const nextMetadata = metadataFor(record, nextBlobKey)
      const encodedMetadata = JSON.stringify(nextMetadata)

      if (record.bytes && nextBlobKey) {
        await bucket.put(nextBlobKey, record.bytes)
      }

      await bucket.put(idKey(record.artifactId), encodedMetadata)
      await bucket.put(runKey(record.runId, record.artifactId), encodedMetadata)

      if (existing && existing.runId !== record.runId) {
        await bucket.delete(runKey(existing.runId, existing.artifactId))
      }
      if (existing?.blobKey && !record.bytes) {
        await bucket.delete(existing.blobKey)
      }
    },

    async get(artifactId) {
      const metadata = await readMetadata(bucket, idKey(artifactId))
      if (!metadata) return null
      if (!metadata.blobKey) return recordFromMetadata(metadata)

      const blob = await bucket.get(metadata.blobKey)
      if (!blob) return recordFromMetadata(metadata)
      return withBytes(metadata, new Uint8Array(await blob.arrayBuffer()))
    },

    async list(runId) {
      const records: Array<ArtifactRecord> = []
      let cursor: string | undefined
      do {
        const result = await bucket.list({
          prefix: runPrefix(runId),
          cursor,
        })
        for (const object of result.objects) {
          const metadata = await readMetadata(bucket, object.key)
          if (metadata) records.push(recordFromMetadata(metadata))
        }
        cursor = result.truncated ? result.cursor : undefined
      } while (cursor)
      return records
    },
  }
}

/** Build a {@link SqlDriver} over a Cloudflare D1 database (SQLite dialect). */
export function createD1Driver(d1: D1Database): SqlDriver {
  const driver: SqlDriver = {
    dialect: 'sqlite',
    async exec(sql, params = []) {
      await d1
        .prepare(sql)
        .bind(...(params as Array<never>))
        .run()
    },
    async query<T extends SqlRow = SqlRow>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) {
      const result = await d1
        .prepare(sql)
        .bind(...(params as Array<never>))
        .all<T>()
      return result.results
    },
    // D1 has no interactive transaction API (only batch); stores use
    // constraints plus reconciliation for CAS when this is a pass-through.
    transaction(fn) {
      return fn(driver)
    },
  }
  return driver
}

export interface CloudflarePersistenceOptions {
  d1: D1Database
  /** Optional R2 bucket for artifact metadata, run indexes, and blob bytes. */
  r2?: R2Bucket
  /** Optional R2 artifact prefix (default `tanstack-ai/artifacts/`). */
  r2ArtifactPrefix?: string
  /** Optional Durable Object namespace for the distributed lock (see {@link createDurableObjectLockStore}). */
  durableObjects?: DurableObjectNamespace
  mode?: PersistenceMode
  /** Run migrations on first use (default true). */
  migrate?: boolean
}

export type CloudflarePersistence = SqlPersistence & {
  /** @deprecated Use stores.locks. */
  locks?: LockStore
  /** @deprecated Use stores.artifacts. */
  artifacts?: ArtifactStore
}

/** Cloudflare-backed {@link CloudflarePersistence} (D1 SQL stores). */
export function cloudflarePersistence(
  opts: CloudflarePersistenceOptions,
): CloudflarePersistence {
  const persistence = createSqlPersistence(createD1Driver(opts.d1), {
    mode: opts.mode,
    migrate: opts.migrate,
  }) as CloudflarePersistence
  if (opts.durableObjects) {
    const locks = createDurableObjectLockStore(opts.durableObjects)
    persistence.stores.locks = locks
    persistence.locks = locks
  }
  if (opts.r2) {
    const artifacts = createR2ArtifactStore(opts.r2, {
      prefix: opts.r2ArtifactPrefix,
    })
    persistence.stores.artifacts = artifacts
    persistence.artifacts = artifacts
  }
  return persistence
}

/**
 * Distributed lock over a Durable Object namespace. The companion DO class must
 * implement a `fetch` that serializes by holding the single-threaded DO; this
 * acquires by calling the DO keyed by the lock name. COMPILE-VERIFIED ONLY.
 */
export function createDurableObjectLockStore(
  ns: DurableObjectNamespace,
): LockStore {
  return {
    async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const stub = ns.get(ns.idFromName(key))
      // Acquire: the DO returns 200 once it holds the turn for this key.
      await stub.fetch('https://lock/acquire')
      try {
        return await fn()
      } finally {
        await stub.fetch('https://lock/release')
      }
    },
  }
}
