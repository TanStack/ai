/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import {
  cloudflarePersistence,
  createD1Driver,
  createR2BlobStore,
  createR2ArtifactStore,
  createDurableObjectLockStore,
  createCloudflareArtifactStore,
  cloudflareArtifactDdl,
  LockDurableObject,
} from '../src/index'
import type { SqlDriver } from '@tanstack/ai-persistence-sql'
import type { ArtifactRecord } from '@tanstack/ai-persistence'

/**
 * A fake D1Database backed by node:sqlite. D1 is SQLite-compatible, so this
 * exercises the real D1 driver + SQL stores end-to-end without a Workers runtime.
 */
function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  const prepare = (sql: string) => {
    let bound: Array<unknown> = []
    const api = {
      bind: (...values: Array<unknown>) => {
        bound = values
        return api
      },
      run: () => {
        db.prepare(sql).run(...(bound as Array<never>))
        return Promise.resolve({ success: true })
      },
      all: () =>
        Promise.resolve({
          results: db.prepare(sql).all(...(bound as Array<never>)),
        }),
      first: () => Promise.resolve(null),
      raw: () => Promise.resolve([]),
    }
    return api
  }
  return { prepare } as unknown as D1Database
}

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

class FakeR2Bucket {
  readonly objects = new Map<
    string,
    {
      body: Uint8Array
      httpMetadata?: { contentType?: string }
      customMetadata?: Record<string, string>
      uploaded: Date
      etag: string
    }
  >()
  readonly deleted: Array<string> = []
  readonly failDeletes = new Set<string>()
  readonly failPuts = new Set<string>()
  getCount = 0

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: {
      httpMetadata?: { contentType?: string }
      customMetadata?: Record<string, string>
    },
  ) {
    if (this.failPuts.has(key)) {
      throw new Error(`put failed for ${key}`)
    }
    let body: Uint8Array
    if (typeof value === 'string') {
      body = new TextEncoder().encode(value)
    } else if (value instanceof ArrayBuffer) {
      body = new Uint8Array(value)
    } else {
      body = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    }
    this.objects.set(key, {
      body,
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
      uploaded: new Date(),
      etag: `"${key}:${body.byteLength}"`,
    })
    return {
      key,
      size: body.byteLength,
      etag: `"${key}:${body.byteLength}"`,
      uploaded: new Date(),
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
    }
  }

  async get(key: string) {
    this.getCount++
    return this.object(key)
  }

  async head(key: string) {
    return this.object(key)
  }

  private object(key: string) {
    const value = this.objects.get(key)
    if (!value) return Promise.resolve(null)
    const body = value.body
    return {
      key,
      size: body.byteLength,
      etag: value.etag,
      uploaded: value.uploaded,
      httpMetadata: value.httpMetadata,
      customMetadata: value.customMetadata,
      body: undefined,
      async arrayBuffer() {
        return body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength,
        )
      },
      async text() {
        return new TextDecoder().decode(body)
      },
      async json() {
        return JSON.parse(new TextDecoder().decode(body))
      },
    }
  }

  async delete(key: string) {
    if (this.failDeletes.has(key)) {
      throw new Error(`delete failed for ${key}`)
    }
    this.deleted.push(key)
    this.objects.delete(key)
  }

  async list(options?: { prefix?: string; cursor?: string }) {
    return {
      objects: [...this.objects.keys()]
        .filter((key) => key.startsWith(options?.prefix ?? ''))
        .sort()
        .map((key) => {
          const value = this.objects.get(key)!
          return {
            key,
            size: value.body.byteLength,
            etag: value.etag,
            uploaded: value.uploaded,
            httpMetadata: value.httpMetadata,
            customMetadata: value.customMetadata,
          }
        }),
      truncated: false,
    }
  }

  bucket(): R2Bucket {
    return this as unknown as R2Bucket
  }
}

async function r2MetadataBlobKey(
  bucket: FakeR2Bucket,
  artifactId = 'art1',
): Promise<string> {
  const object = await bucket.get(
    `test-artifacts/by-id/${artifactId}/metadata.json`,
  )
  const metadata = (await object?.json()) as { blobKey?: string } | undefined
  if (!metadata?.blobKey) throw new Error(`missing blob key for ${artifactId}`)
  return metadata.blobKey
}

