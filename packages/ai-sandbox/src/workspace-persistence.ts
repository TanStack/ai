import {
  WORKSPACE_PERSISTENCE_METADATA_SCOPE,
  workspacePersistenceArtifactId,
  workspacePersistenceBlobKey,
  workspacePersistenceManifestKey,
} from './workspace-persistence-types'
import type { LockStore, SandboxFileEvent } from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  MetadataStore,
} from '@tanstack/ai-persistence'
import type { SandboxHandle } from './contracts'
import type {
  ResolvedWorkspacePersistenceOptions,
  WorkspacePersistenceManifest,
} from './workspace-persistence-types'

export {
  WORKSPACE_PERSISTENCE_METADATA_SCOPE,
  resolveWorkspacePersistenceOptions,
  workspacePersistenceArtifactId,
  workspacePersistenceBlobKey,
  workspacePersistenceManifestKey,
} from './workspace-persistence-types'
export type {
  ResolvedWorkspacePersistenceOptions,
  WorkspacePersistenceManifest,
  WorkspacePersistenceOptions,
} from './workspace-persistence-types'

export interface WorkspacePersistenceRunContext {
  handle: SandboxHandle
  persistence: WorkspacePersistence
  options: ResolvedWorkspacePersistenceOptions
  runId: string
  threadId: string
}

type DeletableArtifactStore = ArtifactStore & {
  delete: (artifactId: string) => Promise<void>
}

function isDeletableArtifactStore(
  store: ArtifactStore,
): store is DeletableArtifactStore {
  return typeof store.delete === 'function'
}

export type WorkspacePersistence = AIPersistence<{
  metadata: MetadataStore
  artifacts: DeletableArtifactStore
  blobs: BlobStore
  locks?: LockStore
}>

export function requireWorkspacePersistence(
  persistence: AIPersistence | undefined,
): WorkspacePersistence {
  const metadata = persistence?.stores.metadata
  const artifacts = persistence?.stores.artifacts
  const blobs = persistence?.stores.blobs
  if (
    !metadata ||
    !artifacts ||
    !isDeletableArtifactStore(artifacts) ||
    !blobs
  ) {
    throw new Error(
      'Workspace persistence requires AIPersistence stores.metadata, stores.artifacts with delete(), and stores.blobs',
    )
  }
  return {
    stores: {
      metadata,
      artifacts,
      blobs,
      ...(persistence.stores.locks ? { locks: persistence.stores.locks } : {}),
    },
  }
}

export async function restoreWorkspacePersistence(
  context: WorkspacePersistenceRunContext,
): Promise<void> {
  await runWorkspacePersistence(context.options, async () => {
    const stores = context.persistence.stores
    const manifest = await readManifest(stores.metadata, context.options.key)
    for (const path of Object.keys(manifest.deleted)) {
      if (!shouldPersistPath(path, context.options)) continue
      await removeIfPresent(context.handle, path)
    }
    for (const [path, file] of Object.entries(manifest.files)) {
      if (!shouldPersistPath(path, context.options)) continue
      const artifact = await stores.artifacts.get(file.artifactId)
      const blob = await stores.blobs.get(file.blobKey)
      if (!artifact || !blob) {
        throw new Error(
          `Workspace persistence artifact or blob is missing for "${path}"`,
        )
      }
      await mkdirParents(context.handle, path, context.options.root)
      await context.handle.fs.write(
        path,
        new Uint8Array(await blob.arrayBuffer()),
      )
    }
  })
}

