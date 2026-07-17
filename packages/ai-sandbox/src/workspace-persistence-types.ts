import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import type { WorkspaceDefinition } from './workspace'

export const WORKSPACE_PERSISTENCE_METADATA_SCOPE =
  'tanstack.ai.sandbox.workspace'

export interface WorkspacePersistenceOptions {
  key?: string
  root?: string
  include?: Array<string>
  exclude?: Array<string>
  maxFileBytes?: number
  consistency?: 'strict' | 'best-effort'
}

export interface WorkspacePersistenceManifest {
  version: 1
  files: Record<
    string,
    {
      artifactId: string
      blobKey: string
      size: number
      updatedAt: number
    }
  >
  deleted: Record<string, number>
}

export interface ResolvedWorkspacePersistenceOptions {
  key: string
  root: string
  include?: Array<string>
  exclude: Array<string>
  maxFileBytes: number
  consistency: 'strict' | 'best-effort'
}

const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024
const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  '.env*',
]

export function workspacePersistenceManifestKey(key: string): string {
  return `workspace:${key}:manifest`
}

export function workspacePersistenceArtifactId(
  key: string,
  path: string,
  revision: string,
): string {
  return `workspace:${key}:file:${encodeURIComponent(path)}:${encodeURIComponent(revision)}`
}

export function workspacePersistenceBlobKey(
  key: string,
  path: string,
  revision: string,
): string {
  return `workspace:${key}:blob:${encodeURIComponent(path)}:${encodeURIComponent(revision)}`
}

export function resolveWorkspacePersistenceOptions(input: {
  workspacePersistence: boolean | WorkspacePersistenceOptions | undefined
  workspace: WorkspaceDefinition | undefined
  defaultKey: string
}): ResolvedWorkspacePersistenceOptions | undefined {
  if (
    input.workspacePersistence === undefined ||
    input.workspacePersistence === false
  ) {
    return undefined
  }

  const options =
    input.workspacePersistence === true ? {} : input.workspacePersistence
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new Error(
      `workspacePersistence.maxFileBytes must be a positive safe integer, received ${maxFileBytes}`,
    )
  }

  return {
    key: options.key ?? input.defaultKey,
    root: options.root ?? input.workspace?.root ?? DEFAULT_WORKSPACE_ROOT,
    include: options.include,
    exclude: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])],
    maxFileBytes,
    consistency: options.consistency ?? 'strict',
  }
}