function failNextArtifactUpsert(driver: SqlDriver): SqlDriver {
  let shouldFail = true
  return {
    ...driver,
    async exec(sql: string, params?: ReadonlyArray<unknown>) {
      if (shouldFail && /INSERT INTO artifacts/.test(sql)) {
        shouldFail = false
        throw new Error('artifact upsert failed')
      }
      await driver.exec(sql, params)
    },
  }
}

class FakeDurableObjectState {
  readonly storage = {
    values: new Map<string, unknown>(),
    get: async (key: string) => this.storage.values.get(key),
    put: async (key: string, value: unknown) => {
      this.storage.values.set(key, value)
    },
    delete: async (key: string) => {
      this.storage.values.delete(key)
    },
    setAlarm: async (_timestamp: number) => {},
    deleteAlarm: async () => {},
  }
}

class FakeDurableObjectNamespace {
  readonly instances = new Map<
    string,
    { object: LockDurableObject; chain: Promise<unknown> }
  >()

  idFromName(name: string) {
    return { name }
  }

  get(id: { name: string }) {
    const current = this.instances.get(id.name) ?? {
      object: new LockDurableObject(
        new FakeDurableObjectState() as unknown as DurableObjectState,
      ),
      chain: Promise.resolve(),
    }
    this.instances.set(id.name, current)

    return {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init)
        const run = current.chain.then(() => current.object.fetch(request))
        current.chain = run.then(
          () => undefined,
          () => undefined,
        )
        return run
      },
    }
  }

  namespace(): DurableObjectNamespace {
    return this as unknown as DurableObjectNamespace
  }
}

class FetchDurableObjectNamespace {
  constructor(
    private readonly fetchImpl: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>,
  ) {}

  idFromName(name: string) {
    return { name }
  }

  get(_id: { name: string }) {
    return {
      fetch: this.fetchImpl,
    }
  }

  namespace(): DurableObjectNamespace {
    return this as unknown as DurableObjectNamespace
  }
}

const artifact = (overrides: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
  artifactId: 'art1',
  runId: 'run1',
  threadId: 'thread1',
  name: 'out.txt',
  mimeType: 'text/plain',
  size: 5,
  createdAt: 10,
  ...overrides,
})

describe('cloudflarePersistence (D1 via fake backed by node:sqlite)', () => {
  it('round-trips runs and events through the D1 driver', async () => {
    const p = cloudflarePersistence({ d1: fakeD1() })
    await p.runs!.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 })
    await p.events!.append('r1', 1, text('a'))
    await p.events!.append('r1', 2, text('b'))

    expect((await p.runs!.get('r1'))?.status).toBe('running')
    expect(await p.events!.latestSeq('r1')).toBe(2)

    const deltas: Array<string> = []
    for await (const e of p.events!.read('r1', { afterSeq: 0 })) {
      if (e.event.type === 'TEXT_MESSAGE_CONTENT') deltas.push(e.event.delta)
    }
    expect(deltas).toEqual(['a', 'b'])
  })

  it('createD1Driver reports the sqlite dialect', () => {
    expect(createD1Driver(fakeD1()).dialect).toBe('sqlite')
  })
})

