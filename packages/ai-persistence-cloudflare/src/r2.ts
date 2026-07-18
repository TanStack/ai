import type {
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobListOptions,
  BlobListPage,
  BlobObject,
  BlobPutOptions,
  BlobRecord,
  BlobStore,
} from '@tanstack/ai-persistence'
import type {
  R2BucketBinding,
  R2ObjectBodyBinding,
  R2ObjectMetadataBinding,
} from './bindings'

export interface R2StoreOptions {
  prefix?: string
}

const defaultArtifactPrefix = 'tanstack-ai/artifacts/'
const defaultBlobPrefix = 'tanstack-ai/blobs/'

function normalizedPrefix(prefix: string): string {
  return prefix === '' || prefix.endsWith('/') ? prefix : `${prefix}/`
}

async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * R2 rejects a `ReadableStream` body without a known length ("must have a known
 * length"). Read such streams fully into bytes — matching the
 * memory/drizzle/prisma backends, which also collect the stream — so R2
 * receives a fixed-length body. Every other `BlobBody` variant already carries a
 * length and passes straight through.
 */
async function r2PutBody(body: BlobBody): Promise<BlobBody> {
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return collectStream(body)
  }
  return body
}

function encoded(value: string): string {
  return encodeURIComponent(value)
}

function artifactIdKey(prefix: string, artifactId: string): string {
  return `${prefix}by-id/${encoded(artifactId)}/metadata.json`
}

function artifactRunKey(
  prefix: string,
  runId: string,
  artifactId: string,
): string {
  return `${prefix}by-run/${encoded(runId)}/${encoded(artifactId)}.json`
}

function artifactRunPrefix(prefix: string, runId: string): string {
  return `${prefix}by-run/${encoded(runId)}/`
}

function artifactJson(record: ArtifactRecord): string {
  return JSON.stringify(artifactSnapshot(record))
}

function artifactSnapshot(record: ArtifactRecord): ArtifactRecord {
  return {
    artifactId: record.artifactId,
    runId: record.runId,
    threadId: record.threadId,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    ...(record.externalUrl !== undefined
      ? { externalUrl: record.externalUrl }
      : {}),
    createdAt: record.createdAt,
  }
}

function parseArtifact(value: string, key: string): ArtifactRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (cause) {
    throw new Error(`Invalid R2 artifact metadata at ${key}`, { cause })
  }
  if (!isArtifactRecord(parsed)) {
    throw new Error(`Invalid R2 artifact metadata at ${key}`)
  }
  return artifactSnapshot(parsed)
}

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  if (value === null || typeof value !== 'object') return false
  return (
    'artifactId' in value &&
    typeof value.artifactId === 'string' &&
    'runId' in value &&
    typeof value.runId === 'string' &&
    'threadId' in value &&
    typeof value.threadId === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'mimeType' in value &&
    typeof value.mimeType === 'string' &&
    'size' in value &&
    typeof value.size === 'number' &&
    'createdAt' in value &&
    typeof value.createdAt === 'number' &&
    (!('externalUrl' in value) ||
      value.externalUrl === undefined ||
      typeof value.externalUrl === 'string')
  )
}

async function listAll(
  bucket: R2BucketBinding,
  prefix: string,
): Promise<Array<R2ObjectMetadataBinding>> {
  const objects: Array<R2ObjectMetadataBinding> = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({
      prefix,
      ...(cursor !== undefined ? { cursor } : {}),
    })
    objects.push(...page.objects)
    if (page.truncated && !page.cursor) {
      throw new Error(
        `R2 returned a truncated page without a cursor for ${prefix}`,
      )
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)
  return objects
}

async function putArtifactJson(
  bucket: R2BucketBinding,
  key: string,
  record: ArtifactRecord,
): Promise<void> {
  const result = await bucket.put(key, artifactJson(record), {
    httpMetadata: { contentType: 'application/json' },
  })
  if (!result) throw new Error(`R2 did not return metadata for ${key}`)
}

