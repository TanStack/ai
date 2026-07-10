import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import {
  composePersistence,
  memoryPersistence,
  withChatPersistence,
} from '@tanstack/ai-persistence'
import { defineSandbox, defineWorkspace, withSandbox } from '../src'
import {
  WORKSPACE_PERSISTENCE_METADATA_SCOPE,
  checkpointWorkspacePersistenceEvent,
  requireWorkspacePersistence,
  resolveWorkspacePersistenceOptions,
  restoreWorkspacePersistence,
  workspacePersistenceArtifactId,
  workspacePersistenceBlobKey,
  workspacePersistenceManifestKey,
} from '../src/workspace-persistence'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { AIPersistence } from '@tanstack/ai-persistence'
import type { SandboxHandle, SandboxProvider } from '../src/contracts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function finishChunk(runId: string, threadId: string): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    finishReason: 'stop',
    timestamp: 1,
  }
}

class WorkspaceTestAdapter implements AnyTextAdapter {
  readonly kind = 'text'
  readonly name = 'mock'
  readonly model = 'test-model'
  declare '~types': AnyTextAdapter['~types']

  constructor(
    private readonly run: (input: {
      runId: string
      threadId: string
    }) => Promise<void> | void,
  ) {}

  chatStream(input: Parameters<AnyTextAdapter['chatStream']>[0]) {
    const run = this.run
    return (async function* () {
      const runId = input.runId ?? 'run'
      const threadId = input.threadId ?? 'thread'
      await run({ runId, threadId })
      yield finishChunk(runId, threadId)
    })()
  }

  structuredOutput() {
    return Promise.resolve({ data: {}, rawText: '{}' })
  }
}

function adapter(
  run: (input: { runId: string; threadId: string }) => Promise<void> | void,
): AnyTextAdapter {
  return new WorkspaceTestAdapter(run)
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) {
    // drain
  }
}

