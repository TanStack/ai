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
import type {
  ArtifactRecord,
  ArtifactStore,
  BlobObject,
  BlobRecord,
  BlobStore,
  PersistenceMode,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'

const DEFAULT_R2_BLOB_PREFIX = 'tanstack-ai/blobs/'
const DEFAULT_R2_ARTIFACT_PREFIX = 'tanstack-ai/artifacts/'
const DEFAULT_LOCK_LEASE_MS = 30_000
const DEFAULT_LOCK_POLL_MS = 50
const MIN_LOCK_TIMING_MS = 1

export interface R2ArtifactStoreOptions {
  /** Prefix for all artifact metadata, run indexes, and blob objects. */
  prefix?: string
}

export interface R2BlobStoreOptions {
  /** Prefix for all blob objects. Logical keys passed to the store do not include it. */
  prefix?: string
}

export interface CloudflareArtifactStoreOptions {
  /** Logical BlobStore key prefix for artifact bytes. */
  blobKeyPrefix?: string
  now?: () => number
  /** Run artifact table migrations on first use (default true). */
  migrate?: boolean
}

export interface DurableObjectLockStoreOptions {
  leaseMs?: number
  pollMs?: number
}

type R2ArtifactMetadata = Omit<ArtifactRecord, 'bytes'> & {
  blobKey?: string
}

function normalizeR2Prefix(prefix?: string): string {
  const normalized = (prefix ?? DEFAULT_R2_ARTIFACT_PREFIX).replace(/^\/+/, '')
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function normalizeBlobPrefix(prefix?: string): string {
  const normalized = (prefix ?? DEFAULT_R2_BLOB_PREFIX).replace(/^\/+/, '')
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function keyPart(value: string): string {
  return encodeURIComponent(value)
}

function orderedKeyPart(value: string): string {
  return `${keyPart(value)}/${Date.now()}-${crypto.randomUUID()}`
}

function toPhysicalKey(prefix: string, key: string): string {
  return `${prefix}${key.replace(/^\/+/, '')}`
}

function toLogicalKey(prefix: string, key: string): string {
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}

function r2RecordFromObject(
  prefix: string,
  object: {
    key: string
    size?: number
    etag?: string
    uploaded?: Date
    httpMetadata?: { contentType?: string }
    customMetadata?: Record<string, string>
  },
): BlobRecord {
  return {
    key: toLogicalKey(prefix, object.key),
    size: object.size,
    etag: object.etag,
    contentType: object.httpMetadata?.contentType,
    customMetadata: object.customMetadata,
    createdAt: object.uploaded?.getTime(),
    updatedAt: object.uploaded?.getTime(),
  }
}

/** Build an R2-backed generic blob store. */
export function createR2BlobStore(
  bucket: R2Bucket,
  options?: R2BlobStoreOptions,
): BlobStore {
  const prefix = normalizeBlobPrefix(options?.prefix)

  return {
    async put(key, body, putOptions) {
      const result = await bucket.put(toPhysicalKey(prefix, key), body, {
        httpMetadata: putOptions?.contentType
          ? { contentType: putOptions.contentType }
          : undefined,
        customMetadata: putOptions?.customMetadata,
      })
      return r2RecordFromObject(prefix, {
        key: toPhysicalKey(prefix, key),
        size: result.size,
        etag: result.etag,
        uploaded: result.uploaded,
        httpMetadata: result.httpMetadata,
        customMetadata: result.customMetadata,
      })
    },

    async get(key) {
      const object = await bucket.get(toPhysicalKey(prefix, key))
      if (!object) return null
      const record = r2RecordFromObject(prefix, object)
      return {
        ...record,
        body: object.body,
        arrayBuffer: () => object.arrayBuffer(),
        text: () => object.text(),
      } satisfies BlobObject
    },

    async head(key) {
      const object = await bucket.head(toPhysicalKey(prefix, key))
      return object ? r2RecordFromObject(prefix, object) : null
    },

    async delete(key) {
      await bucket.delete(toPhysicalKey(prefix, key))
    },

    async list(listOptions) {
      const result = await bucket.list({
        prefix: toPhysicalKey(prefix, listOptions?.prefix ?? ''),
        cursor: listOptions?.cursor,
        limit: listOptions?.limit,
      })
      return {
        objects: result.objects.map((object) =>
          r2RecordFromObject(prefix, object),
        ),
        cursor: 'cursor' in result ? result.cursor : undefined,
        truncated: result.truncated,
      }
    },
  }
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
  const blobKey = (artifactId: string) =>
    `${prefix}blobs/${keyPart(artifactId)}/${Date.now()}-${crypto.randomUUID()}`
  const listRunIndexEntries = async (runId: string) => {
    const entries: Array<{ key: string; metadata: R2ArtifactMetadata }> = []
    let cursor: string | undefined
    do {
      const result = await bucket.list({
        prefix: runPrefix(runId),
        cursor,
      })
      for (const object of result.objects) {
        const metadata = await readMetadata(bucket, object.key)
        if (metadata) entries.push({ key: object.key, metadata })
      }
      cursor = result.truncated ? result.cursor : undefined
    } while (cursor)
    return entries
  }
  const listArtifacts = async (runId: string) => {
    const records: Array<ArtifactRecord> = []
    const entries = await listRunIndexEntries(runId)
    for (const entry of entries) {
      const metadata = await readMetadata(
        bucket,
        idKey(entry.metadata.artifactId),
      )
      if (
        metadata?.artifactId === entry.metadata.artifactId &&
        metadata.runId === runId
      ) {
        records.push(recordFromMetadata(metadata))
      }
    }
    return records
  }

  return {
    async save(record) {
      const existing = await readMetadata(bucket, idKey(record.artifactId))
      const nextBlobKey = record.bytes ? blobKey(record.artifactId) : undefined
      const nextMetadata = metadataFor(record, nextBlobKey)
      const encodedMetadata = JSON.stringify(nextMetadata)

      if (record.bytes && nextBlobKey) {
        await bucket.put(nextBlobKey, record.bytes)
      }

      try {
        await bucket.put(
          runKey(record.runId, record.artifactId),
          encodedMetadata,
        )
      } catch (error) {
        if (nextBlobKey) {
          try {
            await bucket.delete(nextBlobKey)
          } catch {
            // Preserve the commit failure; cleanup is best-effort.
          }
        }
        throw error
      }

      try {
        await bucket.put(idKey(record.artifactId), encodedMetadata)
      } catch (error) {
        if (existing?.runId === record.runId) {
          try {
            await bucket.put(
              runKey(existing.runId, existing.artifactId),
              JSON.stringify(existing),
            )
          } catch {
            // Preserve the commit failure; cleanup is best-effort.
          }
        } else {
          try {
            await bucket.delete(runKey(record.runId, record.artifactId))
          } catch {
            // Preserve the commit failure; cleanup is best-effort.
          }
        }
        if (nextBlobKey) {
          try {
            await bucket.delete(nextBlobKey)
          } catch {
            // Preserve the commit failure; cleanup is best-effort.
          }
        }
        throw error
      }

      if (existing && existing.runId !== record.runId) {
        try {
          await bucket.delete(runKey(existing.runId, existing.artifactId))
        } catch {
          // New metadata is committed; stale run index cleanup is best-effort.
        }
      }
      if (existing?.blobKey && existing.blobKey !== nextBlobKey) {
        try {
          await bucket.delete(existing.blobKey)
        } catch {
          // New metadata is committed; stale blob cleanup is best-effort.
        }
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
      return listArtifacts(runId)
    },

    async delete(artifactId) {
      const metadata = await readMetadata(bucket, idKey(artifactId))
      if (!metadata) return
      if (metadata.blobKey) await bucket.delete(metadata.blobKey)
      await bucket.delete(runKey(metadata.runId, metadata.artifactId))
      await bucket.delete(idKey(artifactId))
    },

    async deleteForRun(runId) {
      const entries = await listRunIndexEntries(runId)
      for (const entry of entries) {
        const metadata = await readMetadata(
          bucket,
          idKey(entry.metadata.artifactId),
        )
        if (!metadata || metadata.runId !== runId) {
          await bucket.delete(entry.key)
          continue
        }
        if (metadata.blobKey) await bucket.delete(metadata.blobKey)
        await bucket.delete(entry.key)
        await bucket.delete(idKey(entry.metadata.artifactId))
      }
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
  /** Optional R2 bucket for artifact bytes and generic blob storage. */
  r2?: R2Bucket
  /** Optional R2 prefix for artifact bytes and generic blob storage. */
  r2ArtifactPrefix?: string
  /** Optional R2 prefix for generic blob storage. Defaults to r2ArtifactPrefix when provided. */
  r2BlobPrefix?: string
  /** Optional Durable Object namespace for the distributed lock (see {@link createDurableObjectLockStore}). */
  durableObjects?: DurableObjectNamespace
  durableObjectLocks?: DurableObjectLockStoreOptions
  mode?: PersistenceMode
  /** Run migrations on first use (default true). */
  migrate?: boolean
}

export type CloudflarePersistence = SqlPersistence & {
  stores: SqlPersistence['stores'] & {
    locks?: LockStore
    artifacts?: ArtifactStore
    blobs?: BlobStore
  }
  /** @deprecated Use stores.locks. */
  locks?: LockStore
  /** @deprecated Use stores.artifacts. */
  artifacts?: ArtifactStore
}

/** Cloudflare-backed {@link CloudflarePersistence} (D1 SQL stores). */
export function cloudflarePersistence(
  opts: CloudflarePersistenceOptions,
): CloudflarePersistence {
  const driver = createD1Driver(opts.d1)
  const persistence = createSqlPersistence(driver, {
    mode: opts.mode,
    migrate: opts.migrate,
  }) as CloudflarePersistence
  if (opts.durableObjects) {
    const locks = createDurableObjectLockStore(
      opts.durableObjects,
      opts.durableObjectLocks,
    )
    persistence.stores.locks = locks
    persistence.locks = locks
  }
  if (opts.r2) {
    const blobs = createR2BlobStore(opts.r2, {
      prefix: opts.r2BlobPrefix ?? opts.r2ArtifactPrefix,
    })
    const artifacts = createCloudflareArtifactStore(driver, blobs, {
      migrate: opts.migrate,
    })
    persistence.stores.blobs = blobs
    persistence.stores.artifacts = artifacts
    persistence.artifacts = artifacts
  }
  return persistence
}

type LockHolder = {
  owner: string
  expiresAt: number
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json()
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
}

function validatePositiveFiniteNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value < MIN_LOCK_TIMING_MS) {
    throw new TypeError(
      `${name} must be a finite positive number of milliseconds.`,
    )
  }
  return value
}

/**
 * Durable Object class that owns one lock holder per object instance. Bind a DO
 * namespace to {@link createDurableObjectLockStore}; each lock key maps to one
 * object id via `idFromName`.
 */
export class LockDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    _env?: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const input = await readJson(request)
    const owner = typeof input.owner === 'string' ? input.owner : ''
    let leaseMs = DEFAULT_LOCK_LEASE_MS
    if (input.leaseMs !== undefined) {
      if (typeof input.leaseMs !== 'number') {
        return jsonResponse(
          { ok: false, error: 'leaseMs must be a finite positive number.' },
          { status: 400 },
        )
      }
      try {
        leaseMs = validatePositiveFiniteNumber('leaseMs', input.leaseMs)
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error: error instanceof Error ? error.message : 'invalid leaseMs',
          },
          { status: 400 },
        )
      }
    }
    if (!owner) {
      return jsonResponse(
        { ok: false, error: 'missing owner' },
        { status: 400 },
      )
    }

    if (url.pathname === '/acquire') return this.acquire(owner, leaseMs)
    if (url.pathname === '/renew') return this.renew(owner, leaseMs)
    if (url.pathname === '/release') return this.release(owner)
    return jsonResponse({ ok: false, error: 'not found' }, { status: 404 })
  }

  async alarm(): Promise<void> {
    const holder = await this.getHolder()
    if (holder && holder.expiresAt <= Date.now()) {
      await this.state.storage.delete('holder')
    }
  }

  private async acquire(owner: string, leaseMs: number): Promise<Response> {
    const currentTime = Date.now()
    const holder = await this.getHolder()
    if (!holder || holder.expiresAt <= currentTime || holder.owner === owner) {
      const next = { owner, expiresAt: currentTime + leaseMs }
      await this.state.storage.put('holder', next)
      await this.state.storage.setAlarm(next.expiresAt)
      return jsonResponse({ ok: true, expiresAt: next.expiresAt })
    }

    return jsonResponse(
      { ok: false, retryAfterMs: Math.max(0, holder.expiresAt - currentTime) },
      { status: 409 },
    )
  }

  private async renew(owner: string, leaseMs: number): Promise<Response> {
    const holder = await this.getHolder()
    if (!holder || holder.owner !== owner) {
      return jsonResponse({ ok: false }, { status: 409 })
    }
    const next = { owner, expiresAt: Date.now() + leaseMs }
    await this.state.storage.put('holder', next)
    await this.state.storage.setAlarm(next.expiresAt)
    return jsonResponse({ ok: true, expiresAt: next.expiresAt })
  }

  private async release(owner: string): Promise<Response> {
    const holder = await this.getHolder()
    if (!holder || holder.owner !== owner) {
      return jsonResponse({ ok: false }, { status: 409 })
    }
    await this.state.storage.delete('holder')
    await this.state.storage.deleteAlarm()
    return jsonResponse({ ok: true })
  }

  private async getHolder(): Promise<LockHolder | null> {
    const holder = await this.state.storage.get<LockHolder>('holder')
    if (!holder) return null
    if (holder.expiresAt <= Date.now()) {
      await this.state.storage.delete('holder')
      return null
    }
    return holder
  }
}