describe('createR2ArtifactStore', () => {
  it('stores artifact bytes separately from metadata and hydrates get results', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    const bytes = new TextEncoder().encode('hello')

    await store.save(artifact({ bytes }))

    const metadataObject = await bucket.get(
      'test-artifacts/by-id/art1/metadata.json',
    )
    expect(await metadataObject?.json()).not.toHaveProperty('bytes')
    expect(
      [...bucket.objects.keys()].some((key) =>
        key.startsWith('test-artifacts/blobs/art1/'),
      ),
    ).toBe(true)

    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      runId: 'run1',
      bytes,
    })

    const list = await store.list('run1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      artifactId: 'art1',
      runId: 'run1',
      name: 'out.txt',
    })
    expect(list[0]?.bytes).toBeUndefined()
  })

  it('stores externalUrl-only artifacts without requiring bytes', async () => {
    const store = createR2ArtifactStore(new FakeR2Bucket().bucket(), {
      prefix: 'test-artifacts/',
    })

    await store.save(
      artifact({
        artifactId: 'url-artifact',
        externalUrl: 'https://example.com/out.txt',
        size: 0,
      }),
    )

    const stored = await store.get('url-artifact')
    expect(stored).toMatchObject({
      artifactId: 'url-artifact',
      externalUrl: 'https://example.com/out.txt',
    })
    expect(stored?.bytes).toBeUndefined()

    const list = await store.list('run1')
    expect(list).toMatchObject([
      {
        artifactId: 'url-artifact',
        externalUrl: 'https://example.com/out.txt',
      },
    ])
    expect(list[0]?.bytes).toBeUndefined()
  })

  it('wires R2 artifacts into cloudflarePersistence without replacing D1 core stores', () => {
    const p = cloudflarePersistence({
      d1: fakeD1(),
      r2: new FakeR2Bucket().bucket(),
    })

    expect(p.stores.artifacts).toBeDefined()
    expect(p.stores.runs).toBeDefined()
    expect(p.stores.publicEvents).toBeDefined()
    expect(p.runs).toBe(p.stores.runs)
  })

  it('cleans up stale run indexes and blob bytes on overwrite', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        runId: 'old-run',
        bytes: new TextEncoder().encode('hello'),
      }),
    )

    await store.save(
      artifact({
        runId: 'new-run',
        externalUrl: 'https://example.com/out.txt',
      }),
    )

    await expect(store.list('old-run')).resolves.toEqual([])
    await expect(store.list('new-run')).resolves.toHaveLength(1)
    expect(bucket.deleted).toContain('test-artifacts/by-run/old-run/art1.json')
    expect(
      bucket.deleted.some((key) =>
        key.startsWith('test-artifacts/blobs/art1/'),
      ),
    ).toBe(true)
  })

  it('keeps committed metadata when stale cleanup fails after overwrite', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        runId: 'old-run',
        bytes: new TextEncoder().encode('hello'),
      }),
    )
    bucket.failDeletes.add('test-artifacts/by-run/old-run/art1.json')

    await expect(
      store.save(
        artifact({
          runId: 'new-run',
          externalUrl: 'https://example.com/out.txt',
          size: 0,
        }),
      ),
    ).resolves.toBeUndefined()

    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      runId: 'new-run',
      externalUrl: 'https://example.com/out.txt',
      size: 0,
    })
    expect((await store.get('art1'))?.bytes).toBeUndefined()
    await expect(store.list('new-run')).resolves.toMatchObject([
      {
        artifactId: 'art1',
        runId: 'new-run',
        externalUrl: 'https://example.com/out.txt',
      },
    ])
    await expect(store.list('old-run')).resolves.toEqual([])
  })

  it('keeps old bytes when overwrite metadata commit fails after new blob write', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        bytes: new TextEncoder().encode('old'),
        size: 3,
      }),
    )
    const oldBlobKeys = [...bucket.objects.keys()].filter((key) =>
      key.startsWith('test-artifacts/blobs/art1'),
    )

    bucket.failPuts.add('test-artifacts/by-run/run1/art1.json')

    await expect(
      store.save(
        artifact({
          bytes: new TextEncoder().encode('new'),
          size: 3,
        }),
      ),
    ).rejects.toThrow(/put failed/)

    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      bytes: new TextEncoder().encode('old'),
    })
    expect(
      [...bucket.objects.keys()].filter((key) =>
        key.startsWith('test-artifacts/blobs/art1'),
      ),
    ).toEqual(oldBlobKeys)
  })

  it('keeps by-id as source of truth when by-id commit fails after by-run commit', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        runId: 'old-run',
        bytes: new TextEncoder().encode('old'),
        size: 3,
      }),
    )

    bucket.failPuts.add('test-artifacts/by-id/art1/metadata.json')

    await expect(
      store.save(
        artifact({
          runId: 'new-run',
          bytes: new TextEncoder().encode('new'),
          size: 3,
        }),
      ),
    ).rejects.toThrow(/put failed/)

    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      runId: 'old-run',
      bytes: new TextEncoder().encode('old'),
    })
    await expect(store.list('new-run')).resolves.toEqual([])
    expect(
      [...bucket.objects.keys()].filter((key) =>
        key.startsWith('test-artifacts/blobs/art1'),
      ),
    ).toHaveLength(1)
  })

  it('returns committed by-id metadata when same-run by-run metadata is stale', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        runId: 'run1',
        name: 'committed.txt',
        bytes: new TextEncoder().encode('old'),
        size: 3,
      }),
    )

    await bucket.put(
      'test-artifacts/by-run/run1/art1.json',
      JSON.stringify(
        artifact({
          runId: 'run1',
          name: 'uncommitted.txt',
          bytes: new TextEncoder().encode('new'),
          size: 3,
        }),
      ),
    )

    await expect(store.list('run1')).resolves.toMatchObject([
      {
        artifactId: 'art1',
        runId: 'run1',
        name: 'committed.txt',
      },
    ])
  })

  it('restores the old run index when same-run by-id commit fails after by-run commit', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        runId: 'run1',
        bytes: new TextEncoder().encode('old'),
        size: 3,
      }),
    )

    bucket.failPuts.add('test-artifacts/by-id/art1/metadata.json')

    await expect(
      store.save(
        artifact({
          runId: 'run1',
          bytes: new TextEncoder().encode('new'),
          size: 3,
        }),
      ),
    ).rejects.toThrow(/put failed/)

    await expect(store.list('run1')).resolves.toMatchObject([
      {
        artifactId: 'art1',
        runId: 'run1',
        size: 3,
      },
    ])
    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      runId: 'run1',
      bytes: new TextEncoder().encode('old'),
    })
  })

  it('ignores stale run index entries when deleting artifacts for an old run', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        runId: 'old-run',
        bytes: new TextEncoder().encode('old'),
      }),
    )
    bucket.failDeletes.add('test-artifacts/by-run/old-run/art1.json')
    await store.save(
      artifact({
        runId: 'new-run',
        bytes: new TextEncoder().encode('new'),
      }),
    )
    bucket.failDeletes.delete('test-artifacts/by-run/old-run/art1.json')

    await store.deleteForRun?.('old-run')

    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      runId: 'new-run',
      bytes: new TextEncoder().encode('new'),
    })
    await expect(store.list('old-run')).resolves.toEqual([])
    await expect(store.list('new-run')).resolves.toHaveLength(1)
  })

  it('deleteForRun works when destructured from the store', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        bytes: new TextEncoder().encode('hello'),
      }),
    )

    const deleteForRun = store.deleteForRun!
    await deleteForRun('run1')

    await expect(store.list('run1')).resolves.toEqual([])
    expect(bucket.deleted).toContain('test-artifacts/by-id/art1/metadata.json')
    expect(
      bucket.deleted.some((key) =>
        key.startsWith('test-artifacts/blobs/art1/'),
      ),
    ).toBe(true)
  })

  it('keeps metadata indexes when blob delete by artifact id fails so delete can retry', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(artifact({ bytes: new TextEncoder().encode('hello') }))
    const blobKey = await r2MetadataBlobKey(bucket)
    bucket.failDeletes.add(blobKey)

    await expect(store.delete?.('art1')).rejects.toThrow(/delete failed/)

    expect(bucket.objects.has('test-artifacts/by-id/art1/metadata.json')).toBe(
      true,
    )
    expect(bucket.objects.has('test-artifacts/by-run/run1/art1.json')).toBe(
      true,
    )
    expect(bucket.objects.has(blobKey)).toBe(true)

    bucket.failDeletes.delete(blobKey)
    await store.delete?.('art1')
    await expect(store.get('art1')).resolves.toBeNull()
    expect(bucket.objects.has(blobKey)).toBe(false)
  })

  it('keeps by-id metadata when by-run delete by artifact id fails so delete can retry', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(artifact({ bytes: new TextEncoder().encode('hello') }))
    bucket.failDeletes.add('test-artifacts/by-run/run1/art1.json')

    await expect(store.delete?.('art1')).rejects.toThrow(/delete failed/)

    expect(bucket.objects.has('test-artifacts/by-id/art1/metadata.json')).toBe(
      true,
    )
    expect(bucket.objects.has('test-artifacts/by-run/run1/art1.json')).toBe(
      true,
    )
    expect(
      [...bucket.objects.keys()].some((key) =>
        key.startsWith('test-artifacts/blobs/art1/'),
      ),
    ).toBe(false)

    bucket.failDeletes.delete('test-artifacts/by-run/run1/art1.json')
    await store.delete?.('art1')
    await expect(store.get('art1')).resolves.toBeNull()
    await expect(store.list('run1')).resolves.toEqual([])
  })

  it('keeps metadata indexes when blob delete by run fails so deleteForRun can retry', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket.bucket(), {
      prefix: 'test-artifacts/',
    })
    await store.save(
      artifact({
        artifactId: 'art1',
        bytes: new TextEncoder().encode('one'),
      }),
    )
    await store.save(
      artifact({
        artifactId: 'art2',
        bytes: new TextEncoder().encode('two'),
      }),
    )
    const blobKey = await r2MetadataBlobKey(bucket, 'art1')
    bucket.failDeletes.add(blobKey)

    await expect(store.deleteForRun?.('run1')).rejects.toThrow(/delete failed/)

    expect(bucket.objects.has('test-artifacts/by-id/art1/metadata.json')).toBe(
      true,
    )
    expect(bucket.objects.has('test-artifacts/by-run/run1/art1.json')).toBe(
      true,
    )
    expect(bucket.objects.has(blobKey)).toBe(true)

    bucket.failDeletes.delete(blobKey)
    await store.deleteForRun?.('run1')
    await expect(store.list('run1')).resolves.toEqual([])
    expect(bucket.objects.has(blobKey)).toBe(false)
  })
})

