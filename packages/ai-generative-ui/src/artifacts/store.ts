/**
 * Async artifact store primitive for the middleware (Draft 0.2 §3). The host
 * supplies the storage; the middleware only orchestrates build + save + list.
 *
 * Two reference implementations:
 * - `createInMemoryFrameArtifactStore()` — Map-backed, for tests and ephemeral
 *   hosts.
 * - `createBlobArtifactStore(blobs)` — persists metadata + built bundles into a
 *   `@tanstack/ai-persistence` `BlobStore` (S3, R2, filesystem, SQLite, …),
 *   content-addressed, with no separate metadata database: the artifact list is
 *   a prefix scan of the blob store. This is "build on the persistence
 *   BlobStore, adapt the metadata shape to revisioned source artifacts."
 */

import type { BlobStore } from '@tanstack/ai-persistence'
import type { ArtifactRecord } from '../frame/types'

/** Library filter for {@link FrameArtifactStore.list}. */
export interface FrameArtifactFilter {
  scope?: ArtifactRecord['ownership']['scope']
  ownerId?: string
  /** Case-insensitive substring match on title. */
  query?: string
}

/**
 * The storage contract the middleware depends on. Async so S3/DB/filesystem
 * backends fit. Revisions are immutable (an edit is a new revision, §3.2);
 * built-bundle bytes are addressed by the record's `builtRef` hash.
 */
export interface FrameArtifactStore {
  /** Persist a revision (and its built bundle, if any). */
  save: (record: ArtifactRecord, builtCode?: string) => Promise<ArtifactRecord>
  /** A pinned revision, or the latest when `revision` is omitted (§3.3). */
  get: (artifactId: string, revision?: number) => Promise<ArtifactRecord | undefined>
  /** The highest revision of an artifact. */
  latest: (artifactId: string) => Promise<ArtifactRecord | undefined>
  /** All revisions of one artifact, ascending. */
  revisions: (artifactId: string) => Promise<Array<ArtifactRecord>>
  /** Latest revision of each artifact matching the filter (the library, §3.4). */
  list: (filter?: FrameArtifactFilter) => Promise<Array<ArtifactRecord>>
  /** Built-bundle bytes by content hash (the `/sandbox/_assets` source). */
  getBuilt: (contentHash: string) => Promise<string | undefined>
}

function matches(rec: ArtifactRecord, filter: FrameArtifactFilter): boolean {
  if (filter.scope && rec.ownership.scope !== filter.scope) return false
  if (filter.ownerId && rec.ownership.ownerId !== filter.ownerId) return false
  if (filter.query && !rec.title.toLowerCase().includes(filter.query.toLowerCase())) return false
  return true
}

function byNewest(a: ArtifactRecord, b: ArtifactRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.artifactId < b.artifactId ? -1 : 1
}

/** Strip the `store://assets/` prefix a record's `builtRef` carries. */
function builtHashOf(record: ArtifactRecord): string | undefined {
  return record.builtRef ? record.builtRef.replace('store://assets/', '') : undefined
}

/* -------------------------------------------------------------------------- */
/* In-memory                                                                  */
/* -------------------------------------------------------------------------- */

/** Map-backed {@link FrameArtifactStore}. Not durable. */
export function createInMemoryFrameArtifactStore(): FrameArtifactStore {
  const byId = new Map<string, Map<number, ArtifactRecord>>()
  const built = new Map<string, string>()

  const latestRec = (artifactId: string): ArtifactRecord | undefined => {
    const revs = byId.get(artifactId)
    if (!revs || revs.size === 0) return undefined
    return revs.get(Math.max(...revs.keys()))
  }

  return {
    async save(record, builtCode) {
      let revs = byId.get(record.artifactId)
      if (!revs) byId.set(record.artifactId, (revs = new Map()))
      if (revs.has(record.revision)) {
        throw new Error(`Revision ${record.revision} of ${record.artifactId} already exists (§3.2).`)
      }
      revs.set(record.revision, record)
      const hash = builtHashOf(record)
      if (hash && builtCode != null && !built.has(hash)) built.set(hash, builtCode)
      return record
    },
    async get(artifactId, revision) {
      const revs = byId.get(artifactId)
      if (!revs) return undefined
      return revision === undefined ? latestRec(artifactId) : revs.get(revision)
    },
    async latest(artifactId) {
      return latestRec(artifactId)
    },
    async revisions(artifactId) {
      const revs = byId.get(artifactId)
      return revs ? [...revs.values()].sort((a, b) => a.revision - b.revision) : []
    },
    async list(filter = {}) {
      const out: Array<ArtifactRecord> = []
      for (const id of byId.keys()) {
        const rec = latestRec(id)
        if (rec && matches(rec, filter)) out.push(rec)
      }
      return out.sort(byNewest)
    },
    async getBuilt(contentHash) {
      return built.get(contentHash)
    },
  }
}