export function checkpointWorkspacePersistenceEvent(
  context: WorkspacePersistenceRunContext,
  event: SandboxFileEvent,
): Promise<void> {
  return runWorkspacePersistence(context.options, async () => {
    const stores = context.persistence.stores
    if (!shouldPersistPath(event.path, context.options)) return

    await withOptionalLock(
      stores.locks,
      `workspace-persistence:${context.options.key}`,
      async (lockSignal) => {
        const manifest = await readManifest(
          stores.metadata,
          context.options.key,
        )
        lockSignal.throwIfAborted()

        if (event.type === 'delete') {
          const previous = manifest.files[event.path]
          delete manifest.files[event.path]
          manifest.deleted[event.path] = event.timestamp
          lockSignal.throwIfAborted()
          await writeManifest(stores.metadata, context.options.key, manifest)
          if (previous) await deleteRevision(stores, previous)
          return
        }

        let bytes: Uint8Array
        try {
          bytes = await context.handle.fs.readBytes(event.path)
        } catch (error) {
          if (!isMissingFileError(error)) throw error
          const previous = manifest.files[event.path]
          delete manifest.files[event.path]
          manifest.deleted[event.path] = event.timestamp
          lockSignal.throwIfAborted()
          await writeManifest(stores.metadata, context.options.key, manifest)
          if (previous) await deleteRevision(stores, previous)
          return
        }
        if (bytes.byteLength > context.options.maxFileBytes) {
          throw new Error(
            `Workspace persistence skipped "${event.path}" because it is ${bytes.byteLength} bytes, exceeding maxFileBytes ${context.options.maxFileBytes}`,
          )
        }

        const previous = manifest.files[event.path]
        const revision = `${event.timestamp}:${crypto.randomUUID()}`
        const next = {
          artifactId: workspacePersistenceArtifactId(
            context.options.key,
            event.path,
            revision,
          ),
          blobKey: workspacePersistenceBlobKey(
            context.options.key,
            event.path,
            revision,
          ),
          size: bytes.byteLength,
          updatedAt: event.timestamp,
        }
        let blobWritten = false
        let artifactAttempted = false
        let manifestCommitAttempted = false
        try {
          lockSignal.throwIfAborted()
          await stores.blobs.put(next.blobKey, bytes, {
            contentType: 'application/octet-stream',
          })
          blobWritten = true
          lockSignal.throwIfAborted()
          artifactAttempted = true
          await stores.artifacts.save({
            artifactId: next.artifactId,
            runId: context.runId,
            threadId: context.threadId,
            name: event.path,
            mimeType: 'application/octet-stream',
            size: bytes.byteLength,
            createdAt: event.timestamp,
          })
          lockSignal.throwIfAborted()
          manifest.files[event.path] = next
          delete manifest.deleted[event.path]
          manifestCommitAttempted = true
          await writeManifest(stores.metadata, context.options.key, manifest)
        } catch (error) {
          if (manifestCommitAttempted) {
            // A rejected metadata write may still have committed. Retaining both
            // revisions is the only safe compensation while its result is unknown.
            throw error
          }
          await cleanupFailedRevision(
            stores,
            next,
            { blobWritten, artifactAttempted },
            error,
          )
        }

        if (
          previous &&
          (previous.artifactId !== next.artifactId ||
            previous.blobKey !== next.blobKey)
        ) {
          await deleteRevision(stores, previous)
        }
      },
    )
  })
}

async function runWorkspacePersistence(
  options: ResolvedWorkspacePersistenceOptions,
  fn: () => Promise<void>,
): Promise<void> {
  if (options.consistency === 'strict') {
    await fn()
    return
  }
  try {
    await fn()
  } catch {
    // best-effort persistence must not fail the sandbox run
  }
}

async function withOptionalLock<T>(
  locks: LockStore | undefined,
  key: string,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!locks) return fn(new AbortController().signal)
  return locks.withLock(key, fn)
}

async function readManifest(
  metadata: NonNullable<AIPersistence['stores']['metadata']>,
  key: string,
): Promise<WorkspacePersistenceManifest> {
  const value = await metadata.get(
    WORKSPACE_PERSISTENCE_METADATA_SCOPE,
    workspacePersistenceManifestKey(key),
  )
  if (value === null) return emptyManifest()
  if (isWorkspacePersistenceManifest(value)) return cloneManifest(value)
  throw new Error('Workspace persistence manifest is invalid')
}

async function writeManifest(
  metadata: NonNullable<AIPersistence['stores']['metadata']>,
  key: string,
  manifest: WorkspacePersistenceManifest,
): Promise<void> {
  await metadata.set(
    WORKSPACE_PERSISTENCE_METADATA_SCOPE,
    workspacePersistenceManifestKey(key),
    manifest,
  )
}

function emptyManifest(): WorkspacePersistenceManifest {
  return { version: 1, files: {}, deleted: {} }
}