describe('createR2BlobStore', () => {
  it('stores, reads, heads, lists, and deletes logical keys with internal R2 prefixes', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2BlobStore(bucket.bucket(), {
      prefix: 'internal/blobs/',
    })

    await expect(
      store.put('runs/run1/out.txt', 'hello', {
        contentType: 'text/plain',
        customMetadata: { runId: 'run1' },
      }),
    ).resolves.toMatchObject({
      key: 'runs/run1/out.txt',
      size: 5,
      contentType: 'text/plain',
      customMetadata: { runId: 'run1' },
    })

    expect(bucket.objects.has('internal/blobs/runs/run1/out.txt')).toBe(true)

    await expect(store.head('runs/run1/out.txt')).resolves.toMatchObject({
      key: 'runs/run1/out.txt',
      size: 5,
      contentType: 'text/plain',
      customMetadata: { runId: 'run1' },
    })
    await expect((await store.get('runs/run1/out.txt'))?.text()).resolves.toBe(
      'hello',
    )

    const page = await store.list({ prefix: 'runs/run1/' })
    expect(page.objects).toMatchObject([
      {
        key: 'runs/run1/out.txt',
        contentType: 'text/plain',
        customMetadata: { runId: 'run1' },
      },
    ])

    await store.delete('runs/run1/out.txt')
    expect(bucket.objects.has('internal/blobs/runs/run1/out.txt')).toBe(false)
  })
})