/** Store artifact metadata and its run index in R2. Artifact bytes use BlobStore. */
export function createR2ArtifactStore(
  bucket: R2BucketBinding,
  options: R2StoreOptions = {},
): ArtifactStore {
  const prefix = normalizedPrefix(options.prefix ?? defaultArtifactPrefix)

  const get = async (artifactId: string): Promise<ArtifactRecord | null> => {
    const key = artifactIdKey(prefix, artifactId)
    const object = await bucket.get(key)
    return object ? parseArtifact(await object.text(), key) : null
  }

  return {
    async save(record) {
      const oldRecord = await get(record.artifactId)
      const idKey = artifactIdKey(prefix, record.artifactId)
      const newRunKey = artifactRunKey(prefix, record.runId, record.artifactId)
      await putArtifactJson(bucket, newRunKey, record)
      try {
        await putArtifactJson(bucket, idKey, record)
      } catch (writeError) {
        try {
          if (oldRecord?.runId === record.runId) {
            await putArtifactJson(bucket, newRunKey, oldRecord)
          } else {
            await bucket.delete(newRunKey)
          }
        } catch (compensationError) {
          throw new AggregateError(
            [writeError, compensationError],
            `R2 artifact metadata write and compensation failed for ${record.artifactId}`,
          )
        }
        throw writeError
      }

      if (oldRecord && oldRecord.runId !== record.runId) {
        await bucket.delete(
          artifactRunKey(prefix, oldRecord.runId, oldRecord.artifactId),
        )
      }
    },
    get,
    async list(runId) {
      const indexObjects = await listAll(
        bucket,
        artifactRunPrefix(prefix, runId),
      )
      const records = await Promise.all(
        indexObjects.map(async (object) => {
          const indexObject = await bucket.get(object.key)
          if (!indexObject) {
            throw new Error(`R2 artifact index disappeared at ${object.key}`)
          }
          const indexRecord = parseArtifact(
            await indexObject.text(),
            object.key,
          )
          const current = await get(indexRecord.artifactId)
          return current?.runId === runId ? current : null
        }),
      )
      return records.filter(
        (record): record is ArtifactRecord => record !== null,
      )
    },
    async delete(artifactId) {
      const oldRecord = await get(artifactId)
      if (!oldRecord) return
      await bucket.delete(artifactIdKey(prefix, artifactId))
      await bucket.delete(
        artifactRunKey(prefix, oldRecord.runId, oldRecord.artifactId),
      )
    },
    async deleteForRun(runId) {
      const indexObjects = await listAll(
        bucket,
        artifactRunPrefix(prefix, runId),
      )
      const records = await Promise.all(
        indexObjects.map(async (object) => {
          const indexObject = await bucket.get(object.key)
          if (!indexObject) {
            throw new Error(`R2 artifact index disappeared at ${object.key}`)
          }
          return {
            indexKey: object.key,
            record: parseArtifact(await indexObject.text(), object.key),
          }
        }),
      )
      for (const { indexKey, record } of records) {
        const current = await get(record.artifactId)
        if (current?.runId !== runId) {
          await bucket.delete(indexKey)
          continue
        }
        await bucket.delete(artifactIdKey(prefix, record.artifactId))
        await bucket.delete(indexKey)
      }
    },
  }
}

function blobRecord(
  object: R2ObjectMetadataBinding,
  prefix: string,
): BlobRecord {
  return {
    key: object.key.slice(prefix.length),
    size: object.size,
    etag: object.etag,
    contentType: object.httpMetadata?.contentType,
    customMetadata: object.customMetadata,
    createdAt: object.uploaded.getTime(),
    updatedAt: object.uploaded.getTime(),
  }
}

function blobObject(object: R2ObjectBodyBinding, prefix: string): BlobObject {
  return {
    ...blobRecord(object, prefix),
    // Expose `body` for parity with the memory/drizzle/prisma backends, but as a
    // LAZY getter: R2's `body`/`arrayBuffer`/`text` all read the SAME single-use
    // stream and are mutually exclusive, so a consumer must pick ONE per `get`
    // (unlike the buffering backends, which can be read repeatedly). Eagerly
    // touching `object.body` here would lock the stream and break the far more
    // common `arrayBuffer()`/`text()` path, so we only reach for it on demand.
    get body() {
      return object.body
    },
    arrayBuffer: () => object.arrayBuffer(),
    text: () => object.text(),
  }
}

/** Store arbitrary byte bodies in R2 under an adapter-owned prefix. */
export function createR2BlobStore(
  bucket: R2BucketBinding,
  options: R2StoreOptions = {},
): BlobStore {
  const prefix = normalizedPrefix(options.prefix ?? defaultBlobPrefix)
  const storageKey = (key: string) => `${prefix}${key}`
  return {
    async put(key, body, putOptions?: BlobPutOptions) {
      const object = await bucket.put(storageKey(key), await r2PutBody(body), {
        ...(putOptions?.contentType
          ? { httpMetadata: { contentType: putOptions.contentType } }
          : {}),
        ...(putOptions?.customMetadata
          ? { customMetadata: putOptions.customMetadata }
          : {}),
      })
      if (!object) throw new Error(`R2 did not return metadata for ${key}`)
      return blobRecord(object, prefix)
    },
    async get(key) {
      const object = await bucket.get(storageKey(key))
      return object ? blobObject(object, prefix) : null
    },
    async head(key) {
      const object = await bucket.head(storageKey(key))
      return object ? blobRecord(object, prefix) : null
    },
    delete(key) {
      return bucket.delete(storageKey(key))
    },
    async list(listOptions?: BlobListOptions): Promise<BlobListPage> {
      const page = await bucket.list({
        prefix: storageKey(listOptions?.prefix ?? ''),
        ...(listOptions?.cursor !== undefined
          ? { cursor: listOptions.cursor }
          : {}),
        ...(listOptions?.limit !== undefined
          ? { limit: listOptions.limit }
          : {}),
      })
      return {
        objects: page.objects.map((object) => blobRecord(object, prefix)),
        truncated: page.truncated,
        ...(page.cursor !== undefined ? { cursor: page.cursor } : {}),
      }
    },
  }
}
