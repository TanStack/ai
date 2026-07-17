import type {
  R2BucketBinding,
  R2HttpMetadata,
  R2ObjectBodyBinding,
  R2ObjectMetadataBinding,
  R2PutOptions,
} from '../src/index'
import type { BlobBody } from '@tanstack/ai-persistence'

interface StoredObject {
  body: Uint8Array<ArrayBuffer>
  customMetadata?: Record<string, string>
  etag: string
  httpMetadata?: R2HttpMetadata
  uploaded: Date
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)
  return copy
}

async function bytesFromBody(body: BlobBody): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof body === 'string') return new TextEncoder().encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0))
  if (ArrayBuffer.isView(body)) {
    return copyBytes(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    )
  }
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer())
  }
  if (!(body instanceof ReadableStream)) {
    throw new TypeError('Unsupported fake R2 body')
  }
  const reader = body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      chunks.push(result.value)
      size += result.value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(new ArrayBuffer(size))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export class FakeR2Bucket implements R2BucketBinding {
  readonly objects = new Map<string, StoredObject>()
  readonly operations: Array<string> = []
  readonly failDeletes = new Set<string>()
  readonly failPuts = new Set<string>()

  async put(
    key: string,
    value: BlobBody,
    options?: R2PutOptions,
  ): Promise<R2ObjectMetadataBinding> {
    this.operations.push(`put:${key}`)
    if (this.failPuts.has(key)) throw new Error(`put failed for ${key}`)
    const body = await bytesFromBody(value)
    const stored: StoredObject = {
      body,
      etag: `${key}:${body.byteLength}`,
      uploaded: new Date(1_000),
      ...(options?.httpMetadata
        ? { httpMetadata: { ...options.httpMetadata } }
        : {}),
      ...(options?.customMetadata
        ? { customMetadata: { ...options.customMetadata } }
        : {}),
    }
    this.objects.set(key, stored)
    return this.metadata(key, stored)
  }

  get(key: string): Promise<R2ObjectBodyBinding | null> {
    this.operations.push(`get:${key}`)
    const stored = this.objects.get(key)
    if (!stored) return Promise.resolve(null)
    const bytes = copyBytes(stored.body)
    return Promise.resolve({
      ...this.metadata(key, stored),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(copyBytes(bytes))
          controller.close()
        },
      }),
      arrayBuffer: () => {
        const buffer = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(buffer).set(bytes)
        return Promise.resolve(buffer)
      },
      text: () => Promise.resolve(new TextDecoder().decode(bytes)),
    })
  }

  head(key: string): Promise<R2ObjectMetadataBinding | null> {
    this.operations.push(`head:${key}`)
    const stored = this.objects.get(key)
    return Promise.resolve(stored ? this.metadata(key, stored) : null)
  }

  delete(key: string): Promise<void> {
    this.operations.push(`delete:${key}`)
    if (this.failDeletes.has(key)) {
      return Promise.reject(new Error(`delete failed for ${key}`))
    }
    this.objects.delete(key)
    return Promise.resolve()
  }

  list(options?: {
    cursor?: string
    limit?: number
    prefix?: string
  }): Promise<{
    cursor?: string
    objects: Array<R2ObjectMetadataBinding>
    truncated: boolean
  }> {
    this.operations.push(`list:${options?.prefix ?? ''}`)
    const keys = [...this.objects.keys()]
      .filter((key) => key.startsWith(options?.prefix ?? ''))
      .filter((key) => options?.cursor === undefined || key > options.cursor)
      .sort()
    const limit = options?.limit
    const pageKeys = limit === undefined ? keys : keys.slice(0, limit)
    const truncated = limit !== undefined && keys.length > pageKeys.length
    const objects = pageKeys.map((key) =>
      this.metadata(key, this.requireObject(key)),
    )
    return Promise.resolve({
      objects,
      truncated,
      ...(truncated && pageKeys.at(-1) ? { cursor: pageKeys.at(-1) } : {}),
    })
  }

  async text(key: string): Promise<string | undefined> {
    return this.objects.has(key)
      ? await (await this.get(key))?.text()
      : undefined
  }

  private metadata(key: string, stored: StoredObject): R2ObjectMetadataBinding {
    return {
      key,
      size: stored.body.byteLength,
      etag: stored.etag,
      uploaded: stored.uploaded,
      ...(stored.httpMetadata
        ? { httpMetadata: { ...stored.httpMetadata } }
        : {}),
      ...(stored.customMetadata
        ? { customMetadata: { ...stored.customMetadata } }
        : {}),
    }
  }

  private requireObject(key: string): StoredObject {
    const object = this.objects.get(key)
    if (!object) throw new Error(`Missing fake R2 object: ${key}`)
    return object
  }
}
