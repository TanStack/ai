import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SandboxHandle, SandboxFsStat } from '../src/contracts'
import type { SandboxSnapshotEntry } from '../src/checkpoint-store'
import type { ArtifactRecord, ArtifactStore } from '@tanstack/ai-persistence'
import {
  captureSandboxFiles,
  captureSandboxArtifacts,
  defaultSandboxSnapshotPolicy,
  restoreSandboxFiles,
  SandboxSnapshotError,
} from '../src/snapshots'

type Entry = {
  type: 'file' | 'dir' | 'symlink' | 'other'
  mode: number
  bytes?: Uint8Array
}

function artifactStore(
  listForThread: ArtifactStore['listForThread'],
): ArtifactStore {
  return {
    listForThread,
    save: async () => {},
    get: async () => null,
    list: async () => [],
    delete: async () => {},
    deleteForRun: async () => {},
  }
}

function artifactRecord(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
    artifactId: 'a',
    runId: 'r',
    threadId: 't',
    name: 'a',
    mimeType: 'x',
    size: 1,
    createdAt: 1,
    ...overrides,
  }
}

function fakeHandle(entries: Record<string, Entry>): SandboxHandle {
  const normalize = (path: string) =>
    path.replace(/\\/g, '/').replace(/\/+/g, '/')
  const parentDirs = (path: string) => {
    const parts = normalize(path).split('/').filter(Boolean)
    for (let i = 1; i < parts.length; i++)
      entries[`/${parts.slice(0, i).join('/')}`] ??= {
        type: 'dir',
        mode: 0o755,
      }
  }
  for (const path of Object.keys(entries)) parentDirs(path)
  const fs = {
    async read(path: string) {
      return new TextDecoder().decode(await this.readBytes(path))
    },
    async readBytes(path: string) {
      const e = entries[normalize(path)]
      if (!e?.bytes) throw new Error(`missing ${path}`)
      return e.bytes
    },
    async write(path: string, data: string | Uint8Array) {
      const bytes =
        typeof data === 'string' ? new TextEncoder().encode(data) : data
      parentDirs(path)
      entries[normalize(path)] = {
        type: 'file',
        mode: 0o644,
        bytes: bytes.slice(),
      }
    },
    async list(path: string) {
      const root = normalize(path).replace(/\/$/, '')
      const seen = new Map<string, 'file' | 'dir'>()
      for (const [key, value] of Object.entries(entries)) {
        if (!key.startsWith(`${root}/`)) continue
        const rest = key.slice(root.length + 1)
        if (!rest || rest.includes('/')) {
          const name = rest.split('/')[0]!
          seen.set(
            name,
            rest.includes('/') ? 'dir' : value.type === 'dir' ? 'dir' : 'file',
          )
        } else seen.set(rest, value.type === 'dir' ? 'dir' : 'file')
      }
      return Array.from(seen, ([name, type]) => ({
        name,
        path: `${root}/${name}`,
        type,
      }))
    },
    async mkdir(path: string) {
      entries[normalize(path)] = { type: 'dir', mode: 0o755 }
      parentDirs(path)
    },
    async remove(path: string) {
      const root = normalize(path)
      for (const key of Object.keys(entries))
        if (key === root || key.startsWith(`${root}/`)) delete entries[key]
    },
    async rename() {},
    async exists(path: string) {
      return Boolean(entries[normalize(path)])
    },
    async lstat(path: string): Promise<SandboxFsStat | undefined> {
      const e = entries[normalize(path)]
      if (!e && normalize(path) === '/workspace')
        return { type: 'dir', mode: 0o755 }
      if (!e) return undefined
      return e.type === 'file'
        ? { type: 'file', mode: e.mode, size: e.bytes?.byteLength ?? 0 }
        : e.type === 'dir'
          ? { type: 'dir', mode: e.mode }
          : { type: e.type, mode: e.mode }
    },
  }
  return {
    id: 'fake',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      ports: false,
      snapshots: false,
      fork: false,
      env: false,
      backgroundProcesses: false,
      writableStdin: false,
      killableProcesses: false,
      networkPolicy: false,
      durableFilesystem: false,
    },
    fs,
    git: {
      clone: async () => {},
      status: async () => '',
      add: async () => {},
      commit: async () => {},
      push: async () => {},
      pull: async () => {},
      branch: async () => '',
    },
    process: {
      exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      spawn: async () => {
        throw new Error('unsupported')
      },
    },
    ports: { connect: async () => ({ url: '' }) },
    env: { set: async () => {} },
    destroy: async () => {},
  }
}

function blobs() {
  const values = new Map<string, Uint8Array>()
  const deletes: string[] = []
  let putCount = 0
  return {
    values,
    deletes,
    get putCount() {
      return putCount
    },
    async put(key: string, body: Uint8Array) {
      putCount++
      values.set(key, body)
      return { key, size: body.byteLength }
    },
    async get(key: string) {
      const value = values.get(key)
      return value
        ? {
            key,
            size: value.byteLength,
            arrayBuffer: async () => value.slice().buffer,
            text: async () => new TextDecoder().decode(value),
          }
        : null
    },
    async head(key: string) {
      const value = values.get(key)
      return value ? { key, size: value.byteLength } : null
    },
    async delete(key: string) {
      deletes.push(key)
      values.delete(key)
    },
  }
}

function blobsWithAccessLog() {
  const store = blobs()
  const gets: string[] = []
  const heads: string[] = []
  const get = store.get
  const head = store.head
  store.get = async (key) => {
    gets.push(key)
    return get(key)
  }
  store.head = async (key) => {
    heads.push(key)
    return head(key)
  }
  return { store, gets, heads }
}

function fsMutationLog(handle: SandboxHandle) {
  const writes: string[] = []
  const removes: string[] = []
  const mkdirs: string[] = []
  const write = handle.fs.write
  const remove = handle.fs.remove
  const mkdir = handle.fs.mkdir
  handle.fs.write = async (path, data) => {
    writes.push(path)
    await write(path, data)
  }
  handle.fs.remove = async (path) => {
    removes.push(path)
    await remove(path)
  }
  handle.fs.mkdir = async (path) => {
    mkdirs.push(path)
    await mkdir(path)
  }
  return { writes, removes, mkdirs }
}

async function putSnapshotBlob(
  store: ReturnType<typeof blobs>,
  bytes: Uint8Array,
) {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice())
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const key = `sandbox-files/sha256/${hash}`
  await store.put(key, bytes)
  return key
}