describe('D1-indexed R2 artifacts', () => {
  it('wires BlobStore and D1-indexed ArtifactStore through cloudflarePersistence', async () => {
    const bucket = new FakeR2Bucket()
    const p = cloudflarePersistence({
      d1: fakeD1(),
      r2: bucket.bucket(),
      r2ArtifactPrefix: 'artifact-bytes/',
    })

    expect(p.stores.blobs).toBeDefined()
    expect(p.stores.artifacts).toBeDefined()

    await p.stores.artifacts!.save(
      artifact({ bytes: new TextEncoder().encode('hello') }),
    )

    expect(
      [...bucket.objects.keys()].some((key) =>
        key.startsWith('artifact-bytes/artifacts/art1/'),
      ),
    ).toBe(true)
    await expect(p.stores.artifacts!.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      bytes: new TextEncoder().encode('hello'),
    })

    bucket.getCount = 0
    await expect(p.stores.artifacts!.list('run1')).resolves.toMatchObject([
      { artifactId: 'art1', runId: 'run1', name: 'out.txt' },
    ])
    expect(bucket.getCount).toBe(0)
  })

  it('deletes artifact metadata and R2 bytes by artifact id and run id', async () => {
    const bucket = new FakeR2Bucket()
    const p = cloudflarePersistence({
      d1: fakeD1(),
      r2: bucket.bucket(),
      r2ArtifactPrefix: 'artifact-bytes/',
    })
    const store = p.stores.artifacts!

    await store.save(
      artifact({
        artifactId: 'art1',
        bytes: new TextEncoder().encode('one'),
      }),
    )
    await store.save(
      artifact({
        artifactId: 'art2',
        bytes: new TextEncoder().encode('two'),
      }),
    )

    await store.delete?.('art1')
    await expect(store.get('art1')).resolves.toBeNull()
    expect(
      bucket.deleted.some((key) =>
        key.startsWith('artifact-bytes/artifacts/art1/'),
      ),
    ).toBe(true)

    await store.deleteForRun?.('run1')
    await expect(store.list('run1')).resolves.toEqual([])
    expect(
      bucket.deleted.some((key) =>
        key.startsWith('artifact-bytes/artifacts/art2/'),
      ),
    ).toBe(true)
  })

  it('deletes stale bytes when an artifact is overwritten with an external URL only', async () => {
    const bucket = new FakeR2Bucket()
    const p = cloudflarePersistence({
      d1: fakeD1(),
      r2: bucket.bucket(),
      r2ArtifactPrefix: 'artifact-bytes/',
    })
    const store = p.stores.artifacts!

    await store.save(
      artifact({
        bytes: new TextEncoder().encode('hello'),
      }),
    )
    await store.save(
      artifact({
        externalUrl: 'https://example.com/out.txt',
        size: 0,
      }),
    )

    expect(
      bucket.deleted.some((key) =>
        key.startsWith('artifact-bytes/artifacts/art1/'),
      ),
    ).toBe(true)
    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      externalUrl: 'https://example.com/out.txt',
    })
    expect((await store.get('art1'))?.bytes).toBeUndefined()
  })

  it('keeps an external URL overwrite when post-commit stale blob cleanup fails', async () => {
    const bucket = new FakeR2Bucket()
    const p = cloudflarePersistence({
      d1: fakeD1(),
      r2: bucket.bucket(),
      r2ArtifactPrefix: 'artifact-bytes/',
    })
    const store = p.stores.artifacts!

    await store.save(
      artifact({
        bytes: new TextEncoder().encode('hello'),
      }),
    )
    const staleBlobKey = [...bucket.objects.keys()].find((key) =>
      key.startsWith('artifact-bytes/artifacts/art1/'),
    )!
    bucket.failDeletes.add(staleBlobKey)

    await expect(
      store.save(
        artifact({
          externalUrl: 'https://example.com/out.txt',
          size: 0,
        }),
      ),
    ).resolves.toBeUndefined()

    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      externalUrl: 'https://example.com/out.txt',
      size: 0,
    })
    expect((await store.get('art1'))?.bytes).toBeUndefined()
    expect(bucket.objects.has(staleBlobKey)).toBe(true)
  })

  it('does not auto-create artifact tables when migrate is false', async () => {
    const p = cloudflarePersistence({
      d1: fakeD1(),
      r2: new FakeR2Bucket().bucket(),
      migrate: false,
    })

    await expect(p.stores.artifacts!.list('run1')).rejects.toThrow(
      /no such table: artifacts/,
    )
  })

  it('keeps existing metadata and bytes consistent when overwrite upsert fails after blob write', async () => {
    const bucket = new FakeR2Bucket()
    const driver = createD1Driver(fakeD1())
    const blobs = createR2BlobStore(bucket.bucket(), {
      prefix: 'artifact-bytes/',
    })
    const store = createCloudflareArtifactStore(driver, blobs)
    await store.save(
      artifact({
        bytes: new TextEncoder().encode('old'),
        size: 3,
      }),
    )

    const failingStore = createCloudflareArtifactStore(
      failNextArtifactUpsert(driver),
      blobs,
    )

    await expect(
      failingStore.save(
        artifact({
          bytes: new TextEncoder().encode('new'),
          size: 3,
        }),
      ),
    ).rejects.toThrow('artifact upsert failed')

    await expect(store.get('art1')).resolves.toMatchObject({
      bytes: new TextEncoder().encode('old'),
    })
    expect(
      [...bucket.objects.keys()].filter((key) =>
        key.includes('artifact-bytes/artifacts/art1'),
      ),
    ).toHaveLength(1)
  })

  it('keeps a D1 artifact row when blob delete by artifact id fails so delete can retry', async () => {
    const bucket = new FakeR2Bucket()
    const p = cloudflarePersistence({
      d1: fakeD1(),
      r2: bucket.bucket(),
      r2ArtifactPrefix: 'artifact-bytes/',
    })
    const store = p.stores.artifacts!
    await store.save(artifact({ bytes: new TextEncoder().encode('hello') }))
    const stored = await store.get('art1')
    expect(stored?.bytes).toEqual(new TextEncoder().encode('hello'))
    const physicalKey = [...bucket.objects.keys()].find((key) =>
      key.includes('artifact-bytes/artifacts/art1'),
    )!
    bucket.failDeletes.add(physicalKey)

    await expect(store.delete?.('art1')).rejects.toThrow(/delete failed/)

    await expect(store.get('art1')).resolves.toMatchObject({
      artifactId: 'art1',
      bytes: new TextEncoder().encode('hello'),
    })

    bucket.failDeletes.delete(physicalKey)
    await store.delete?.('art1')
    await expect(store.get('art1')).resolves.toBeNull()
  })

  it('keeps D1 artifact rows when blob delete by run fails so deleteForRun can retry', async () => {
    const bucket = new FakeR2Bucket()
    const p = cloudflarePersistence({
      d1: fakeD1(),
      r2: bucket.bucket(),
      r2ArtifactPrefix: 'artifact-bytes/',
    })
    const store = p.stores.artifacts!
    await store.save(
      artifact({
        artifactId: 'art1',
        bytes: new TextEncoder().encode('one'),
      }),
    )
    await store.save(
      artifact({
        artifactId: 'art2',
        bytes: new TextEncoder().encode('two'),
      }),
    )
    const physicalKey = [...bucket.objects.keys()].find((key) =>
      key.includes('artifact-bytes/artifacts/art1'),
    )!
    bucket.failDeletes.add(physicalKey)

    await expect(store.deleteForRun?.('run1')).rejects.toThrow(/delete failed/)

    await expect(store.list('run1')).resolves.toHaveLength(2)

    bucket.failDeletes.delete(physicalKey)
    await store.deleteForRun?.('run1')
    await expect(store.list('run1')).resolves.toEqual([])
  })

  it('exports artifact table DDL for self-managed Cloudflare migrations', () => {
    const statements = cloudflareArtifactDdl()
    expect(statements.join('\n')).toMatch(
      /CREATE TABLE IF NOT EXISTS artifacts/,
    )
    expect(statements.join('\n')).toMatch(/idx_artifacts_run_id/)
  })
})

