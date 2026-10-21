/**
 * A minimal filesystem `BlobStore` (the `@tanstack/ai-persistence` interface)
 * for the test host. Persists artifact metadata + built bundles under a
 * gitignored `.data/artifacts` dir, so model-authored artifacts survive dev
 * restarts. Production hosts swap this for the SDK's SQLite / S3 / R2 stores.
 *
 * Scope: only the methods `createBlobArtifactStore` uses are meaningful
 * (put/get/head/list/delete, whole-object reads). Byte ranges and rich list
 * cursors beyond simple pagination are not needed here.
 */

import { mkdir, readFile, writeFile, stat, rm, readdir } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type {
  BlobStore,
  BlobBody,
  BlobObject,
  BlobRecord,
  BlobListPage,
  BlobPutOptions,
  BlobListOptions,
} from '@tanstack/ai-persistence'

// Map a blob key to a filesystem path. Keys are URL-ish; only `:` (from the
// fnv1a hash in built-bundle keys) is unsafe on some filesystems. Metadata keys
// — the only ones ever listed — contain no `:`, so list() recovers keys from
// paths unambiguously.
const keyToRel = (key: string) => key.replace(/:/g, '-')

async function bodyToString(body: BlobBody): Promise<string> {
  if (typeof body === 'string') return body
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8')
  if (body instanceof ArrayBuffer) return Buffer.from(body).toString('utf8')
  if (ArrayBuffer.isView(body))
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString(
      'utf8',
    )
  if (typeof (body as Blob).text === 'function') return (body as Blob).text()
  throw new Error(
    'fs-blob-store: unsupported blob body (streams not supported)',
  )
}

async function walk(dir: string): Promise<Array<string>> {
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: Array<string> = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

export function createFsBlobStore(baseDir: string): BlobStore {
  const pathFor = (key: string) => join(baseDir, keyToRel(key))

  return {
    async put(
      key: string,
      body: BlobBody,
      options?: BlobPutOptions,
    ): Promise<BlobRecord> {
      const content = await bodyToString(body)
      const path = pathFor(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content, 'utf8')
      const now = Date.now()
      return {
        key,
        size: Buffer.byteLength(content),
        contentType: options?.contentType,
        createdAt: now,
        updatedAt: now,
      }
    },

    async get(key: string): Promise<BlobObject | null> {
      try {
        const content = await readFile(pathFor(key), 'utf8')
        const info = await stat(pathFor(key))
        return {
          key,
          size: info.size,
          createdAt: info.birthtimeMs,
          updatedAt: info.mtimeMs,
          text: async () => content,
          arrayBuffer: async () => {
            const buf = Buffer.from(content, 'utf8')
            return buf.buffer.slice(
              buf.byteOffset,
              buf.byteOffset + buf.byteLength,
            )
          },
        }
      } catch {
        return null
      }
    },

    async head(key: string): Promise<BlobRecord | null> {
      try {
        const info = await stat(pathFor(key))
        return {
          key,
          size: info.size,
          createdAt: info.birthtimeMs,
          updatedAt: info.mtimeMs,
        }
      } catch {
        return null
      }
    },

    async delete(key: string): Promise<void> {
      await rm(pathFor(key), { force: true })
    },

    async list(options?: BlobListOptions): Promise<BlobListPage> {
      const files = await walk(baseDir)
      const keys = files
        .map((f) => relative(baseDir, f).split(sep).join('/'))
        .filter((k) => (options?.prefix ? k.startsWith(options.prefix) : true))
        .filter((k) => (options?.cursor ? k > options.cursor : true))
        .sort()
      const limit = options?.limit
      const page = typeof limit === 'number' ? keys.slice(0, limit) : keys
      const truncated = typeof limit === 'number' && keys.length > limit
      return {
        objects: page.map((key) => ({ key })),
        truncated,
        cursor: truncated ? page[page.length - 1] : undefined,
      }
    },
  }
}