function cloneManifest(
  manifest: WorkspacePersistenceManifest,
): WorkspacePersistenceManifest {
  return {
    version: 1,
    files: Object.fromEntries(
      Object.entries(manifest.files).map(([path, file]) => [path, { ...file }]),
    ),
    deleted: { ...manifest.deleted },
  }
}

async function deleteRevision(
  stores: WorkspacePersistence['stores'],
  revision: { artifactId: string; blobKey: string },
): Promise<void> {
  const failures: Array<unknown> = []
  try {
    await stores.artifacts.delete(revision.artifactId)
  } catch (error) {
    failures.push(error)
  }
  try {
    await stores.blobs.delete(revision.blobKey)
  } catch (error) {
    failures.push(error)
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      `Workspace persistence failed to delete revision ${revision.artifactId}`,
    )
  }
}

async function cleanupFailedRevision(
  stores: WorkspacePersistence['stores'],
  revision: { artifactId: string; blobKey: string },
  written: { blobWritten: boolean; artifactAttempted: boolean },
  originalError: unknown,
): Promise<never> {
  const failures: Array<unknown> = [originalError]
  if (written.artifactAttempted) {
    try {
      await stores.artifacts.delete(revision.artifactId)
    } catch (error) {
      failures.push(error)
    }
  }
  if (written.blobWritten) {
    try {
      await stores.blobs.delete(revision.blobKey)
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length === 1) throw originalError
  throw new AggregateError(
    failures,
    `Workspace persistence write and cleanup failed for ${revision.artifactId}`,
  )
}

function isWorkspacePersistenceManifest(
  value: unknown,
): value is WorkspacePersistenceManifest {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.version === 1 &&
    isRecord(record.files) &&
    Object.values(record.files).every(isManifestFile) &&
    isNumberRecord(record.deleted)
  )
}

function isManifestFile(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.artifactId === 'string' &&
    typeof record.blobKey === 'string' &&
    typeof record.size === 'number' &&
    typeof record.updatedAt === 'number'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) && Object.values(value).every((v) => typeof v === 'number')
  )
}

function shouldPersistPath(
  path: string,
  options: ResolvedWorkspacePersistenceOptions,
): boolean {
  const root = trimTrailingSlash(options.root)
  if (hasTraversalSegment(path) || hasTraversalSegment(root)) return false
  if (path !== root && !path.startsWith(`${root}/`)) return false
  const relative = path === root ? '' : path.slice(root.length + 1)
  if (relative === '') return false
  if (
    options.include &&
    !options.include.some((p) => matchesPattern(path, relative, p))
  ) {
    return false
  }
  return !options.exclude.some((p) => matchesPattern(path, relative, p))
}

function matchesPattern(
  path: string,
  relative: string,
  pattern: string,
): boolean {
  if (pattern === '') return false
  if (pattern.startsWith('/')) return globToRegExp(pattern).test(path)
  if (globToRegExp(pattern).test(relative)) return true
  return relative
    .split('/')
    .some((segment) => globToRegExp(pattern).test(segment))
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('**')
    .map((part) =>
      part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
    )
    .join('.*')
  return new RegExp(`^${escaped}$`)
}

async function mkdirParents(
  handle: SandboxHandle,
  path: string,
  root: string,
): Promise<void> {
  const parent = path.slice(0, path.lastIndexOf('/'))
  const normalizedRoot = trimTrailingSlash(root)
  if (
    !parent ||
    parent === normalizedRoot ||
    !parent.startsWith(`${normalizedRoot}/`)
  ) {
    return
  }

  const parts = parent.slice(normalizedRoot.length + 1).split('/')
  let current = normalizedRoot
  for (const part of parts) {
    current = `${current}/${part}`
    await handle.fs.mkdir(current)
  }
}

async function removeIfPresent(
  handle: SandboxHandle,
  path: string,
): Promise<void> {
  if (!(await handle.fs.exists(path))) return
  try {
    await handle.fs.remove(path)
  } catch (error) {
    if (!isMissingFileError(error)) throw error
  }
}

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

function hasTraversalSegment(path: string): boolean {
  return path.split('/').some((segment) => segment === '..')
}

function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('enoent') ||
    message.includes('no such file') ||
    message.includes('not found')
  )
}