async function collectChunks(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function fakeWorkspaceHandle() {
  const watchers: Array<{
    root: string
    cb: (e: { type: string; path: string }) => void
  }> = []
  const files = new Map<string, Uint8Array>()
  const readBytesErrors = new Set<string>()
  const madeDirs: Array<string> = []
  const removed: Array<string> = []
  const watchedPaths: Array<string> = []
  const handle: SandboxHandle & {
    files: Map<string, Uint8Array>
    readBytesErrors: Set<string>
    madeDirs: Array<string>
    removed: Array<string>
    watchedPaths: Array<string>
    fire: (path: string) => Promise<void>
  } = {
    id: 'sandbox-1',
    provider: 'fake',
    files,
    readBytesErrors,
    madeDirs,
    removed,
    watchedPaths,
    async fire(path) {
      for (const watcher of watchers) {
        if (isUnderRoot(path, watcher.root))
          watcher.cb({ type: 'change', path })
      }
      await Promise.resolve()
    },
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: false,
      writableStdin: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: (path) =>
        Promise.resolve(decoder.decode(files.get(path) ?? new Uint8Array())),
      readBytes: (path) => {
        if (readBytesErrors.has(path)) {
          return Promise.reject(new Error(`ENOENT: no such file, open ${path}`))
        }
        if (!files.has(path)) {
          return Promise.reject(new Error(`ENOENT: no such file, open ${path}`))
        }
        return Promise.resolve(files.get(path) ?? new Uint8Array())
      },
      write: (path, data) => {
        files.set(
          path,
          typeof data === 'string'
            ? encoder.encode(data)
            : new Uint8Array(data),
        )
        return Promise.resolve()
      },
      list: () => Promise.resolve([]),
      mkdir: (path) => {
        madeDirs.push(path)
        return Promise.resolve()
      },
      remove: (path) => {
        removed.push(path)
        files.delete(path)
        return Promise.resolve()
      },
      rename: () => Promise.resolve(),
      exists: (path) => Promise.resolve(files.has(path)),
      watch: (path, cb) => {
        watchedPaths.push(path)
        const watcher = { root: path, cb }
        watchers.push(watcher)
        return Promise.resolve({
          stop: () => {
            const index = watchers.indexOf(watcher)
            if (index !== -1) watchers.splice(index, 1)
            return Promise.resolve()
          },
        })
      },
    },
    git: {} as SandboxHandle['git'],
    process: {
      exec: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 1 }),
      spawn: () => Promise.reject(new Error('not implemented')),
    },
    ports: { connect: () => Promise.reject(new Error('not implemented')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
  return handle
}

function isUnderRoot(path: string, root: string): boolean {
  const normalizedRoot = root.replace(/\/+$/, '')
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`)
}

function fakeProvider(handle: SandboxHandle): SandboxProvider {
  return {
    name: 'fake',
    capabilities: () => handle.capabilities,
    create: () => Promise.resolve(handle),
    resume: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  }
}

function workspaceSandbox(handle: SandboxHandle) {
  return defineSandbox({
    id: 'project',
    provider: fakeProvider(handle),
    workspace: defineWorkspace({ source: { type: 'none' } }),
    persistence: {
      workspace: {
        key: 'project-123',
      },
    },
  })
}

function workspaceOptions() {
  const options = resolveWorkspacePersistenceOptions({
    workspacePersistence: { key: 'project-123' },
    workspace: undefined,
    defaultKey: 'unused',
  })
  if (!options) throw new Error('Expected workspace persistence options')
  return options
}

function workspaceContext(handle: SandboxHandle, persistence: AIPersistence) {
  return {
    handle,
    persistence: requireWorkspacePersistence(persistence),
    options: workspaceOptions(),
    runId: 'run-1',
    threadId: 'thread-1',
  }
}

async function checkpointText(
  handle: ReturnType<typeof fakeWorkspaceHandle>,
  persistence: AIPersistence,
  path: string,
  text: string,
  timestamp: number,
): Promise<void> {
  handle.files.set(path, encoder.encode(text))
  await checkpointWorkspacePersistenceEvent(
    workspaceContext(handle, persistence),
    { type: 'change', path, timestamp },
  )
}

async function expectRestoredText(
  persistence: AIPersistence,
  path: string,
  expected: string,
): Promise<void> {
  const restored = fakeWorkspaceHandle()
  await restoreWorkspacePersistence(workspaceContext(restored, persistence))
  await expect(restored.fs.read(path)).resolves.toBe(expected)
}

function manifestFile(value: unknown, path: string) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('files' in value) ||
    typeof value.files !== 'object' ||
    value.files === null
  ) {
    throw new Error('Expected a workspace manifest')
  }
  const file = Object.getOwnPropertyDescriptor(value.files, path)?.value
  if (
    typeof file !== 'object' ||
    file === null ||
    !('artifactId' in file) ||
    typeof file.artifactId !== 'string' ||
    !('blobKey' in file) ||
    typeof file.blobKey !== 'string'
  ) {
    throw new Error(`Expected a manifest file for ${path}`)
  }
  return { artifactId: file.artifactId, blobKey: file.blobKey }
}

describe('managed workspace persistence', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5])(
    'rejects invalid maxFileBytes %s',
    (maxFileBytes) => {
      expect(() =>
        resolveWorkspacePersistenceOptions({
          workspacePersistence: { maxFileBytes },
          workspace: undefined,
          defaultKey: 'project-123',
        }),
      ).toThrow(/maxFileBytes/)
    },
  )

  it('requires blob storage even when persistence consistency is best-effort', async () => {
    const persistence = composePersistence(memoryPersistence(), {
      overrides: { blobs: false },
    })
    const handle = fakeWorkspaceHandle()
    const sandbox = defineSandbox({
      id: 'project',
      provider: fakeProvider(handle),
      workspace: defineWorkspace({ source: { type: 'none' } }),
      persistence: {
        workspace: {
          consistency: 'best-effort',
          key: 'project-123',
        },
      },
    })

    await expect(
      collect(
        chat({
          adapter: adapter(() => undefined),
          threadId: 'thread-1',
          runId: 'run-1',
          messages: [{ role: 'user', content: 'build app' }],
          middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
        }),
      ),
    ).rejects.toThrow(
      'Workspace persistence requires AIPersistence stores.metadata, stores.artifacts with delete(), and stores.blobs',
    )
  })

  it('persists changed workspace files through artifacts and metadata', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/app.ts'
    const sandbox = workspaceSandbox(handle)

    await collect(
      chat({
        adapter: adapter(() => {
          handle.files.set(path, encoder.encode('export const app = 1\n'))
          handle.fire(path)
        }),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'build app' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    const manifest = await persistence.stores.metadata?.get(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
    )
    const file = manifestFile(manifest, path)
    const artifact = await persistence.stores.artifacts?.get(file.artifactId)
    const blob = await persistence.stores.blobs?.get(file.blobKey)

    expect(artifact).toMatchObject({ size: 21 })
    expect(await blob?.text()).toBe('export const app = 1\n')
    expect(manifest).toMatchObject({
      version: 1,
      files: {
        [path]: {
          artifactId: file.artifactId,
          blobKey: file.blobKey,
          size: 21,
        },
      },
    })
  })

  it('preserves the previous checkpoint when artifact metadata save fails', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/app.ts'
    await checkpointText(handle, persistence, path, 'previous', 1)
    const failing = composePersistence(persistence, {
      overrides: {
        artifacts: {
          save: () => Promise.reject(new Error('artifact save failed')),
          get: (artifactId) => persistence.stores.artifacts.get(artifactId),
          list: (runId) => persistence.stores.artifacts.list(runId),
          delete: (artifactId) => {
            const deleteArtifact = persistence.stores.artifacts.delete
            if (!deleteArtifact) throw new Error('Expected artifact delete')
            return deleteArtifact.call(persistence.stores.artifacts, artifactId)
          },
        },
      },
    })
    handle.files.set(path, encoder.encode('uncommitted'))

    await expect(
      checkpointWorkspacePersistenceEvent(workspaceContext(handle, failing), {
        type: 'change',
        path,
        timestamp: 2,
      }),
    ).rejects.toThrow('artifact save failed')

    await expectRestoredText(persistence, path, 'previous')
    await expect(
      persistence.stores.artifacts.list('run-1'),
    ).resolves.toHaveLength(1)
    await expect(
      persistence.stores.blobs.list({ prefix: 'workspace:project-123:blob:' }),
    ).resolves.toMatchObject({ objects: [expect.any(Object)] })
  })

  it('retains both revisions when the manifest commit result is unknown', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/app.ts'
    await checkpointText(handle, persistence, path, 'previous', 1)
    const manifestKey = workspacePersistenceManifestKey('project-123')
    const failing = composePersistence(persistence, {
      overrides: {
        metadata: {
          get: (scope, key) => persistence.stores.metadata.get(scope, key),
          set: (scope, key, value) =>
            scope === WORKSPACE_PERSISTENCE_METADATA_SCOPE &&
            key === manifestKey
              ? Promise.reject(new Error('manifest commit failed'))
              : persistence.stores.metadata.set(scope, key, value),
          delete: (scope, key) =>
            persistence.stores.metadata.delete(scope, key),
        },
      },
    })
    handle.files.set(path, encoder.encode('uncommitted'))

    await expect(
      checkpointWorkspacePersistenceEvent(workspaceContext(handle, failing), {
        type: 'change',
        path,
        timestamp: 2,
      }),
    ).rejects.toThrow('manifest commit failed')

    await expectRestoredText(persistence, path, 'previous')
    await expect(
      persistence.stores.artifacts.list('run-1'),
    ).resolves.toHaveLength(2)
    await expect(
      persistence.stores.blobs.list({ prefix: 'workspace:project-123:blob:' }),
    ).resolves.toMatchObject({
      objects: [expect.any(Object), expect.any(Object)],
    })
  })

  it('retains a revision when the manifest commits but its response is lost', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/app.ts'
    await checkpointText(handle, persistence, path, 'previous', 1)
    const manifestKey = workspacePersistenceManifestKey('project-123')
    const responseLost = composePersistence(persistence, {
      overrides: {
        metadata: {
          get: (scope, key) => persistence.stores.metadata.get(scope, key),
          set: async (scope, key, value) => {
            await persistence.stores.metadata.set(scope, key, value)
            if (
              scope === WORKSPACE_PERSISTENCE_METADATA_SCOPE &&
              key === manifestKey
            ) {
              throw new Error('manifest commit response was lost')
            }
          },
          delete: (scope, key) =>
            persistence.stores.metadata.delete(scope, key),
        },
      },
    })
    handle.files.set(path, encoder.encode('committed despite response loss'))

    await expect(
      checkpointWorkspacePersistenceEvent(
        workspaceContext(handle, responseLost),
        { type: 'change', path, timestamp: 2 },
      ),
    ).rejects.toThrow('manifest commit response was lost')

    const manifest = await persistence.stores.metadata.get(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      manifestKey,
    )
    const committed = manifestFile(manifest, path)
    await expect(
      persistence.stores.artifacts.get(committed.artifactId),
    ).resolves.not.toBeNull()
    await expect(
      persistence.stores.blobs.get(committed.blobKey),
    ).resolves.not.toBeNull()
    await expectRestoredText(
      persistence,
      path,
      'committed despite response loss',
    )
  })

  it('restores persisted workspace files before onReady hooks run', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/app.ts'
    const artifactId = workspacePersistenceArtifactId(
      'project-123',
      path,
      'seed',
    )
    const blobKey = workspacePersistenceBlobKey('project-123', path, 'seed')
    let contentSeenOnReady = ''

    await persistence.stores.blobs?.put(blobKey, encoder.encode('restored app'))
    await persistence.stores.artifacts?.save({
      artifactId,
      runId: 'seed-run',
      threadId: 'thread-1',
      name: path,
      mimeType: 'application/octet-stream',
      size: 12,
      createdAt: 1,
    })
    await persistence.stores.metadata?.set(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
      {
        version: 1,
        files: {
          [path]: {
            artifactId,
            blobKey,
            size: 12,
            updatedAt: 1,
          },
        },
        deleted: {},
      },
    )

    const sandbox = defineSandbox({
      id: 'project',
      provider: fakeProvider(handle),
      workspace: defineWorkspace({ source: { type: 'none' } }),
      persistence: {
        workspace: {
          key: 'project-123',
        },
      },
      hooks: {
        onReady: async (readyHandle) => {
          contentSeenOnReady = await readyHandle.fs.read(path)
        },
      },
    })

    await collect(
      chat({
        adapter: adapter(() => undefined),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'resume app' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    expect(contentSeenOnReady).toBe('restored app')
    expect(handle.madeDirs).toContain('/workspace/src')
  })

  it('does not persist default excluded files', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const sandbox = workspaceSandbox(handle)
    const path = '/workspace/.env.local'

    await collect(
      chat({
        adapter: adapter(() => {
          handle.files.set(path, encoder.encode('SECRET=value\n'))
          handle.fire(path)
        }),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'write env' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    await expect(persistence.stores.artifacts.list('run-1')).resolves.toEqual(
      [],
    )
  })

  it('persists workspace files when public file events are disabled', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/app.ts'
    const sandbox = defineSandbox({
      id: 'project',
      provider: fakeProvider(handle),
      workspace: defineWorkspace({ source: { type: 'none' } }),
      fileEvents: false,
      persistence: {
        workspace: {
          key: 'project-123',
        },
      },
    })

    const chunks = await collectChunks(
      chat({
        adapter: adapter(() => {
          handle.files.set(path, encoder.encode('export const app = 2\n'))
          handle.fire(path)
        }),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'build quiet app' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    const manifest = await persistence.stores.metadata.get(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
    )
    const blob = await persistence.stores.blobs?.get(
      manifestFile(manifest, path).blobKey,
    )

    expect(await blob?.text()).toBe('export const app = 2\n')
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === EventType.CUSTOM && chunk.name === 'sandbox.file',
      ),
    ).toBe(false)
  })

  it('watches the configured persistence root', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/project/src/app.ts'
    const sandbox = defineSandbox({
      id: 'project',
      provider: fakeProvider(handle),
      workspace: defineWorkspace({
        source: { type: 'none' },
        root: '/project',
      }),
      persistence: {
        workspace: {
          key: 'project-123',
          root: '/project',
        },
      },
    })

    await collect(
      chat({
        adapter: adapter(() => {
          handle.files.set(path, encoder.encode('export const custom = true\n'))
          handle.fire(path)
        }),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'build custom root app' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    const manifest = await persistence.stores.metadata.get(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
    )
    const blob = await persistence.stores.blobs?.get(
      manifestFile(manifest, path).blobKey,
    )

    expect(await blob?.text()).toBe('export const custom = true\n')
    expect(handle.watchedPaths).toEqual(['/project'])
  })

  it('keeps public file events on the workspace root when persistence uses a narrower root', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const publicPath = '/workspace/src/app.ts'
    const persistedPath = '/workspace/.persist/state.json'
    const sandbox = defineSandbox({
      id: 'project',
      provider: fakeProvider(handle),
      workspace: defineWorkspace({ source: { type: 'none' } }),
      persistence: {
        workspace: {
          key: 'project-123',
          root: '/workspace/.persist',
        },
      },
    })

    const chunks = await collectChunks(
      chat({
        adapter: adapter(async () => {
          handle.files.set(publicPath, encoder.encode('export const app = 3\n'))
          await handle.fire(publicPath)
          handle.files.set(persistedPath, encoder.encode('{"ok":true}\n'))
          await handle.fire(persistedPath)
        }),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'build app with state' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    const publicEvent = chunks.find(
      (chunk) =>
        chunk.type === EventType.CUSTOM &&
        chunk.name === 'sandbox.file' &&
        chunk.value.path === publicPath,
    )
    const manifest = await persistence.stores.metadata.get(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
    )
    const blob = await persistence.stores.blobs?.get(
      manifestFile(manifest, persistedPath).blobKey,
    )

    expect(publicEvent).toBeDefined()
    expect(await blob?.text()).toBe('{"ok":true}\n')
    expect(handle.watchedPaths).toEqual(['/workspace', '/workspace/.persist'])
  })

  it('does not fail strict persistence when a changed file disappears before it can be read', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/transient.ts'
    const sandbox = workspaceSandbox(handle)

    await collect(
      chat({
        adapter: adapter(async () => {
          handle.files.set(
            path,
            encoder.encode('export const transient = true\n'),
          )
          handle.readBytesErrors.add(path)
          await handle.fire(path)
          handle.files.delete(path)
          handle.readBytesErrors.delete(path)
          await handle.fire(path)
        }),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'write transient file' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    const manifest = await persistence.stores.metadata?.get(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
    )

    expect(manifest).toMatchObject({
      version: 1,
      files: {},
      deleted: {
        [path]: expect.any(Number),
      },
    })
  })

  it('removes persisted artifact metadata and blob bodies for deleted files', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/deleted.ts'
    const sandbox = workspaceSandbox(handle)

    await collect(
      chat({
        adapter: adapter(async () => {
          handle.files.set(path, encoder.encode('export const value = 1\n'))
          await handle.fire(path)
          handle.files.delete(path)
          await handle.fire(path)
        }),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'delete persisted file' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    await expect(persistence.stores.artifacts.list('run-1')).resolves.toEqual(
      [],
    )
    await expect(
      persistence.stores.blobs.list({ prefix: 'workspace:project-123:blob:' }),
    ).resolves.toMatchObject({ objects: [] })
    await expect(
      persistence.stores.metadata.get(
        WORKSPACE_PERSISTENCE_METADATA_SCOPE,
        workspacePersistenceManifestKey('project-123'),
      ),
    ).resolves.toMatchObject({
      files: {},
      deleted: { [path]: expect.any(Number) },
    })
  })

  it('ignores traversal paths from persisted manifests during restore', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/../outside.txt'
    const artifactId = workspacePersistenceArtifactId(
      'project-123',
      path,
      'seed',
    )
    const blobKey = workspacePersistenceBlobKey('project-123', path, 'seed')

    await persistence.stores.artifacts?.save({
      artifactId,
      runId: 'seed-run',
      threadId: 'thread-1',
      name: path,
      mimeType: 'application/octet-stream',
      size: 7,
      createdAt: 1,
    })
    await persistence.stores.metadata?.set(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
      {
        version: 1,
        files: {
          [path]: {
            artifactId,
            blobKey,
            size: 7,
            updatedAt: 1,
          },
        },
        deleted: {
          [path]: 1,
        },
      },
    )

    await collect(
      chat({
        adapter: adapter(() => undefined),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'restore workspace' }],
        middleware: [
          withChatPersistence(persistence),
          withSandbox(workspaceSandbox(handle)),
        ],
      }),
    )

    expect(handle.files.has(path)).toBe(false)
    expect(handle.removed).not.toContain(path)
  })

  it('keeps root public workspace persistence declarations independent of the optional persistence peer', () => {
    const indexSource = readFileSync(
      new URL('../src/index.ts', import.meta.url),
      'utf8',
    )
    let publicTypeSource = ''

    expect(() => {
      publicTypeSource = readFileSync(
        new URL('../src/workspace-persistence-types.ts', import.meta.url),
        'utf8',
      )
    }).not.toThrow()
    expect(indexSource).toMatch(
      /export\s+\{[\s\S]*WORKSPACE_PERSISTENCE_METADATA_SCOPE[\s\S]*workspacePersistenceArtifactId[\s\S]*workspacePersistenceBlobKey[\s\S]*workspacePersistenceManifestKey[\s\S]*\}\s+from '\.\/workspace-persistence-types'/,
    )
    expect(indexSource).toMatch(
      /export type\s+\{[\s\S]*WorkspacePersistenceManifest[\s\S]*WorkspacePersistenceOptions[\s\S]*\}\s+from '\.\/workspace-persistence-types'/,
    )
    expect(indexSource).not.toMatch(
      /export\s+\{[\s\S]*WORKSPACE_PERSISTENCE_METADATA_SCOPE[\s\S]*workspacePersistenceArtifactId[\s\S]*workspacePersistenceManifestKey[\s\S]*\}\s+from '\.\/workspace-persistence'/,
    )
    expect(publicTypeSource).not.toContain('@tanstack/ai-persistence')
  })

  it('replays delete tombstones during restore', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/removed.ts'
    handle.files.set(path, encoder.encode('bootstrap file'))

    await persistence.stores.metadata?.set(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
      {
        version: 1,
        files: {},
        deleted: {
          [path]: 1,
        },
      },
    )

    const sandbox = workspaceSandbox(handle)

    await collect(
      chat({
        adapter: adapter(() => undefined),
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'restore deleted file' }],
        middleware: [withChatPersistence(persistence), withSandbox(sandbox)],
      }),
    )

    expect(handle.files.has(path)).toBe(false)
    expect(handle.removed).toContain(path)
  })

  it('does not fail strict restore when a tombstoned file is already absent', async () => {
    const persistence = memoryPersistence()
    const handle = fakeWorkspaceHandle()
    const path = '/workspace/src/already-removed.ts'
    handle.fs.remove = (removePath) => {
      if (!handle.files.has(removePath)) {
        return Promise.reject(
          new Error(`ENOENT: no such file or directory, unlink ${removePath}`),
        )
      }
      handle.removed.push(removePath)
      handle.files.delete(removePath)
      return Promise.resolve()
    }

    await persistence.stores.metadata?.set(
      WORKSPACE_PERSISTENCE_METADATA_SCOPE,
      workspacePersistenceManifestKey('project-123'),
      {
        version: 1,
        files: {},
        deleted: {
          [path]: 1,
        },
      },
    )

    await expect(
      collect(
        chat({
          adapter: adapter(() => undefined),
          threadId: 'thread-1',
          runId: 'run-1',
          messages: [{ role: 'user', content: 'restore deleted file' }],
          middleware: [
            withChatPersistence(persistence),
            withSandbox(workspaceSandbox(handle)),
          ],
        }),
      ),
    ).resolves.toBeUndefined()

    expect(handle.removed).not.toContain(path)
  })
})