describe('Durable Object locks', () => {
  it('serializes same-key work and releases after thrown callbacks', async () => {
    const ns = new FakeDurableObjectNamespace()
    const locks = createDurableObjectLockStore(ns.namespace(), {
      leaseMs: 250,
      pollMs: 1,
    })
    const events: Array<string> = []

    const first = locks.withLock('thread1', async () => {
      events.push('first:start')
      await new Promise((resolve) => setTimeout(resolve, 20))
      events.push('first:end')
    })
    const second = locks.withLock('thread1', async () => {
      events.push('second')
    })

    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second'])

    await expect(
      locks.withLock('thread1', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    await expect(
      locks.withLock('thread1', async () => 'after-error'),
    ).resolves.toBe('after-error')
  })

  it('does not release a holder when the owner token does not match', async () => {
    const object = new LockDurableObject(
      new FakeDurableObjectState() as unknown as DurableObjectState,
    )

    const acquire = await object.fetch(
      new Request('https://lock/acquire', {
        method: 'POST',
        body: JSON.stringify({ owner: 'owner-a', leaseMs: 60_000 }),
      }),
    )
    expect(acquire.status).toBe(200)

    const wrongRelease = await object.fetch(
      new Request('https://lock/release', {
        method: 'POST',
        body: JSON.stringify({ owner: 'owner-b' }),
      }),
    )
    expect(wrongRelease.status).toBe(409)

    const blocked = await object.fetch(
      new Request('https://lock/acquire', {
        method: 'POST',
        body: JSON.stringify({ owner: 'owner-c', leaseMs: 60_000 }),
      }),
    )
    expect(blocked.status).toBe(409)
  })

  it('surfaces unexpected acquire failures instead of retrying forever', async () => {
    let attempts = 0
    const ns = new FetchDurableObjectNamespace(async () => {
      attempts++
      if (attempts > 1) throw new Error('retried unexpected acquire failure')
      return Response.json({ error: 'storage unavailable' }, { status: 503 })
    })
    const locks = createDurableObjectLockStore(ns.namespace(), {
      leaseMs: 250,
      pollMs: 1,
    })

    await expect(
      locks.withLock('thread1', async () => 'never'),
    ).rejects.toThrow(/acquire.*503.*storage unavailable/)
    expect(attempts).toBe(1)
  })

  it('rejects the critical section when lock renewal fails', async () => {
    let renewCalls = 0
    const ns = new FetchDurableObjectNamespace(async (input) => {
      const path = new URL(String(input)).pathname
      if (path === '/acquire') return Response.json({ ok: true })
      if (path === '/renew') {
        renewCalls++
        return Response.json({ error: 'lease lost' }, { status: 409 })
      }
      return Response.json({ ok: true })
    })
    const locks = createDurableObjectLockStore(ns.namespace(), {
      leaseMs: 10,
      pollMs: 1,
    })

    await expect(
      locks.withLock(
        'thread1',
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
      ),
    ).rejects.toThrow(/renew.*409.*lease lost/)
    expect(renewCalls).toBe(1)
  })

  it('preserves callback errors when release also fails', async () => {
    const ns = new FetchDurableObjectNamespace(async (input) => {
      const path = new URL(String(input)).pathname
      if (path === '/release') {
        return Response.json({ error: 'release failed' }, { status: 503 })
      }
      return Response.json({ ok: true })
    })
    const locks = createDurableObjectLockStore(ns.namespace(), {
      leaseMs: 250,
      pollMs: 1,
    })

    await expect(
      locks.withLock('thread1', async () => {
        throw new Error('callback failed')
      }),
    ).rejects.toThrow('callback failed')
  })

  it('preserves renewal errors when release also fails', async () => {
    const ns = new FetchDurableObjectNamespace(async (input) => {
      const path = new URL(String(input)).pathname
      if (path === '/acquire') return Response.json({ ok: true })
      if (path === '/renew') {
        return Response.json({ error: 'lease lost' }, { status: 409 })
      }
      return Response.json({ error: 'release failed' }, { status: 503 })
    })
    const locks = createDurableObjectLockStore(ns.namespace(), {
      leaseMs: 10,
      pollMs: 1,
    })

    await expect(
      locks.withLock(
        'thread1',
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
      ),
    ).rejects.toThrow(/renew.*lease lost/)
  })

  it('surfaces release failures when the critical section succeeds', async () => {
    const ns = new FetchDurableObjectNamespace(async (input) => {
      const path = new URL(String(input)).pathname
      if (path === '/release') {
        return Response.json({ error: 'release failed' }, { status: 503 })
      }
      return Response.json({ ok: true })
    })
    const locks = createDurableObjectLockStore(ns.namespace(), {
      leaseMs: 250,
      pollMs: 1,
    })

    await expect(locks.withLock('thread1', async () => 'ok')).rejects.toThrow(
      /release.*503.*release failed/,
    )
  })

  it('rejects invalid lock timing options before creating a store', () => {
    expect(() =>
      createDurableObjectLockStore(
        new FakeDurableObjectNamespace().namespace(),
        {
          leaseMs: 0,
        },
      ),
    ).toThrow(/leaseMs/)
    expect(() =>
      createDurableObjectLockStore(
        new FakeDurableObjectNamespace().namespace(),
        {
          pollMs: Number.POSITIVE_INFINITY,
        },
      ),
    ).toThrow(/pollMs/)
  })

  it('rejects invalid lock timing request payloads', async () => {
    const object = new LockDurableObject(
      new FakeDurableObjectState() as unknown as DurableObjectState,
    )

    const response = await object.fetch(
      new Request('https://lock/acquire', {
        method: 'POST',
        body: JSON.stringify({ owner: 'owner-a', leaseMs: 0 }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.text()).resolves.toMatch(/leaseMs/)
  })
})
