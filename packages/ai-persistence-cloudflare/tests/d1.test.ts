/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import {
  cloudflarePersistence,
  createD1Driver,
  createR2ArtifactStore,
} from '../src/index'
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
  readonly objects = new Map<string, Uint8Array>()
  readonly deleted: Array<string> = []

  async put(key: string, value: string | ArrayBuffer | Uint8Array) {
    if (typeof value === 'string') {
      this.objects.set(key, new TextEncoder().encode(value))
    } else if (value instanceof ArrayBuffer) {
      this.objects.set(key, new Uint8Array(value))
    } else {
      this.objects.set(key, new Uint8Array(value))
    }
    return null
  }

  async get(key: string) {
    const value = this.objects.get(key)
    if (!value) return null
    return {
      async arrayBuffer() {
        return value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        )
      },
      async text() {
        return new TextDecoder().decode(value)
      },
      async json() {
        return JSON.parse(new TextDecoder().decode(value))
      },
    }
  }

  async delete(key: string) {
    this.deleted.push(key)
    this.objects.delete(key)
  }

  async list(options?: { prefix?: string; cursor?: string }) {
    return {
      objects: [...this.objects.keys()]
        .filter((key) => key.startsWith(options?.prefix ?? ''))
        .sort()
        .map((key) => ({ key })),
      truncated: false,
    }
  }

  bucket(): R2Bucket {
    return this as unknown as R2Bucket
  }
}

const artifact = (
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord => ({
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
    expect(bucket.objects.has('test-artifacts/blobs/art1')).toBe(true)

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
    expect(bucket.deleted).toContain(
      'test-artifacts/by-run/old-run/art1.json',
    )
    expect(bucket.deleted).toContain('test-artifacts/blobs/art1')
  })
})
