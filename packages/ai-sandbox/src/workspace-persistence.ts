import {
  WORKSPACE_PERSISTENCE_METADATA_SCOPE,
  workspacePersistenceArtifactId,
  workspacePersistenceManifestKey,
} from './workspace-persistence-types'
import type { SandboxFileEvent } from '@tanstack/ai'
import type { AIPersistence } from '@tanstack/ai-persistence'
import type { SandboxHandle } from './contracts'
import type {
  ResolvedWorkspacePersistenceOptions,
  WorkspacePersistenceManifest,
} from './workspace-persistence-types'

export {
  WORKSPACE_PERSISTENCE_METADATA_SCOPE,
  resolveWorkspacePersistenceOptions,
  workspacePersistenceArtifactId,
  workspacePersistenceManifestKey,
} from './workspace-persistence-types'
export type {
  ResolvedWorkspacePersistenceOptions,
  WorkspacePersistenceManifest,
  WorkspacePersistenceOptions,
} from './workspace-persistence-types'

export interface WorkspacePersistenceRunContext {
  handle: SandboxHandle
  persistence: AIPersistence | undefined
  options: ResolvedWorkspacePersistenceOptions
  runId: string
  threadId: string
}

export async function restoreWorkspacePersistence(
  context: WorkspacePersistenceRunContext,
): Promise<void> {
  await runWorkspacePersistence(context.options, async () => {
    const stores = requiredStores(context)
    const manifest = await readManifest(stores.metadata, context.options.key)
    for (const path of Object.keys(manifest.deleted)) {
      if (!shouldPersistPath(path, context.options)) continue
      await removeIfPresent(context.handle, path)
    }
    for (const [path, file] of Object.entries(manifest.files)) {
      if (!shouldPersistPath(path, context.options)) continue
      const artifact = await stores.artifacts.get(file.artifactId)
      if (!artifact?.bytes) {
        throw new Error(
          `Workspace persistence artifact is missing for "${path}"`,
        )
      }
      await mkdirParents(context.handle, path, context.options.root)
      await context.handle.fs.write(path, artifact.bytes)
    }
  })
}

export function checkpointWorkspacePersistenceEvent(
  context: WorkspacePersistenceRunContext,
  event: SandboxFileEvent,
): Promise<void> {
  return runWorkspacePersistence(context.options, async () => {
    const stores = requiredStores(context)
    if (!shouldPersistPath(event.path, context.options)) return

    await withOptionalLock(
      stores.locks,
      `workspace-persistence:${context.options.key}`,
      async () => {
        const manifest = await readManifest(
          stores.metadata,
          context.options.key,
        )

        if (event.type === 'delete') {
          delete manifest.files[event.path]
          manifest.deleted[event.path] = event.timestamp
          await writeManifest(stores.metadata, context.options.key, manifest)
          return
        }

        let bytes: Uint8Array
        try {
          bytes = await context.handle.fs.readBytes(event.path)
        } catch (error) {
          if (!isMissingFileError(error)) throw error
          delete manifest.files[event.path]
          manifest.deleted[event.path] = event.timestamp
          await writeManifest(stores.metadata, context.options.key, manifest)
          return
        }
        if (bytes.byteLength > context.options.maxFileBytes) {
          throw new Error(
            `Workspace persistence skipped "${event.path}" because it is ${bytes.byteLength} bytes, exceeding maxFileBytes ${context.options.maxFileBytes}`,
          )
        }

        const artifactId = workspacePersistenceArtifactId(
          context.options.key,
          event.path,
        )
        await stores.artifacts.save({
          artifactId,
          runId: context.runId,
          threadId: context.threadId,
          name: event.path,
          mimeType: 'application/octet-stream',
          size: bytes.byteLength,
          bytes,
          createdAt: event.timestamp,
        })
        manifest.files[event.path] = {
          artifactId,
          size: bytes.byteLength,
          updatedAt: event.timestamp,
        }
        delete manifest.deleted[event.path]
        await writeManifest(stores.metadata, context.options.key, manifest)
      },
    )
  })
}

function requiredStores(context: WorkspacePersistenceRunContext): {
  metadata: NonNullable<AIPersistence['stores']['metadata']>
  artifacts: NonNullable<AIPersistence['stores']['artifacts']>
  locks: AIPersistence['stores']['locks']
} {
  const metadata = context.persistence?.stores.metadata
  const artifacts = context.persistence?.stores.artifacts
  if (!metadata || !artifacts) {
    throw new Error(
      'Workspace persistence requires AIPersistence stores.metadata and stores.artifacts',
    )
  }
  return { metadata, artifacts, locks: context.persistence?.stores.locks }
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
  locks: AIPersistence['stores']['locks'],
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!locks) return fn()
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
  if (isWorkspacePersistenceManifest(value)) return value
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
