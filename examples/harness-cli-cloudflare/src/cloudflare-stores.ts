import {
  LogConflictError,
  defineArtifactStore,
  defineBlobStore,
  defineCredentialStore,
  defineLogStore,
  defineMetadataStore,
} from '@tanstack/ai-persistence'
import type {
  ArtifactRecord,
  BlobBody,
  BlobRecord,
  Credential,
  LogEntry,
} from '@tanstack/ai-persistence'

/** How the CLI reaches its Worker. */
export interface WorkerConnection {
  /** The Worker URL, for example `https://tanstack-harness.acme.workers.dev`. */
  url: string
  /** The Worker secret (`HARNESS_SECRET`). */
  secret: string
  /** The fetch to use. Default: the global `fetch`. */
  fetch?: typeof fetch
}

/** A request to the Worker. A status that is not OK throws, except 404 and 409. */
function caller(connection: WorkerConnection) {
  const send = connection.fetch ?? fetch
  const base = connection.url.replace(/\/+$/, '')
  return async (path: string, init: RequestInit = {}) => {
    const response = await send(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${connection.secret}`,
        ...init.headers,
      },
    })
    const isExpected =
      response.ok || response.status === 404 || response.status === 409
    if (!isExpected) {
      throw new Error(
        `The Worker answered ${response.status} for ${path}: ${await response.text()}`,
      )
    }
    return response
  }
}

/** A path part, safe for the Worker's router. */
const part = (value: string) => encodeURIComponent(value)

/** The JSON body for a request. */
const jsonBody = (value: unknown) => ({
  body: JSON.stringify(value),
  headers: { 'Content-Type': 'application/json' },
})

/**
 * The session log in the Worker: one Durable Object for each session. The
 * Worker refuses a position that is taken (`409`), as the contract needs.
 * Listeners hear the appends of this process only.
 */
function workerLog(call: ReturnType<typeof caller>) {
  const listeners = new Map<string, Set<() => void>>()
  return defineLogStore({
    append: async (threadId, seq, records) => {
      if (records.length === 0) return
      const response = await call(`/sessions/${part(threadId)}/log`, {
        method: 'POST',
        ...jsonBody({ seq, records }),
      })
      if (response.status === 409) throw new LogConflictError(threadId, seq)
      for (const listener of [...(listeners.get(threadId) ?? [])]) listener()
    },
    read: async (threadId, options = {}) => {
      if (options.limit === 0) return []
      const query = new URLSearchParams({ after: String(options.after ?? 0) })
      if (options.limit !== undefined) query.set('limit', String(options.limit))
      const response = await call(`/sessions/${part(threadId)}/log?${query}`)
      const body: { entries: Array<LogEntry> } = await response.json()
      return body.entries
    },
    subscribe: (threadId, listener) => {
      const set = listeners.get(threadId) ?? new Set()
      listeners.set(threadId, set)
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
  })
}

function workerMetadata(call: ReturnType<typeof caller>) {
  const path = (namespace: string, key: string) =>
    `/metadata/${part(namespace)}/${part(key)}`
  return defineMetadataStore({
    get: async (namespace, key) => {
      const body: { value: unknown } = await (
        await call(path(namespace, key))
      ).json()
      return body.value
    },
    set: async (namespace, key, value) => {
      await call(path(namespace, key), {
        method: 'PUT',
        ...jsonBody({ value }),
      })
    },
    delete: async (namespace, key) => {
      await call(path(namespace, key), { method: 'DELETE' })
    },
  })
}

/** The keys in the Worker, encrypted at rest there. One owner per user. */
function workerCredentials(call: ReturnType<typeof caller>) {
  const owner = (scope: { userId?: string; tenantId?: string }) =>
    part(`${scope.tenantId ?? '-'}/${scope.userId ?? '-'}`)
  return defineCredentialStore({
    get: async (scope, id) => {
      const body: { credential: Credential | null } = await (
        await call(`/credentials/${owner(scope)}/${part(id)}`)
      ).json()
      return body.credential
    },
    set: async (scope, id, credential) => {
      await call(`/credentials/${owner(scope)}/${part(id)}`, {
        method: 'PUT',
        ...jsonBody({ credential }),
      })
    },
    delete: async (scope, id) => {
      await call(`/credentials/${owner(scope)}/${part(id)}`, {
        method: 'DELETE',
      })
    },
    list: async (scope) => {
      const body: { items: Array<{ id: string; type: Credential['type'] }> } =
        await (await call(`/credentials/${owner(scope)}`)).json()
      return body.items
    },
  })
}

function workerArtifacts(call: ReturnType<typeof caller>) {
  const records = async (query: string) => {
    const body: { records: Array<ArtifactRecord> } = await (
      await call(`/artifacts?${query}`)
    ).json()
    return body.records
  }
  return defineArtifactStore({
    save: async (record) => {
      await call(`/artifacts/${part(record.artifactId)}`, {
        method: 'PUT',
        ...jsonBody({ record }),
      })
    },
    get: async (artifactId) => {
      const body: { record: ArtifactRecord | null } = await (
        await call(`/artifacts/${part(artifactId)}`)
      ).json()
      return body.record
    },
    list: (runId) => records(new URLSearchParams({ runId }).toString()),
    listForThread: (threadId) =>
      records(new URLSearchParams({ threadId }).toString()),
    delete: async (artifactId) => {
      await call(`/artifacts/${part(artifactId)}`, { method: 'DELETE' })
    },
    deleteForRun: async (runId) => {
      await call(`/artifacts?${new URLSearchParams({ runId })}`, {
        method: 'DELETE',
      })
    },
  })
}

/** A blob body as something `fetch` can send. */
async function bytesOf(body: BlobBody) {
  if (typeof body === 'string') return new TextEncoder().encode(body)
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer())
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (ArrayBuffer.isView(body)) {
    // A copy, so the body owns a plain ArrayBuffer.
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice()
  }
  return new Uint8Array(await new Response(body).arrayBuffer())
}

/** The media bytes in R2, through the Worker. */
function workerBlobs(call: ReturnType<typeof caller>) {
  const path = (key: string) => `/blobs/${part(key)}`
  return defineBlobStore({
    put: async (key, body, options = {}) => {
      const response = await call(path(key), {
        method: 'PUT',
        // ponytail: the body is read into memory first, so `fetch` gets a
        // length. A stream with `duplex: 'half'` avoids that for big files.
        body: await bytesOf(body),
        headers: {
          ...(options.contentType
            ? { 'Content-Type': options.contentType }
            : {}),
          'x-blob-metadata': JSON.stringify(options.customMetadata ?? {}),
        },
      })
      const record: BlobRecord = await response.json()
      return record
    },
    get: async (key, options = {}) => {
      const query = new URLSearchParams()
      if (options.range) {
        query.set('offset', String(options.range.offset))
        if (options.range.length !== undefined) {
          query.set('length', String(options.range.length))
        }
      }
      const response = await call(`${path(key)}?${query}`)
      if (response.status === 404) return null
      const record: BlobRecord = JSON.parse(
        response.headers.get('x-blob-record') ?? '{}',
      )
      const range = response.headers.get('x-blob-range')
      const bytes = new Uint8Array(await response.arrayBuffer())
      return {
        ...record,
        ...(range ? { range: JSON.parse(range) } : {}),
        arrayBuffer: async () => bytes.slice().buffer,
        text: async () => new TextDecoder().decode(bytes),
        body: new Response(bytes).body ?? undefined,
      }
    },
    head: async (key) => {
      const body: { record: BlobRecord | null } = await (
        await call(`${path(key)}?head=1`)
      ).json()
      return body.record
    },
    delete: async (key) => {
      await call(path(key), { method: 'DELETE' })
    },
    list: async (options = {}) => {
      const query = new URLSearchParams()
      if (options.prefix !== undefined) query.set('prefix', options.prefix)
      if (options.cursor !== undefined) query.set('cursor', options.cursor)
      if (options.limit !== undefined) query.set('limit', String(options.limit))
      const body: {
        objects: Array<BlobRecord>
        cursor?: string
        truncated?: boolean
      } = await (await call(`/blobs?${query}`)).json()
      return body
    },
  })
}

/**
 * The stores of the CLI that live in the Worker: the session log, the
 * settings and plugin state, the keys, and the media.
 */
export function workerStores(connection: WorkerConnection) {
  const call = caller(connection)
  return {
    log: workerLog(call),
    metadata: workerMetadata(call),
    credentials: workerCredentials(call),
    artifacts: workerArtifacts(call),
    blobs: workerBlobs(call),
  }
}

/** The newest sessions in the Worker, with what the user said first. */
export async function workerSessions(connection: WorkerConnection, limit = 20) {
  const body: {
    sessions: Array<{ id: string; title: string; updatedAt: number }>
  } = await (await caller(connection)(`/sessions?limit=${limit}`)).json()
  return body.sessions
}

/** Does the Worker answer with this URL and secret? The reason when not. */
export async function checkWorker(connection: WorkerConnection) {
  try {
    const send = connection.fetch ?? fetch
    const response = await send(
      `${connection.url.replace(/\/+$/, '')}/health`,
      {
        headers: { Authorization: `Bearer ${connection.secret}` },
      },
    )
    if (response.status === 401) return 'The Worker refused the secret.'
    if (!response.ok) return `The Worker answered ${response.status}.`
    return undefined
  } catch (error) {
    return `No answer from ${connection.url}: ${error instanceof Error ? error.message : String(error)}`
  }
}