export function createDurableObjectLockStore(
  ns: DurableObjectNamespace,
  options?: DurableObjectLockStoreOptions,
): LockStore {
  const leaseMs = validatePositiveFiniteNumber(
    'leaseMs',
    options?.leaseMs ?? DEFAULT_LOCK_LEASE_MS,
  )
  const pollMs = validatePositiveFiniteNumber(
    'pollMs',
    options?.pollMs ?? DEFAULT_LOCK_POLL_MS,
  )
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
  const responseError = async (operation: string, response: Response) => {
    let body = ''
    try {
      body = await response.text()
    } catch {
      body = '<unreadable body>'
    }
    return new Error(
      `Durable Object lock ${operation} failed with HTTP ${response.status}${
        body ? `: ${body}` : ''
      }`,
    )
  }

  return {
    async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const stub = ns.get(ns.idFromName(key))
      const owner = crypto.randomUUID()
      for (;;) {
        const response = await stub.fetch('https://lock/acquire', {
          method: 'POST',
          body: JSON.stringify({ owner, leaseMs }),
        })
        if (response.ok) break
        if (response.status !== 409) {
          throw await responseError('acquire', response)
        }
        await sleep(pollMs)
      }

      let released = false
      let renewing = false
      let failRenewal: (error: Error) => void = () => {}
      const renewalFailed = new Promise<never>((_, reject) => {
        failRenewal = reject
      })
      const renew = setInterval(
        () => {
          if (released) return
          if (renewing) return
          renewing = true
          void (async () => {
            try {
              const response = await stub.fetch('https://lock/renew', {
                method: 'POST',
                body: JSON.stringify({ owner, leaseMs }),
              })
              if (!response.ok) {
                released = true
                clearInterval(renew)
                failRenewal(await responseError('renew', response))
              }
            } catch (cause) {
              released = true
              clearInterval(renew)
              failRenewal(
                new Error('Durable Object lock renew failed', { cause }),
              )
            } finally {
              renewing = false
            }
          })()
        },
        Math.max(1, Math.floor(leaseMs / 2)),
      )

      let result: T | undefined
      let primaryError: unknown
      try {
        const criticalSection = fn()
        criticalSection.catch(() => {})
        result = await Promise.race([criticalSection, renewalFailed])
      } catch (error) {
        primaryError = error
      }

      released = true
      clearInterval(renew)

      let releaseError: unknown
      try {
        const response = await stub.fetch('https://lock/release', {
          method: 'POST',
          body: JSON.stringify({ owner }),
        })
        if (!response.ok) {
          releaseError = await responseError('release', response)
        }
      } catch (error) {
        releaseError = error
      }

      if (primaryError !== undefined) throw primaryError
      if (releaseError !== undefined) throw releaseError
      return result as T
    },
  }
}