/* -------------------------------------------------------------------------- */
/* BlobStore-backed (@tanstack/ai-persistence)                                */
/* -------------------------------------------------------------------------- */

const META_PREFIX = 'genui/meta/'
const BUILT_PREFIX = 'genui/built/'
const pad = (n: number) => String(n).padStart(8, '0')
const metaKey = (artifactId: string, revision: number) => `${META_PREFIX}${artifactId}/${pad(revision)}.json`
const builtKey = (hash: string) => `${BUILT_PREFIX}${hash}.js`

async function readRecord(blobs: BlobStore, key: string): Promise<ArtifactRecord | undefined> {
  const obj = await blobs.get(key)
  if (!obj) return undefined
  try {
    return JSON.parse(await obj.text()) as ArtifactRecord
  } catch {
    return undefined
  }
}

/** Enumerate every meta blob key under a prefix, following list pagination. */
async function listKeys(blobs: BlobStore, prefix: string): Promise<Array<string>> {
  const keys: Array<string> = []
  let cursor: string | undefined
  do {
    const page = await blobs.list({ prefix, cursor })
    for (const o of page.objects) keys.push(o.key)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return keys
}

/**
 * {@link FrameArtifactStore} over a `@tanstack/ai-persistence` `BlobStore`.
 * Everything lives in the blob store: metadata records as JSON under
 * `genui/meta/<id>/<rev>.json`, built bundles content-addressed under
 * `genui/built/<hash>.js`. The library list is a prefix scan — no metadata DB.
 */
export function createBlobArtifactStore(blobs: BlobStore): FrameArtifactStore {
  const revisionKeys = async (artifactId: string): Promise<Array<string>> => {
    const keys = await listKeys(blobs, `${META_PREFIX}${artifactId}/`)
    return keys.sort() // zero-padded → lexical === numeric
  }

  const latestRec = async (artifactId: string): Promise<ArtifactRecord | undefined> => {
    const keys = await revisionKeys(artifactId)
    const last = keys[keys.length - 1]
    return last ? readRecord(blobs, last) : undefined
  }

  return {
    async save(record, builtCode) {
      const key = metaKey(record.artifactId, record.revision)
      if (await blobs.get(key)) {
        throw new Error(`Revision ${record.revision} of ${record.artifactId} already exists (§3.2).`)
      }
      const hash = builtHashOf(record)
      if (hash && builtCode != null) {
        const bk = builtKey(hash)
        if (!(await blobs.head(bk))) await blobs.put(bk, builtCode, { contentType: 'text/javascript' })
      }
      await blobs.put(key, JSON.stringify(record), { contentType: 'application/json' })
      return record
    },
    async get(artifactId, revision) {
      if (revision === undefined) return latestRec(artifactId)
      return readRecord(blobs, metaKey(artifactId, revision))
    },
    latest: latestRec,
    async revisions(artifactId) {
      const keys = await revisionKeys(artifactId)
      const recs = await Promise.all(keys.map((k) => readRecord(blobs, k)))
      return recs.filter((r): r is ArtifactRecord => Boolean(r)).sort((a, b) => a.revision - b.revision)
    },
    async list(filter = {}) {
      const keys = await listKeys(blobs, META_PREFIX)
      // Group by artifact id, keep the highest revision key per id.
      const latestByeId = new Map<string, string>()
      for (const k of keys) {
        const id = k.slice(META_PREFIX.length).split('/')[0]
        if (!id) continue
        const prev = latestByeId.get(id)
        if (!prev || k > prev) latestByeId.set(id, k)
      }
      const recs = await Promise.all([...latestByeId.values()].map((k) => readRecord(blobs, k)))
      return recs
        .filter((r): r is ArtifactRecord => Boolean(r))
        .filter((r) => matches(r, filter))
        .sort(byNewest)
    },
    async getBuilt(contentHash) {
      const obj = await blobs.get(builtKey(contentHash))
      return obj ? obj.text() : undefined
    },
  }
}