describe('portable sandbox snapshots', () => {
  it('fails loudly when artifact persistence support is absent', async () => {
    await expect(
      captureSandboxArtifacts({ blobs: blobs() }, 'thread-1'),
    ).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_ARTIFACT_SUPPORT_REQUIRED',
    })
  })

  it('captures thread artifacts through the real listForThread resolver and reuses source reads', async () => {
    const store = blobs()
    const sourceKey = 'custom/source'
    await store.put(sourceKey, new Uint8Array([1, 2, 3]))
    let listed = ''
    let reads = 0
    const originalGet = store.get
    store.get = async (key) => {
      if (key === sourceKey) reads++
      return originalGet(key)
    }
    const artifacts = {
      listForThread: async (threadId: string) => {
        listed = threadId
        return [
          {
            artifactId: 'b',
            runId: 'run',
            threadId,
            name: 'b',
            mimeType: 'x',
            size: 3,
            createdAt: 2,
            blobKey: sourceKey,
          },
          {
            artifactId: 'a',
            runId: 'run',
            threadId,
            name: 'a',
            mimeType: 'x',
            size: 3,
            createdAt: 1,
            blobKey: sourceKey,
          },
        ]
      },
    }
    const captured = await captureSandboxArtifacts(
      { blobs: store, artifacts: artifactStore(artifacts.listForThread) },
      'thread-9',
    )
    expect(listed).toBe('thread-9')
    expect(reads).toBe(1)
    expect(captured.map((artifact) => artifact.artifactId)).toEqual(['a', 'b'])
    expect(captured[0]?.blobKey).toBe(captured[1]?.blobKey)
  })

  it('orders tied artifact timestamps by UTF-8 bytes', async () => {
    const store = blobs()
    const sourceKey = 'source/blob'
    await store.put(sourceKey, new Uint8Array([1]))
    const artifacts = artifactStore(async () => [
      artifactRecord({
        artifactId: '\u{10000}',
        name: 'high',
        blobKey: sourceKey,
      }),
      artifactRecord({
        artifactId: '\uE000',
        name: 'private',
        blobKey: sourceKey,
      }),
    ])
    const captured = await captureSandboxArtifacts(
      { blobs: store, artifacts },
      't',
    )
    expect(captured.map((artifact) => artifact.artifactId)).toEqual([
      '\uE000',
      '\u{10000}',
    ])
  })

  it('verifies every source before touching destination artifact blobs', async () => {
    const store = blobs()
    const sourceKey = 'source/valid'
    await store.put(sourceKey, new Uint8Array([1]))
    const heads: string[] = []
    const puts: string[] = []
    const originalHead = store.head
    const originalPut = store.put
    store.head = async (key) => {
      heads.push(key)
      return originalHead(key)
    }
    store.put = async (key, body) => {
      puts.push(key)
      return originalPut(key, body)
    }
    const artifacts = artifactStore(async () => [
      artifactRecord({
        artifactId: 'valid',
        name: 'valid',
        blobKey: sourceKey,
      }),
      artifactRecord({
        artifactId: 'missing',
        name: 'missing',
        createdAt: 2,
        blobKey: 'source/missing',
      }),
    ])
    await expect(
      captureSandboxArtifacts({ blobs: store, artifacts }, 't'),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISSING_ARTIFACT_BLOB' })
    expect(heads).toEqual([])
    expect(puts).toEqual([])
  })

  it('uses artifact resolver fallback and never writes a partial result on missing source', async () => {
    const store = blobs()
    const artifacts = {
      listForThread: async () => [
        {
          artifactId: 'missing',
          runId: 'run',
          threadId: 't',
          name: 'x',
          mimeType: 'x',
          size: 1,
          createdAt: 1,
        },
      ],
    }
    await expect(
      captureSandboxArtifacts(
        { blobs: store, artifacts: artifactStore(artifacts.listForThread) },
        't',
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISSING_ARTIFACT_BLOB' })
    expect(store.putCount).toBe(0)
  })

  it('uses head for an existing immutable artifact blob and never deletes source blobs', async () => {
    const store = blobs()
    const sourceKey = 'source/blob'
    const bytes = new Uint8Array([1, 2, 3])
    await store.put(sourceKey, bytes)
    let puts = 0
    const originalPut = store.put
    store.put = async (key, body) => {
      puts++
      return originalPut(key, body)
    }
    const artifacts = artifactStore(async () => [
      artifactRecord({ blobKey: sourceKey, size: 3 }),
    ])
    await captureSandboxArtifacts({ blobs: store, artifacts }, 't')
    expect(puts).toBe(1)
    await captureSandboxArtifacts({ blobs: store, artifacts }, 't')
    expect(puts).toBe(1)
    expect(store.deletes).toEqual([])
  })

  it('does not put an artifact when its source blob is missing', async () => {
    const store = blobs()
    const artifacts = artifactStore(async () => [
      artifactRecord({ artifactId: 'missing', name: 'x' }),
    ])
    await expect(
      captureSandboxArtifacts({ blobs: store, artifacts }, 't'),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISSING_ARTIFACT_BLOB' })
    expect(store.putCount).toBe(0)
  })

  it('orders Unicode file metadata by UTF-8 bytes', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/é': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
        '/workspace/e\u0301': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
      }),
      { blobs: blobs() },
    )
    expect(
      snapshot.files
        .filter((entry) => entry.kind === 'file')
        .map((entry) => entry.path),
    ).toEqual(['e\u0301', 'é'])
  })
  it('uses a non-default workspace root for capture and restore', async () => {
    const paths: string[] = []
    const source = fakeHandle({
      '/custom/root/a': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    const sourceLstat = source.fs.lstat!
    source.fs.lstat = async (path) => {
      paths.push(path)
      return sourceLstat(path)
    }
    const bundle = { blobs: blobs(), workspaceRoot: '/custom/root' }
    const snapshot = await captureSandboxFiles(source, bundle)
    const target = fakeHandle({ '/custom/root': { type: 'dir', mode: 0o755 } })
    const targetWrite = target.fs.write
    target.fs.write = async (path, bytes) => {
      paths.push(path)
      return targetWrite(path, bytes)
    }
    await restoreSandboxFiles(target, bundle, snapshot)
    expect(paths.every((path) => !path.startsWith('/workspace'))).toBe(true)
    expect(await target.fs.exists('/custom/root/a')).toBe(true)
  })
  it('rejects unsafe manifests before mutation', async () => {
    const target = fakeHandle({
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await expect(
      restoreSandboxFiles(
        target,
        { blobs: blobs() },
        { files: [{ path: '../escape', kind: 'dir' }] },
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })
    expect(await target.fs.exists('/workspace/keep')).toBe(true)
  })

  it('rejects duplicate paths after validating each path', async () => {
    await expect(
      restoreSandboxFiles(
        fakeHandle({}),
        { blobs: blobs() },
        {
          files: [
            { path: 'a', kind: 'dir' },
            { path: 'a', kind: 'dir' },
          ],
        },
      ),
    ).rejects.toThrow('Duplicate path')
  })

  it('rejects file ancestors after validating each path', async () => {
    await expect(
      restoreSandboxFiles(
        fakeHandle({}),
        { blobs: blobs() },
        {
          files: [
            {
              path: 'a',
              kind: 'file',
              blobKey: `sandbox-files/sha256/${'0'.repeat(64)}`,
              size: 1,
            },
            { path: 'a/b', kind: 'dir' },
          ],
        },
      ),
    ).rejects.toThrow('File ancestor')
  })

  it('requires lstat for capture', async () => {
    const handle = fakeHandle({})
    handle.fs.lstat = undefined
    await expect(
      captureSandboxFiles(handle, { blobs: blobs() }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_LSTAT_REQUIRED' })
  })

  it('requires lstat for restore before mutation', async () => {
    const target = fakeHandle({
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    target.fs.lstat = undefined
    await expect(
      restoreSandboxFiles(target, { blobs: blobs() }, { files: [] }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_LSTAT_REQUIRED' })
    expect(await target.fs.exists('/workspace/keep')).toBe(true)
  })

  it('rejects generated projection marker paths before mutation', async () => {
    const target = fakeHandle({
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await expect(
      restoreSandboxFiles(
        target,
        { blobs: blobs() },
        {
          files: [{ path: '.tanstack-projected-abc123', kind: 'dir' }],
        },
        defaultSandboxSnapshotPolicy('abc123'),
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })
    expect(await target.fs.exists('/workspace/keep')).toBe(true)
  })

  it('reuses an existing content-addressed blob and returns known sha256', async () => {
    const store = blobs()
    const bytes = new TextEncoder().encode('hello')
    const first = await captureSandboxFiles(
      fakeHandle({ '/workspace/a': { type: 'file', mode: 0o644, bytes } }),
      { blobs: store },
    )
    const second = await captureSandboxFiles(
      fakeHandle({ '/workspace/b': { type: 'file', mode: 0o644, bytes } }),
      { blobs: store },
    )
    expect(first.files[0]).toMatchObject({
      blobKey:
        'sandbox-files/sha256/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    })
    expect(second.files[0]).toMatchObject({
      blobKey: first.files[0]?.kind === 'file' ? first.files[0].blobKey : '',
    })
    expect(store.putCount).toBe(1)
  })

  it('does not complete capture when blob put fails', async () => {
    const store = blobs()
    store.put = async () => {
      throw new Error('put failed')
    }
    await expect(
      captureSandboxFiles(
        fakeHandle({
          '/workspace/a': {
            type: 'file',
            mode: 0o644,
            bytes: new Uint8Array([1]),
          },
        }),
        { blobs: store },
      ),
    ).rejects.toThrow('put failed')
  })
  it('captures binary files and empty directories with content-addressed blobs', async () => {
    const bundle = { blobs: blobs() }
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/image.bin': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([0, 255, 1]),
        },
        '/workspace/empty': { type: 'dir', mode: 0o755 },
      }),
      bundle,
      defaultSandboxSnapshotPolicy(),
    )
    expect(snapshot.files).toContainEqual({ path: 'empty', kind: 'dir' })
    const image = snapshot.files.find((x) => x.path === 'image.bin')
    expect(image?.kind).toBe('file')
    expect(image && image.kind === 'file' ? image.blobKey : '').toMatch(
      /^sandbox-files\/sha256\/[0-9a-f]{64}$/,
    )
  })

  it('omits non-empty directories from the manifest', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/nested/file.txt': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
      }),
      { blobs: blobs() },
    )
    expect(snapshot.files).not.toContainEqual({ path: 'nested', kind: 'dir' })
  })

  it('redacts resolved secrets before hashing and storing', async () => {
    const bundle = { blobs: blobs() }
    const policy = {
      ...defaultSandboxSnapshotPolicy(),
      redact: ({
        bytes,
        resolvedSecrets,
      }: {
        path: string
        bytes: Uint8Array
        resolvedSecrets: Record<string, string>
      }) => {
        let text = new TextDecoder().decode(bytes)
        for (const [name, secret] of Object.entries(resolvedSecrets))
          text = text.replaceAll(secret, `[${name}]`)
        return new TextEncoder().encode(text)
      },
    }
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/app.ts': {
          type: 'file',
          mode: 0o644,
          bytes: new TextEncoder().encode('key=secret-value'),
        },
      }),
      bundle,
      policy,
      { API_KEY: 'secret-value' },
    )
    const entry = snapshot.files.find((x) => x.path === 'app.ts')
    expect(entry?.kind).toBe('file')
    if (!entry || entry.kind !== 'file') throw new Error('expected file')
    expect(
      await bundle.blobs
        .get(entry.blobKey)
        .then(async (x) =>
          x
            ? new TextDecoder().decode(new Uint8Array(await x.arrayBuffer()))
            : '',
        ),
    ).not.toContain('secret-value')
  })

  it('redacts secrets deterministically and keeps the longest overlapping secret hidden', async () => {
    const bytes = new TextEncoder().encode('prefix-secret-long-suffix')
    const first = await captureSandboxFiles(
      fakeHandle({ '/workspace/a': { type: 'file', mode: 0o644, bytes } }),
      { blobs: blobs() },
      defaultSandboxSnapshotPolicy(),
      { short: 'secret', long: 'secret-long' },
    )
    const second = await captureSandboxFiles(
      fakeHandle({ '/workspace/a': { type: 'file', mode: 0o644, bytes } }),
      { blobs: blobs() },
      defaultSandboxSnapshotPolicy(),
      { long: 'secret-long', short: 'secret' },
    )
    expect(first.files[0]).toEqual(second.files[0])
    const store = blobs()
    await captureSandboxFiles(
      fakeHandle({ '/workspace/a': { type: 'file', mode: 0o644, bytes } }),
      { blobs: store },
      defaultSandboxSnapshotPolicy(),
      { short: 'secret', long: 'secret-long' },
    )
    const value = [...store.values.values()][0]
    expect(value && new TextDecoder().decode(value)).not.toContain('secret')
  })

  it('applies built-in secret redaction after policy redaction', async () => {
    const store = blobs()
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/a': {
          type: 'file',
          mode: 0o644,
          bytes: new TextEncoder().encode('secret'),
        },
      }),
      { blobs: store },
      { redact: ({ bytes }) => bytes },
      { key: 'secret' },
    )
    const entry = snapshot.files[0]
    if (!entry || entry.kind !== 'file') throw new Error('expected file')
    const value = await store.get(entry.blobKey)
    expect(value && (await value.text())).not.toContain('secret')
  })

  it('stores fixed zero bytes for secrets, not a secret fingerprint', async () => {
    const store = blobs()
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/a': {
          type: 'file',
          mode: 0o644,
          bytes: new TextEncoder().encode('x=secret'),
        },
      }),
      { blobs: store },
      defaultSandboxSnapshotPolicy(),
      { key: 'secret' },
    )
    const entry = snapshot.files.find((file) => file.path === 'a')
    if (!entry || entry.kind !== 'file') throw new Error('expected file')
    const value = store.values.get(entry.blobKey)
    expect(value).toEqual(new Uint8Array([120, 61, 0, 0, 0, 0, 0, 0]))
  })

  it('zeros the union of overlapping file secret matches', async () => {
    const store = blobs()
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/a': {
          type: 'file',
          mode: 0o644,
          bytes: new TextEncoder().encode('abcde'),
        },
      }),
      { blobs: store },
      defaultSandboxSnapshotPolicy(),
      { first: 'abcd', second: 'bcde' },
    )
    const entry = snapshot.files.find((file) => file.path === 'a')
    if (!entry || entry.kind !== 'file') throw new Error('expected file')
    expect(store.values.get(entry.blobKey)).toEqual(new Uint8Array(5))
  })

  it('redacts artifact bytes with the final configured secrets', async () => {
    const store = blobs()
    await store.put('source', new TextEncoder().encode('artifact-secret'))
    const captured = await captureSandboxArtifacts(
      {
        blobs: store,
        artifacts: artifactStore(async () => [
          artifactRecord({
            mimeType: 'text/plain',
            size: 15,
            blobKey: 'source',
          }),
        ]),
      },
      't',
      { key: 'secret' },
    )
    const value = store.values.get(captured[0]!.blobKey)
    expect(value).toEqual(new TextEncoder().encode('artifact-\0\0\0\0\0\0'))
  })

  it('zeros the union of overlapping artifact secret matches', async () => {
    const store = blobs()
    await store.put('source', new TextEncoder().encode('abcde'))
    const captured = await captureSandboxArtifacts(
      {
        blobs: store,
        artifacts: artifactStore(async () => [
          artifactRecord({
            mimeType: 'application/octet-stream',
            size: 5,
            blobKey: 'source',
          }),
        ]),
      },
      't',
      { first: 'abcd', second: 'bcde' },
    )
    expect(store.values.get(captured[0]!.blobKey)).toEqual(new Uint8Array(5))
  })

  it('traverses a parent directory when only nested TypeScript files are included', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/src/app.ts': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
        '/workspace/src/app.js': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([2]),
        },
      }),
      { blobs: blobs() },
      { include: (path, kind) => kind === 'dir' || path.endsWith('.ts') },
    )
    expect(snapshot.files.map((file) => file.path)).toEqual(['src/app.ts'])
  })

  it('performs one destination head/put per equal artifact digest', async () => {
    const store = blobs()
    await store.put('source-a', new Uint8Array([1, 2]))
    await store.put('source-b', new Uint8Array([1, 2]))
    let heads = 0
    let puts = 0
    const head = store.head
    const put = store.put
    store.head = async (key) => {
      heads++
      return head(key)
    }
    store.put = async (key, bytes) => {
      puts++
      return put(key, bytes)
    }
    await captureSandboxArtifacts(
      {
        blobs: store,
        artifacts: artifactStore(async () => [
          artifactRecord({ size: 2, blobKey: 'source-a' }),
          artifactRecord({
            artifactId: 'b',
            name: 'b',
            size: 2,
            createdAt: 2,
            blobKey: 'source-b',
          }),
        ]),
      },
      't',
    )
    expect(heads).toBe(1)
    expect(puts).toBe(1)
  })

  it('performs one destination head and put for equal file bytes', async () => {
    const store = blobs()
    let heads = 0
    let puts = 0
    const head = store.head
    const put = store.put
    store.head = async (key) => {
      heads++
      return head(key)
    }
    store.put = async (key, bytes) => {
      puts++
      return put(key, bytes)
    }
    await captureSandboxFiles(
      fakeHandle({
        '/workspace/a': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([7]),
        },
        '/workspace/b': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([7]),
        },
      }),
      { blobs: store },
    )
    expect(heads).toBe(1)
    expect(puts).toBe(1)
  })

  it('hashes payloads without calling Uint8Array.prototype.slice', async () => {
    const store = blobs()
    const originalSlice = Uint8Array.prototype.slice
    let slices = 0
    Uint8Array.prototype.slice = function (...args) {
      slices++
      return originalSlice.apply(this, args)
    }
    try {
      await captureSandboxFiles(
        fakeHandle({
          '/workspace/a': {
            type: 'file',
            mode: 0o644,
            bytes: new Uint8Array([1]),
          },
        }),
        { blobs: store },
      )
      const source = new Uint8Array([2])
      await store.put('source', source)
      await captureSandboxArtifacts(
        {
          blobs: store,
          artifacts: artifactStore(async () => [
            artifactRecord({ blobKey: 'source' }),
          ]),
        },
        't',
      )
    } finally {
      Uint8Array.prototype.slice = originalSlice
    }
    // One file redaction, one artifact source read, and one artifact redaction
    // each use slice; hashing must not add another payload copy.
    expect(slices).toBe(3)
  })

  it('keeps persistence optional and type-only in snapshot source', () => {
    const packageJson = JSON.parse(
      readFileSync(
        new URL('../../ai-sandbox/package.json', import.meta.url),
        'utf8',
      ),
    )
    if (
      typeof packageJson !== 'object' ||
      packageJson === null ||
      !('peerDependenciesMeta' in packageJson)
    )
      throw new Error('invalid package.json')
    expect(
      packageJson.peerDependenciesMeta?.['@tanstack/ai-persistence']?.optional,
    ).toBe(true)
    const source = readFileSync(
      new URL('../src/snapshots.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(
      /import(?!\s+type)[^;]*['"]@tanstack\/ai-persistence['"]/,
    )
  })

  it.each(['.git/config', 'node_modules/x', '.env.local'])(
    'excludes %s',
    async (path) => {
      const snapshot = await captureSandboxFiles(
        fakeHandle({
          [`/workspace/${path}`]: {
            type: 'file',
            mode: 0o644,
            bytes: new Uint8Array([1]),
          },
        }),
        { blobs: blobs() },
        defaultSandboxSnapshotPolicy(),
      )
      expect(snapshot.files).not.toContainEqual(
        expect.objectContaining({ path }),
      )
    },
  )

  it.each([
    'src/.git/config',
    'src/node_modules/pkg/index.js',
    'src/.env.local',
  ])(
    'excludes protected segments at any depth during capture: %s',
    async (path) => {
      const snapshot = await captureSandboxFiles(
        fakeHandle({
          [`/workspace/${path}`]: {
            type: 'file',
            mode: 0o644,
            bytes: new Uint8Array([1]),
          },
        }),
        { blobs: blobs() },
        defaultSandboxSnapshotPolicy(),
      )
      expect(snapshot.files).not.toContainEqual(
        expect.objectContaining({ path }),
      )
    },
  )

  it('captures projection-looking user files without a workspace hash', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/.tanstack-projected-other/file': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
      }),
      { blobs: blobs() },
      defaultSandboxSnapshotPolicy(),
    )
    expect(snapshot.files).toContainEqual(
      expect.objectContaining({ path: '.tanstack-projected-other/file' }),
    )
  })

  it('does not inspect an excluded symlink during capture', async () => {
    const handle = fakeHandle({
      '/workspace/.git': { type: 'symlink', mode: 0o777 },
    })
    const inspected: string[] = []
    const originalLstat = handle.fs.lstat!
    handle.fs.lstat = async (path) => {
      inspected.push(path)
      return originalLstat(path)
    }

    await expect(
      captureSandboxFiles(handle, { blobs: blobs() }),
    ).resolves.toEqual({ files: [] })

    expect(inspected.every((path) => path === '/workspace')).toBe(true)
  })

  it('excludes bootstrap-owned instruction symlinks during capture', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/AGENTS.md': {
          type: 'file',
          mode: 0o644,
          bytes: new TextEncoder().encode('# Instructions'),
        },
        '/workspace/CLAUDE.md': { type: 'symlink', mode: 0o777 },
        '/workspace/GEMINI.md': { type: 'symlink', mode: 0o777 },
      }),
      { blobs: blobs() },
    )

    expect(snapshot.files.map((entry) => entry.path)).toEqual(['AGENTS.md'])
  })

  it.each([
    '.claude/skills/review',
    '.codex/skills/review',
    '.grok/skills/review',
  ])(
    'excludes a projected git-skill symlink during capture: %s',
    async (path) => {
      const snapshot = await captureSandboxFiles(
        fakeHandle({
          '/workspace/.tanstack-skills/review/SKILL.md': {
            type: 'file',
            mode: 0o644,
            bytes: new TextEncoder().encode('# Review'),
          },
          [`/workspace/${path}`]: { type: 'symlink', mode: 0o777 },
        }),
        { blobs: blobs() },
      )

      const capturedPaths = snapshot.files.map((entry) => entry.path)
      expect(capturedPaths).toContain('.tanstack-skills/review/SKILL.md')
      expect(capturedPaths).not.toContain(path)
    },
  )

  it('keeps a user .tanstack directory', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/.tanstack/data': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
      }),
      { blobs: blobs() },
      defaultSandboxSnapshotPolicy(),
    )
    expect(snapshot.files).toContainEqual(
      expect.objectContaining({ path: '.tanstack/data' }),
    )
  })

  it('excludes only the default protected roots while preserving similarly named files', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/.git/config': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
        '/workspace/node_modules/pkg/index.js': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
        '/workspace/.env.local': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
        '/workspace/.gitkeep': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
        '/workspace/node_modules.txt': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
      }),
      { blobs: blobs() },
      defaultSandboxSnapshotPolicy('hash'),
    )
    expect(snapshot.files.map((entry) => entry.path)).toEqual([
      '.gitkeep',
      'node_modules.txt',
    ])
  })

  it('does not let include override an explicit exclusion', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/keep': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
      }),
      { blobs: blobs() },
      {
        include: () => true,
        exclude: (path) => path === 'keep',
      },
    )
    expect(snapshot.files).toEqual([])
  })

  it('does not read a non-included sibling file', async () => {
    const handle = fakeHandle({
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/skip': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([2]),
      },
    })
    const reads: string[] = []
    const readBytes = handle.fs.readBytes
    handle.fs.readBytes = async (path) => {
      reads.push(path)
      return readBytes(path)
    }
    await captureSandboxFiles(
      handle,
      { blobs: blobs() },
      { include: (path) => path === 'keep' },
    )
    expect(reads).toEqual(['/workspace/keep'])
  })

  it('keeps non-harness .sandbox files', async () => {
    const snapshot = await captureSandboxFiles(
      fakeHandle({
        '/workspace/.sandbox/data': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
      }),
      { blobs: blobs() },
      defaultSandboxSnapshotPolicy(),
    )
    expect(snapshot.files).toContainEqual(
      expect.objectContaining({ path: '.sandbox/data' }),
    )
  })

  it('rejects a user-created symlink during capture', async () => {
    await expect(
      captureSandboxFiles(
        fakeHandle({
          '/workspace/user-link': { type: 'symlink', mode: 0o777 },
        }),
        { blobs: blobs() },
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY' })
  })

  const unsupportedEntries: Array<{ kind: string; entry: Entry }> = [
    { kind: 'other', entry: { type: 'other', mode: 0o644 } },
    {
      kind: 'executable',
      entry: { type: 'file', mode: 0o755, bytes: new Uint8Array([1]) },
    },
  ]

  it.each(unsupportedEntries)(
    'rejects unsupported %s entries',
    async ({ entry }) => {
      await expect(
        captureSandboxFiles(
          fakeHandle({ '/workspace/bad': entry }),
          { blobs: blobs() },
          defaultSandboxSnapshotPolicy(),
        ),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY' })
    },
  )

  it('restores after preflighting every blob and removes stale entries', async () => {
    const bundle = { blobs: blobs() }
    const source = fakeHandle({
      '/workspace/a.txt': {
        type: 'file',
        mode: 0o644,
        bytes: new TextEncoder().encode('a'),
      },
    })
    const snapshot = await captureSandboxFiles(
      source,
      bundle,
      defaultSandboxSnapshotPolicy(),
    )
    const target = fakeHandle({
      '/workspace/stale.txt': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([2]),
      },
    })
    const writes: string[] = []
    const removed: string[] = []
    const originalWrite = target.fs.write
    const originalRemove = target.fs.remove
    target.fs.write = async (path, bytes) => {
      writes.push(path)
      await originalWrite(path, bytes)
    }
    target.fs.remove = async (path) => {
      removed.push(path)
      await originalRemove!(path)
    }
    await restoreSandboxFiles(target, bundle, snapshot)
    expect(writes).toContain('/workspace/a.txt')
    expect(removed).toContain('/workspace/stale.txt')
  })

  it('replaces an existing file with an expected directory', async () => {
    const target = fakeHandle({
      '/workspace/node': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await restoreSandboxFiles(
      target,
      { blobs: blobs() },
      { files: [{ path: 'node', kind: 'dir' }] },
    )
    expect(await target.fs.lstat!('/workspace/node')).toMatchObject({
      type: 'dir',
    })
  })

  it('replaces an existing directory with an expected file', async () => {
    const bundle = { blobs: blobs() }
    const blobKey =
      'sandbox-files/sha256/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    await bundle.blobs.put(blobKey, new TextEncoder().encode('hello'))
    const target = fakeHandle({
      '/workspace/node': { type: 'dir', mode: 0o755 },
      '/workspace/node/old': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await restoreSandboxFiles(target, bundle, {
      files: [{ path: 'node', kind: 'file', blobKey, size: 5 }],
    })
    expect(await target.fs.lstat!('/workspace/node')).toMatchObject({
      type: 'file',
    })
  })

  it('does not mutate the workspace when a manifest blob is missing', async () => {
    const target = fakeHandle({
      '/workspace/a': { type: 'file', mode: 0o644, bytes: new Uint8Array([0]) },
    })
    const writes: string[] = []
    const removed: string[] = []
    target.fs.write = async (path) => {
      writes.push(path)
    }
    target.fs.remove = async (path) => {
      removed.push(path)
    }
    await expect(
      restoreSandboxFiles(
        target,
        { blobs: blobs() },
        {
          files: [
            {
              path: 'a',
              kind: 'file',
              blobKey: 'sandbox-files/sha256/missing',
              size: 1,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(SandboxSnapshotError)
    expect(writes).toEqual([])
    expect(removed).toEqual([])
  })

  it('propagates operational lstat errors without mutation', async () => {
    const target = fakeHandle({
      '/workspace/a': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([0]),
      },
    })
    const originalLstat = target.fs.lstat!
    target.fs.lstat = async (path) => {
      if (path === '/workspace/a') {
        throw new Error('permission denied')
      }
      return originalLstat(path)
    }
    const writes: string[] = []
    const removed: string[] = []
    target.fs.write = async (path) => {
      writes.push(path)
    }
    target.fs.remove = async (path) => {
      removed.push(path)
    }
    const bundle = { blobs: blobs() }
    const blobKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([1]))
    await expect(
      restoreSandboxFiles(target, bundle, {
        files: [{ path: 'a', kind: 'file', blobKey, size: 1 }],
      }),
    ).rejects.toThrow('permission denied')
    expect(writes).toEqual([])
    expect(removed).toEqual([])
  })

  it('does not mutate when a later destination preflight fails', async () => {
    const target = fakeHandle({
      '/workspace/stale': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/b': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([0]),
      },
    })
    const originalLstat = target.fs.lstat!
    target.fs.lstat = async (path) => {
      if (path === '/workspace/b') throw new Error('lstat failed late')
      return originalLstat(path)
    }
    const bundle = { blobs: blobs() }
    const firstKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([1]))
    const secondKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([2]))
    await expect(
      restoreSandboxFiles(target, bundle, {
        files: [
          { path: 'a', kind: 'file', blobKey: firstKey, size: 1 },
          { path: 'b', kind: 'file', blobKey: secondKey, size: 1 },
        ],
      }),
    ).rejects.toThrow('lstat failed late')
    expect(await target.fs.exists('/workspace/stale')).toBe(true)
  })

  it.each(['ancestor', 'final'])(
    'rejects a %s symlink before writing',
    async (position) => {
      const target = fakeHandle(
        position === 'ancestor'
          ? { '/workspace/a': { type: 'symlink', mode: 0o777 } }
          : { '/workspace/a': { type: 'symlink', mode: 0o777 } },
      )
      const bundle = { blobs: blobs() }
      const blobKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([1]))
      const manifest: { files: SandboxSnapshotEntry[] } =
        position === 'ancestor'
          ? {
              files: [
                {
                  path: 'a/b',
                  kind: 'file',
                  blobKey,
                  size: 1,
                },
              ],
            }
          : {
              files: [{ path: 'a', kind: 'file', blobKey, size: 1 }],
            }
      await expect(
        restoreSandboxFiles(target, bundle, manifest),
      ).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY',
      })
      expect(await target.fs.lstat!('/workspace/a')).toMatchObject({
        type: 'symlink',
      })
    },
  )

  it('restores binary bytes without text conversion', async () => {
    const bundle = { blobs: blobs() }
    const bytes = new Uint8Array([0, 255, 1, 128])
    const blobKey = await putSnapshotBlob(bundle.blobs, bytes)
    const target = fakeHandle({})
    await restoreSandboxFiles(target, bundle, {
      files: [
        {
          path: 'nested/data.bin',
          kind: 'file',
          blobKey,
          size: bytes.byteLength,
        },
      ],
    })
    expect(await target.fs.readBytes('/workspace/nested/data.bin')).toEqual(
      bytes,
    )
  })

  it('creates missing nested parents during restore', async () => {
    const bundle = { blobs: blobs() }
    const blobKey = await putSnapshotBlob(
      bundle.blobs,
      new TextEncoder().encode('ok'),
    )
    const target = fakeHandle({})
    await restoreSandboxFiles(target, bundle, {
      files: [{ path: 'a/b/c.txt', kind: 'file', blobKey, size: 2 }],
    })
    expect(await target.fs.lstat!('/workspace/a/b')).toMatchObject({
      type: 'dir',
    })
  })

  it('rejects trailing separators before restore mutation', async () => {
    const target = fakeHandle({})
    await expect(
      restoreSandboxFiles(
        target,
        { blobs: blobs() },
        { files: [{ path: 'nested/', kind: 'dir' }] },
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })
  })

  it('rejects backslash manifest paths before restore mutation', async () => {
    const target = fakeHandle({
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await expect(
      restoreSandboxFiles(
        target,
        { blobs: blobs() },
        {
          files: [{ path: 'nested\\file.txt', kind: 'dir' }],
        },
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })
    expect(await target.fs.exists('/workspace/keep')).toBe(true)
  })

  it('rejects a provider list result outside the requested directory', async () => {
    const target = fakeHandle({})
    target.fs.list = async () => [
      { name: 'file', path: '/outside/file', type: 'file' },
    ]
    await expect(
      captureSandboxFiles(target, { blobs: blobs() }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_WORKSPACE' })
  })

  it('rejects a NUL provider list name before inspecting the child', async () => {
    const target = fakeHandle({})
    const inspected: string[] = []
    const originalLstat = target.fs.lstat!
    target.fs.lstat = async (path) => {
      inspected.push(path)
      return originalLstat(path)
    }
    target.fs.list = async () => [
      { name: 'bad\0name', path: '/workspace/bad\0name', type: 'file' },
    ]

    await expect(
      captureSandboxFiles(target, { blobs: blobs() }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_WORKSPACE' })

    expect(inspected.every((path) => path === '/workspace')).toBe(true)
  })

  it('keeps protected current entries when restoring a fresh sandbox', async () => {
    const bundle = { blobs: blobs() }
    const blobKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([2]))
    const target = fakeHandle({
      '/workspace/.git/config': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/.env.local': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/node_modules/package/index.js': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/.tanstack-projected-workspaceHash/config': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/stale': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await restoreSandboxFiles(
      target,
      bundle,
      {
        files: [{ path: 'restored', kind: 'file', blobKey, size: 1 }],
      },
      defaultSandboxSnapshotPolicy('workspaceHash'),
    )
    expect(await target.fs.exists('/workspace/.git/config')).toBe(true)
    expect(await target.fs.exists('/workspace/.env.local')).toBe(true)
    expect(
      await target.fs.exists('/workspace/node_modules/package/index.js'),
    ).toBe(true)
    expect(
      await target.fs.exists(
        '/workspace/.tanstack-projected-workspaceHash/config',
      ),
    ).toBe(true)
    expect(await target.fs.exists('/workspace/stale')).toBe(false)
  })

  it('removes stale descendants while preserving a protected sibling', async () => {
    const target = fakeHandle({
      '/workspace/config/.env': {
        type: 'file',
        mode: 0o600,
        bytes: new TextEncoder().encode('SECRET=value'),
      },
      '/workspace/config/old.txt': {
        type: 'file',
        mode: 0o644,
        bytes: new TextEncoder().encode('old'),
      },
    })
    const mutations = fsMutationLog(target)

    await restoreSandboxFiles(target, { blobs: blobs() }, { files: [] })

    expect(await target.fs.exists('/workspace/config/.env')).toBe(true)
    expect(await target.fs.exists('/workspace/config/old.txt')).toBe(false)
    expect(mutations).toEqual({
      writes: [],
      removes: ['/workspace/config/old.txt'],
      mkdirs: [],
    })
  })

  it.each([
    'src/.git/config',
    'src/node_modules/package/index.js',
    'src/.env.local',
  ])(
    'does not restore over protected segments at any depth: %s',
    async (path) => {
      const bundle = { blobs: blobs() }
      const blobKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([2]))
      const target = fakeHandle({
        [`/workspace/${path}`]: {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
        '/workspace/stale': {
          type: 'file',
          mode: 0o644,
          bytes: new Uint8Array([1]),
        },
      })
      await restoreSandboxFiles(
        target,
        bundle,
        { files: [{ path: 'restored', kind: 'file', blobKey, size: 1 }] },
        defaultSandboxSnapshotPolicy('workspaceHash'),
      )
      expect(await target.fs.exists(`/workspace/${path}`)).toBe(true)
      expect(await target.fs.exists('/workspace/stale')).toBe(false)
    },
  )

  it('restores a projection-looking user path when the workspace hash is unknown', async () => {
    const bundle = { blobs: blobs() }
    const blobKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([2]))
    const target = fakeHandle({
      '/workspace/.tanstack-projected-secret/config': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await restoreSandboxFiles(
      target,
      bundle,
      { files: [{ path: 'restored', kind: 'file', blobKey, size: 1 }] },
      { exclude: () => false },
    )
    expect(
      await target.fs.exists('/workspace/.tanstack-projected-secret/config'),
    ).toBe(false)
    expect(await target.fs.exists('/workspace/restored')).toBe(true)
  })

  it('rejects an explicit empty directory excluded by include before any access', async () => {
    const { store, gets, heads } = blobsWithAccessLog()
    const target = fakeHandle({})
    const mutations = fsMutationLog(target)

    await expect(
      restoreSandboxFiles(
        target,
        { blobs: store },
        { files: [{ path: 'private', kind: 'dir' }] },
        { include: (_path, kind) => kind !== 'dir' },
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })

    expect(gets).toEqual([])
    expect(heads).toEqual([])
    expect(mutations).toEqual({ writes: [], removes: [], mkdirs: [] })
  })

  it('rejects a file under an excluded custom ancestor before any access', async () => {
    const { store, gets, heads } = blobsWithAccessLog()
    const target = fakeHandle({})
    const mutations = fsMutationLog(target)
    const blobKey =
      'sandbox-files/sha256/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

    await expect(
      restoreSandboxFiles(
        target,
        { blobs: store },
        {
          files: [
            { path: 'private/secret.txt', kind: 'file', blobKey, size: 5 },
          ],
        },
        { exclude: (path) => path === 'private' },
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })

    expect(gets).toEqual([])
    expect(heads).toEqual([])
    expect(mutations).toEqual({ writes: [], removes: [], mkdirs: [] })
  })

  it.each([
    {
      name: 'the exact protected projection ancestor',
      path: '.tanstack-projected-workspaceHash/config.ts',
      policy: defaultSandboxSnapshotPolicy('workspaceHash'),
    },
    {
      name: 'a projection-looking user ancestor without the workspace hash',
      path: '.tanstack-projected/config.ts',
      policy: defaultSandboxSnapshotPolicy('workspaceHash'),
    },
  ])(
    'handles $name in the desired manifest before blob access',
    async ({ path, policy }) => {
      const { store, gets, heads } = blobsWithAccessLog()
      const target = fakeHandle({})
      const mutations = fsMutationLog(target)
      const blobKey =
        'sandbox-files/sha256/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      await store.put(blobKey, new TextEncoder().encode('hello'))
      const restore = restoreSandboxFiles(
        target,
        { blobs: store },
        { files: [{ path, kind: 'file', blobKey, size: 5 }] },
        policy,
      )

      if (path.startsWith('.tanstack-projected-workspaceHash/')) {
        await expect(restore).rejects.toMatchObject({
          code: 'SANDBOX_SNAPSHOT_INVALID_PATH',
        })
        expect(gets).toEqual([])
        expect(heads).toEqual([])
        expect(mutations).toEqual({ writes: [], removes: [], mkdirs: [] })
      } else {
        await expect(restore).resolves.toBeUndefined()
        expect(await target.fs.exists(`/workspace/${path}`)).toBe(true)
      }
    },
  )

  it('rejects a desired file that would replace a protected current descendant before access', async () => {
    const { store, gets, heads } = blobsWithAccessLog()
    const target = fakeHandle({
      '/workspace/config/.env': {
        type: 'file',
        mode: 0o600,
        bytes: new Uint8Array([1]),
      },
    })
    const mutations = fsMutationLog(target)
    const blobKey =
      'sandbox-files/sha256/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

    await expect(
      restoreSandboxFiles(
        target,
        { blobs: store },
        { files: [{ path: 'config', kind: 'file', blobKey, size: 5 }] },
        defaultSandboxSnapshotPolicy('workspaceHash'),
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })

    expect(gets).toEqual([])
    expect(heads).toEqual([])
    expect(mutations).toEqual({ writes: [], removes: [], mkdirs: [] })
  })

  it('allows an implicit parent directory excluded by include for an included file', async () => {
    const store = blobs()
    const bytes = new TextEncoder().encode('hello')
    const blobKey = await putSnapshotBlob(store, bytes)
    const target = fakeHandle({})
    const mutations = fsMutationLog(target)

    await restoreSandboxFiles(
      target,
      { blobs: store },
      {
        files: [
          { path: 'generated/index.txt', kind: 'file', blobKey, size: 5 },
        ],
      },
      { include: (_path, kind) => kind === 'file' },
    )

    expect(mutations.mkdirs).toContain('/workspace/generated')
    expect(mutations.writes).toEqual(['/workspace/generated/index.txt'])
    expect(await target.fs.read('/workspace/generated/index.txt')).toBe('hello')
  })

  it('rejects an invalid file blob key before any blob read or workspace mutation', async () => {
    const { store, gets, heads } = blobsWithAccessLog()
    const target = fakeHandle({
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    const writes: string[] = []
    const removes: string[] = []
    const write = target.fs.write
    const remove = target.fs.remove
    target.fs.write = async (path, data) => {
      writes.push(path)
      await write(path, data)
    }
    target.fs.remove = async (path) => {
      removes.push(path)
      await remove(path)
    }

    await expect(
      restoreSandboxFiles(
        target,
        { blobs: store },
        {
          files: [
            {
              path: 'unsafe.txt',
              kind: 'file',
              blobKey: 'sandbox-files/sha256/not-a-file-hash',
              size: 1,
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })

    expect(gets).toEqual([])
    expect(heads).toEqual([])
    expect(writes).toEqual([])
    expect(removes).toEqual([])
    expect(await target.fs.exists('/workspace/keep')).toBe(true)
  })

  it('rejects structural manifest errors before any blob read', async () => {
    const { store, gets, heads } = blobsWithAccessLog()
    const target = fakeHandle({})
    const blobKey = await putSnapshotBlob(store, new Uint8Array([1]))

    await expect(
      restoreSandboxFiles(
        target,
        { blobs: store },
        {
          files: [
            { path: 'parent', kind: 'file', blobKey, size: 1 },
            { path: 'parent/child', kind: 'file', blobKey, size: 1 },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_PATH' })

    expect(gets).toEqual([])
    expect(heads).toEqual([])
  })

  it('skips the known projection tree during custom-policy restore', async () => {
    const bundle = { blobs: blobs() }
    const blobKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([2]))
    const target = fakeHandle({
      '/workspace/.tanstack-projected-secret/config': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/stale': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })

    await restoreSandboxFiles(
      target,
      bundle,
      { files: [{ path: 'restored', kind: 'file', blobKey, size: 1 }] },
      {
        workspaceHash: 'secret',
        exclude: () => false,
      },
    )

    expect(
      await target.fs.exists('/workspace/.tanstack-projected-secret/config'),
    ).toBe(true)
    expect(await target.fs.exists('/workspace/stale')).toBe(false)
  })

  it('does not read the known projection file when custom policy allows everything', async () => {
    const handle = fakeHandle({
      '/workspace/.tanstack-projected-secret': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([2]),
      },
    })
    const reads: string[] = []
    const originalReadBytes = handle.fs.readBytes
    handle.fs.readBytes = async (path) => {
      reads.push(path)
      return originalReadBytes(path)
    }
    const bundle = blobs()
    const puts: string[] = []
    const originalPut = bundle.put
    bundle.put = async (key, body) => {
      puts.push(key)
      return originalPut(key, body)
    }

    const snapshot = await captureSandboxFiles(
      handle,
      { blobs: bundle },
      { workspaceHash: 'secret', include: () => true, exclude: () => false },
    )

    expect(reads).toEqual(['/workspace/keep'])
    expect(puts).toHaveLength(1)
    expect(snapshot.files).toEqual([
      expect.objectContaining({ path: 'keep', kind: 'file' }),
    ])
  })

  it('does not inspect or persist a projection tree when custom policy allows everything', async () => {
    const handle = fakeHandle({
      '/workspace/.tanstack-projected-secret/config': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
      '/workspace/keep/config': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([2]),
      },
    })
    const inspected: string[] = []
    const originalLstat = handle.fs.lstat!
    handle.fs.lstat = async (path) => {
      inspected.push(path)
      return originalLstat(path)
    }
    const reads: string[] = []
    const originalReadBytes = handle.fs.readBytes
    handle.fs.readBytes = async (path) => {
      reads.push(path)
      return originalReadBytes(path)
    }

    const snapshot = await captureSandboxFiles(
      handle,
      { blobs: blobs() },
      { workspaceHash: 'secret', include: () => true, exclude: () => false },
    )

    expect(inspected).not.toContain('/workspace/.tanstack-projected-secret')
    expect(reads).toEqual(['/workspace/keep/config'])
    expect(snapshot.files).toEqual([
      expect.objectContaining({ path: 'keep/config', kind: 'file' }),
    ])
  })

  it('validates every reference to a shared blob before mutation', async () => {
    const bundle = { blobs: blobs() }
    const blobKey = await putSnapshotBlob(bundle.blobs, new Uint8Array([1]))
    const target = fakeHandle({
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await expect(
      restoreSandboxFiles(target, bundle, {
        files: [
          { path: 'a', kind: 'file', blobKey, size: 1 },
          { path: 'b', kind: 'file', blobKey, size: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_BLOB' })
    expect(await target.fs.exists('/workspace/keep')).toBe(true)
  })

  it('rejects a blob whose bytes do not match its content-addressed key', async () => {
    const bundle = { blobs: blobs() }
    const captured = await captureSandboxFiles(
      fakeHandle({
        '/workspace/source': {
          type: 'file',
          mode: 0o644,
          bytes: new TextEncoder().encode('expected'),
        },
      }),
      bundle,
    )
    const entry = captured.files[0]
    if (!entry || entry.kind !== 'file') throw new Error('expected file')
    await bundle.blobs.put(entry.blobKey, new TextEncoder().encode('tampered'))
    const target = fakeHandle({
      '/workspace/keep': {
        type: 'file',
        mode: 0o644,
        bytes: new Uint8Array([1]),
      },
    })
    await expect(
      restoreSandboxFiles(target, bundle, captured),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_BLOB' })
    expect(await target.fs.exists('/workspace/keep')).toBe(true)
  })
})