type ArtifactRow = SqlRow & {
  artifact_id: string
  run_id: string
  thread_id: string
  name: string
  mime_type: string
  size: number
  external_url: string | null
  blob_key: string | null
  created_at: number
  updated_at: number
}

function artifactFromRow(row: ArtifactRow): ArtifactRecord {
  return {
    artifactId: String(row.artifact_id),
    runId: String(row.run_id),
    threadId: String(row.thread_id),
    name: String(row.name),
    mimeType: String(row.mime_type),
    size: Number(row.size),
    externalUrl:
      row.external_url === null ? undefined : String(row.external_url),
    createdAt: Number(row.created_at),
  }
}

export function cloudflareArtifactDdl(): Array<string> {
  return [
    `
        CREATE TABLE IF NOT EXISTS artifacts (
          artifact_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          external_url TEXT,
          blob_key TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `,
    'CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts (run_id)',
  ]
}

/** Build a D1/SQL-indexed artifact store whose bytes live in a BlobStore. */
export function createCloudflareArtifactStore(
  driver: SqlDriver,
  blobStore: BlobStore,
  options?: CloudflareArtifactStoreOptions,
): ArtifactStore {
  const blobKeyPrefix = normalizeBlobPrefix(
    options?.blobKeyPrefix ?? 'artifacts/',
  )
  const now = options?.now ?? Date.now
  const migrate = options?.migrate ?? true
  let migrated: Promise<void> | undefined
  const blobKey = (artifactId: string) =>
    `${blobKeyPrefix}${orderedKeyPart(artifactId)}`
  const ensureArtifactsTable = () => {
    if (!migrate) return Promise.resolve()
    migrated ??= (async () => {
      for (const statement of cloudflareArtifactDdl()) {
        await driver.exec(statement)
      }
    })()
    return migrated
  }
  const findRow = async (artifactId: string) => {
    await ensureArtifactsTable()
    const rows = await driver.query<ArtifactRow>(
      'SELECT * FROM artifacts WHERE artifact_id = ?',
      [artifactId],
    )
    return rows[0] ?? null
  }

  return {
    async save(record) {
      await ensureArtifactsTable()
      const existing = await findRow(record.artifactId)
      const nextBlobKey = record.bytes ? blobKey(record.artifactId) : undefined
      let wroteNextBlob = false

      if (record.bytes && nextBlobKey) {
        await blobStore.put(nextBlobKey, record.bytes, {
          contentType: record.mimeType,
          customMetadata: {
            artifactId: record.artifactId,
            runId: record.runId,
            threadId: record.threadId,
          },
        })
        wroteNextBlob = true
      }

      try {
        await driver.exec(
          `
          INSERT INTO artifacts (
            artifact_id,
            run_id,
            thread_id,
            name,
            mime_type,
            size,
            external_url,
            blob_key,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (artifact_id) DO UPDATE SET
            run_id = excluded.run_id,
            thread_id = excluded.thread_id,
            name = excluded.name,
            mime_type = excluded.mime_type,
            size = excluded.size,
            external_url = excluded.external_url,
            blob_key = excluded.blob_key,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `,
          [
            record.artifactId,
            record.runId,
            record.threadId,
            record.name,
            record.mimeType,
            record.size,
            record.externalUrl ?? null,
            nextBlobKey ?? null,
            record.createdAt,
            now(),
          ],
        )
      } catch (error) {
        if (wroteNextBlob && nextBlobKey) {
          try {
            await blobStore.delete(nextBlobKey)
          } catch {
            // Preserve the SQL failure; leaked staged blobs are non-indexed.
          }
        }
        throw error
      }

      const oldBlobKey = existing?.blob_key
      if (oldBlobKey && oldBlobKey !== nextBlobKey) {
        try {
          await blobStore.delete(String(oldBlobKey))
        } catch {
          // The row already points at the new blob/external URL, so stale blob
          // cleanup is best-effort and cannot be rediscovered by retrying save.
        }
      }
    },

    async get(artifactId) {
      const row = await findRow(artifactId)
      if (!row) return null
      const record = artifactFromRow(row)
      if (!row.blob_key) return record
      const object = await blobStore.get(String(row.blob_key))
      if (!object) return record
      return {
        ...record,
        bytes: new Uint8Array(await object.arrayBuffer()),
      }
    },

    async list(runId) {
      await ensureArtifactsTable()
      const rows = await driver.query<ArtifactRow>(
        'SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at, artifact_id',
        [runId],
      )
      return rows.map(artifactFromRow)
    },

    async delete(artifactId) {
      const row = await findRow(artifactId)
      if (!row) return
      if (row.blob_key) await blobStore.delete(String(row.blob_key))
      await driver.exec('DELETE FROM artifacts WHERE artifact_id = ?', [
        artifactId,
      ])
    },

    async deleteForRun(runId) {
      await ensureArtifactsTable()
      const rows = await driver.query<ArtifactRow>(
        'SELECT * FROM artifacts WHERE run_id = ?',
        [runId],
      )
      await Promise.all(
        rows
          .map((row) => row.blob_key)
          .filter((key): key is string => typeof key === 'string')
          .map((key) => blobStore.delete(key)),
      )
      await driver.exec('DELETE FROM artifacts WHERE run_id = ?', [runId])
    },
  }
}
