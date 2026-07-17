import type { BlobBody } from '@tanstack/ai-persistence'

export interface R2HttpMetadata {
  contentType?: string
}

export interface R2PutOptions {
  customMetadata?: Record<string, string>
  httpMetadata?: R2HttpMetadata
}

export interface R2ObjectMetadataBinding {
  key: string
  size: number
  etag: string
  uploaded: Date
  customMetadata?: Record<string, string>
  httpMetadata?: R2HttpMetadata
}

export interface R2ObjectBodyBinding extends R2ObjectMetadataBinding {
  body: ReadableStream<Uint8Array>
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
}

export interface R2ListOptionsBinding {
  cursor?: string
  limit?: number
  prefix?: string
}

export interface R2ListResultBinding {
  cursor?: string
  objects: Array<R2ObjectMetadataBinding>
  truncated: boolean
}

/** The R2 surface used by the adapter. A Cloudflare `R2Bucket` is assignable. */
export interface R2BucketBinding {
  put: (
    key: string,
    value: BlobBody,
    options?: R2PutOptions,
  ) => Promise<R2ObjectMetadataBinding | null>
  get: (key: string) => Promise<R2ObjectBodyBinding | null>
  head: (key: string) => Promise<R2ObjectMetadataBinding | null>
  delete: (key: string) => Promise<void>
  list: (options?: R2ListOptionsBinding) => Promise<R2ListResultBinding>
}

export interface DurableObjectStubBinding {
  fetch: (
    input: Request | string | URL,
    init?: RequestInit,
  ) => Promise<Response>
}

/** The Durable Object namespace surface used by the lock client. */
export interface DurableObjectNamespaceBinding<TId = unknown> {
  idFromName: (name: string) => TId
  get: (id: TId) => DurableObjectStubBinding
}

export interface LockDurableObjectStorage {
  get: (key: string) => Promise<unknown>
  put: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<boolean>
  setAlarm: (timestamp: number) => Promise<void>
  deleteAlarm: () => Promise<void>
}

export interface LockDurableObjectState {
  storage: LockDurableObjectStorage
}
